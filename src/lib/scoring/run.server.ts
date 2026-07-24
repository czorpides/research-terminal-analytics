import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { computeConfidence } from "@/lib/reliability/confidence";
import { computeMomentum, MOMENTUM_CALC_VERSION } from "./momentum.server";
import { computeTrend, TREND_CALC_VERSION } from "./trend.server";
import { computeVolatility, VOL_CALC_VERSION } from "./volatility.server";
import {
  loadLatestFundamentals,
  computeValuationScore,
  computeQualityScore,
} from "./valuation.server";
import { FUNDAMENTAL_METRICS } from "@/lib/ingestion/fundamentals/metrics";
import { loadAnnualFinancialHistory } from "@/lib/opportunity/fundamental-history.server";
import {
  computeMagicFormulaRaw,
  computePiotroski,
  rankMagicFormula,
} from "@/lib/opportunity/fundamental-models";
import type { Bar } from "./series";

export interface ScoreRunResult {
  assetsScored: number;
  failures: number;
}
export interface ScoreRunResultDetailed extends ScoreRunResult {
  blocked: number;
  blockedAssets: string[];
  fundamentalsScored: number;
}
export interface FundamentalScoreRunResult {
  assetsEvaluated: number;
  fundamentalsScored: number;
  rowsInserted: number;
}

interface FundamentalAsset {
  id: string;
  industry_id: string | null;
}

async function loadBars(assetId: string): Promise<Bar[]> {
  const { data } = await supabaseAdmin
    .from("prices_daily")
    .select("trade_date, close, volume")
    .eq("asset_id", assetId)
    .order("trade_date", { ascending: true })
    .limit(2000);
  return (data ?? [])
    .filter((r) => r.close !== null)
    .map((r) => ({
      date: r.trade_date as string,
      close: Number(r.close),
      volume: r.volume === null ? null : Number(r.volume),
    }));
}

export async function runScoresForAsset(assetId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    // Quality gate: block scoring if the latest Stooq ingestion run for this
    // asset's symbol was blocked by QC.
    const { data: asset } = await supabaseAdmin
      .from("assets")
      .select("symbol")
      .eq("id", assetId)
      .maybeSingle();
    const symbol = asset?.symbol as string | undefined;
    if (symbol) {
      const { data: stooqSource } = await supabaseAdmin
        .from("data_sources")
        .select("id")
        .eq("provider_code", "stooq")
        .maybeSingle();
      if (stooqSource?.id) {
        const { data: recent } = await supabaseAdmin
          .from("ingestion_runs")
          .select("status, error, details, started_at")
          .eq("source_id", stooqSource.id as string)
          .eq("data_category", "price_daily")
          .order("started_at", { ascending: false })
          .limit(200);
        const match = (recent ?? []).find((r) => {
          const d = r.details as { symbol?: string } | null;
          return d?.symbol === symbol;
        });
        if (match && match.status === "failed") {
          return { ok: false, error: `quality_gate_blocked: ${match.error ?? "unknown"}` };
        }
      }
    }

    const bars = await loadBars(assetId);
    if (bars.length === 0) return { ok: false, error: "no prices" };
    const latest = bars[bars.length - 1];
    const ageSec = Math.max(
      0,
      Math.floor((Date.now() - new Date(`${latest.date}T21:00:00Z`).getTime()) / 1000),
    );
    const dataConf = computeConfidence({
      tier: "tier2_regulated",
      category: "price_daily",
      ageSeconds: ageSec,
    });

    const momo = computeMomentum(bars);
    const trend = computeTrend(bars);
    const vol = computeVolatility(bars);
    const now = new Date().toISOString();

    const rows = [
      {
        subject_type: "asset",
        subject_id: assetId,
        score_type: "momentum",
        value: momo.value,
        confidence: Math.round(dataConf.value * 0.9),
        calc_version: MOMENTUM_CALC_VERSION,
        computed_at: now,
        inputs: momo.inputs,
        weights: {},
        positives: momo.positives,
        deductions: momo.deductions,
      },
      {
        subject_type: "asset",
        subject_id: assetId,
        score_type: "trend",
        value: trend.value,
        confidence: dataConf.value,
        calc_version: TREND_CALC_VERSION,
        computed_at: now,
        inputs: trend.inputs,
        weights: {},
        positives: trend.positives,
        deductions: trend.deductions,
      },
      {
        subject_type: "asset",
        subject_id: assetId,
        score_type: "volatility",
        value: vol.value,
        confidence: dataConf.value,
        calc_version: VOL_CALC_VERSION,
        computed_at: now,
        inputs: vol.inputs,
        weights: {},
        positives: vol.positives,
        deductions: vol.deductions,
      },
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabaseAdmin.from("scores").insert(rows as any);
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function runScoresForAllAssets(): Promise<ScoreRunResultDetailed> {
  const { data: assets } = await supabaseAdmin
    .from("assets")
    .select("id, industry_id")
    .eq("active", true);
  let ok = 0,
    failed = 0,
    blocked = 0,
    fundOk = 0;
  const blockedAssets: string[] = [];
  for (const a of assets ?? []) {
    const r = await runScoresForAsset(a.id as string);
    if (r.ok) ok++;
    else if (r.error?.startsWith("quality_gate_blocked")) {
      blocked++;
      blockedAssets.push(a.id as string);
    } else failed++;
  }

  const fundamentals = await runFundamentalScoresForAllAssets(
    (assets ?? []).map((asset) => ({
      id: asset.id as string,
      industry_id: (asset.industry_id as string) ?? null,
    })),
  );
  fundOk = fundamentals.fundamentalsScored;

  return { assetsScored: ok, failures: failed, blocked, blockedAssets, fundamentalsScored: fundOk };
}

/**
 * Recompute peer-relative valuation and quality without re-reading every
 * asset's price history. Earnings refreshes use this lightweight pass after a
 * company publishes new fundamentals.
 */
export async function runFundamentalScoresForAllAssets(
  suppliedAssets?: FundamentalAsset[],
): Promise<FundamentalScoreRunResult> {
  let all = suppliedAssets;
  if (!all) {
    const { data: assets, error } = await supabaseAdmin
      .from("assets")
      .select("id,industry_id")
      .eq("active", true);
    if (error) throw error;
    all = (assets ?? []).map((asset) => ({
      id: asset.id as string,
      industry_id: (asset.industry_id as string) ?? null,
    }));
  }
  const peersByIndustry = new Map<string | null, typeof all>();
  for (const a of all) {
    const arr = peersByIndustry.get(a.industry_id) ?? [];
    arr.push(a);
    peersByIndustry.set(a.industry_id, arr);
  }
  const assetIds = all.map((asset) => asset.id);
  const latest = await loadLatestFundamentals(assetIds);
  const histories = await loadAnnualFinancialHistory(assetIds);
  const industryIds = [
    ...new Set(
      all.map((asset) => asset.industry_id).filter((value): value is string => Boolean(value)),
    ),
  ];
  const { data: industryRows, error: industryError } = industryIds.length
    ? await supabaseAdmin.from("industries").select("id,code").in("id", industryIds)
    : { data: [], error: null };
  if (industryError) throw industryError;
  const industryCodes = new Map(
    (industryRows ?? []).map((row) => [String(row.id), String(row.code)]),
  );
  const magicRanks = rankMagicFormula(
    all.map((asset) =>
      computeMagicFormulaRaw({
        assetId: asset.id,
        industryId: asset.industry_id,
        industryCode: asset.industry_id ? (industryCodes.get(asset.industry_id) ?? null) : null,
        period: histories.get(asset.id)?.[0] ?? null,
        marketCap: latest.byMetric.get(FUNDAMENTAL_METRICS.marketCap)?.get(asset.id)?.value ?? null,
      }),
    ),
  );
  const magicByAsset = new Map(magicRanks.map((result) => [result.assetId, result]));
  const now = new Date().toISOString();
  const fundRows: Array<Record<string, unknown>> = [];
  let fundOk = 0;
  for (const a of all) {
    const val = computeValuationScore(a, latest, peersByIndustry, all);
    const qua = computeQualityScore(a, latest, peersByIndustry, all);
    if (val) {
      fundRows.push({
        subject_type: "asset",
        subject_id: a.id,
        score_type: "valuation",
        value: val.value,
        confidence: val.confidence,
        calc_version: val.calcVersion,
        computed_at: now,
        inputs: val.inputs,
        weights: val.weights,
        positives: val.positives,
        deductions: val.deductions,
      });
      fundOk++;
    }
    if (qua) {
      fundRows.push({
        subject_type: "asset",
        subject_id: a.id,
        score_type: "quality",
        value: qua.value,
        confidence: qua.confidence,
        calc_version: qua.calcVersion,
        computed_at: now,
        inputs: qua.inputs,
        weights: qua.weights,
        positives: qua.positives,
        deductions: qua.deductions,
      });
    }
    const piotroski = computePiotroski(histories.get(a.id) ?? []);
    if (piotroski.availableTests > 0) {
      fundRows.push({
        subject_type: "asset",
        subject_id: a.id,
        score_type: "piotroski",
        value: (piotroski.provisionalScore / 9) * 100,
        confidence: piotroski.complete ? 85 : Math.min(60, Math.round(piotroski.coverage)),
        calc_version: piotroski.calcVersion,
        computed_at: now,
        inputs: {
          raw_score: piotroski.score,
          provisional_score: piotroski.provisionalScore,
          available_tests: piotroski.availableTests,
          coverage: piotroski.coverage,
          complete: piotroski.complete,
          current_period_end: piotroski.currentPeriodEnd,
          prior_period_end: piotroski.priorPeriodEnd,
          known_at: piotroski.knownAt,
          tests: piotroski.tests,
        },
        weights: Object.fromEntries(piotroski.tests.map((test) => [test.key, 1])),
        positives: piotroski.tests
          .filter((test) => test.passed === true)
          .map((test) => ({ id: `piotroski-${test.key}`, label: test.label, detail: test.detail })),
        deductions: piotroski.tests
          .filter((test) => test.passed !== true)
          .map((test) => ({
            id: `piotroski-${test.key}`,
            label: test.passed === false ? `${test.label} failed` : `${test.label} unavailable`,
            detail: test.detail,
          })),
      });
    }
    const magic = magicByAsset.get(a.id);
    if (magic && (magic.periodEnd || magic.exclusionReason)) {
      fundRows.push({
        subject_type: "asset",
        subject_id: a.id,
        score_type: "magic_formula",
        value: magic.universePercentile ?? 0,
        confidence: magic.eligible ? 80 : 0,
        calc_version: magic.calcVersion,
        computed_at: now,
        inputs: {
          eligible: magic.eligible,
          exclusion_reason: magic.exclusionReason,
          return_on_capital: magic.returnOnCapital,
          earnings_yield: magic.earningsYield,
          enterprise_value: magic.enterpriseValue,
          capital_employed: magic.capitalEmployed,
          ebit: magic.ebit,
          return_on_capital_rank: magic.returnOnCapitalRank,
          earnings_yield_rank: magic.earningsYieldRank,
          combined_rank_score: magic.combinedRankScore,
          universe_rank: magic.universeRank,
          universe_size: magic.universeSize,
          universe_percentile: magic.universePercentile,
          industry_rank: magic.industryRank,
          industry_size: magic.industrySize,
          industry_percentile: magic.industryPercentile,
          period_end: magic.periodEnd,
          known_at: magic.knownAt,
        },
        weights: { return_on_capital_rank: 1, earnings_yield_rank: 1 },
        positives:
          magic.eligible && (magic.universePercentile ?? 0) >= 75
            ? [
                {
                  id: "magic-formula-top-quartile",
                  label: "Magic Formula rank is in the top quartile",
                  detail: `${magic.universeRank} of ${magic.universeSize}`,
                },
              ]
            : [],
        deductions: magic.eligible
          ? []
          : [
              {
                id: "magic-formula-ineligible",
                label: "Not eligible for the generic Magic Formula universe",
                detail: magic.exclusionReason ?? "Eligibility inputs are unavailable.",
              },
            ],
      });
    }
  }
  if (fundRows.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabaseAdmin.from("scores").insert(fundRows as any);
    if (error) throw error;
  }
  return {
    assetsEvaluated: all.length,
    fundamentalsScored: fundOk,
    rowsInserted: fundRows.length,
  };
}
