import { createServerFn } from "@tanstack/react-start";

import { FUNDAMENTAL_METRICS } from "@/lib/ingestion/fundamentals/metrics";
import {
  HORIZON_CONFIGS,
  classificationLabel,
  computePriceDislocation,
  missingSignal,
  scoreOpportunityHorizon,
  type InvestmentHorizon,
  type OpportunityEvidence,
  type OpportunityHorizonScore,
  type OpportunitySignal,
  type OpportunitySignalKey,
  type SignalStatus,
} from "./model";
import type { PiotroskiTest } from "./fundamental-models";

const MAX_SHADOW_UNIVERSE = 3_000;
const HORIZONS: InvestmentHorizon[] = ["one_to_three", "three_to_five", "five_to_ten"];

interface ScoreRow {
  subject_id: string;
  score_type: string;
  value: number;
  confidence: number;
  inputs: Record<string, unknown>;
  positives: Array<{ id: string; label: string; detail?: string }>;
  deductions: Array<{ id: string; label: string; detail?: string }>;
  computed_at: string;
  calc_version: string;
}

export type DiscoveryRoute = "price_dislocation" | "magic_formula" | "improving_value";

export interface CandidateFunnel {
  routes: DiscoveryRoute[];
  nominated: boolean;
  shadowPriority: number;
  piotroskiValidation: "confirmation" | "neutral" | "warning" | "unavailable";
  detail: string;
}

export interface CandidateFundamentalModels {
  piotroski: {
    state: "complete" | "partial" | "missing";
    score: number | null;
    provisionalScore: number | null;
    availableTests: number;
    coverage: number;
    tests: PiotroskiTest[];
    knownAt: string | null;
  };
  magicFormula: {
    state: "ranked" | "ineligible" | "missing";
    eligible: boolean;
    exclusionReason: string | null;
    returnOnCapital: number | null;
    earningsYield: number | null;
    universeRank: number | null;
    universeSize: number;
    universePercentile: number | null;
    industryRank: number | null;
    industrySize: number;
    industryPercentile: number | null;
    periodEnd: string | null;
    knownAt: string | null;
  };
}

interface AssetRow {
  id: string;
  symbol: string;
  name: string;
  exchange: string | null;
  currency: string | null;
  industry_id: string | null;
  country_id: string | null;
}

interface EarningsRow {
  asset_id: string;
  scheduled_at: string;
  period_end: string | null;
  estimate_eps: number | null;
  actual_eps: number | null;
  surprise_pct: number | null;
}

export interface OpportunityCandidate {
  assetId: string;
  symbol: string;
  name: string;
  exchange: string | null;
  currency: string | null;
  countryCode: string;
  industryCode: string | null;
  industryName: string | null;
  price: number | null;
  priceAsOf: string | null;
  return12mPct: number | null;
  drawdownPct: number | null;
  sectorAdjustedReturnPct: number | null;
  sectorBreadthPct: number | null;
  latestEarningsSurprisePct: number | null;
  evidence: OpportunityEvidence;
  horizons: Record<InvestmentHorizon, OpportunityHorizonScore>;
  fundamentalModels: CandidateFundamentalModels;
  funnel: Record<InvestmentHorizon, CandidateFunnel>;
  narrative: {
    summary: string;
    detail: string;
    watch: string[];
  };
  macroControl: {
    status: "context_only" | "unavailable";
    detail: string;
  };
}

export interface HorizonSummary {
  horizon: InvestmentHorizon;
  label: string;
  scoreLabel: string;
  description: string;
  refresh: string;
  candidates: number;
  eligible: number;
  shadow: number;
  blocked: number;
  medianConfidence: number;
}

export interface CoverageGate {
  market: string;
  code: string;
  state: "shadow" | "blocked" | "disabled";
  trackedAssets: number;
  available: string;
  missing: string;
  activationRule: string;
}

export interface CapabilityGate {
  capability: string;
  state: "live" | "partial" | "missing";
  currentUse: string;
  productionRequirement: string;
}

export interface OpportunityRadarWorkspace {
  asOf: string;
  calcVersion: string;
  universe: {
    activeEquities: number;
    loaded: number;
    cap: number;
    truncated: boolean;
  };
  candidates: OpportunityCandidate[];
  horizonSummaries: HorizonSummary[];
  coverage: CoverageGate[];
  capabilities: CapabilityGate[];
  modelNote: string;
}

export const getOpportunityRadarWorkspace = createServerFn({ method: "GET" }).handler(
  async (): Promise<OpportunityRadarWorkspace> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count: activeEquities } = await supabaseAdmin
      .from("assets")
      .select("id", { count: "exact", head: true })
      .eq("active", true)
      .eq("asset_class", "equity");
    const { data: assetData, error: assetError } = await supabaseAdmin
      .from("assets")
      .select("id,symbol,name,exchange,currency,industry_id,country_id")
      .eq("active", true)
      .eq("asset_class", "equity")
      .order("symbol", { ascending: true })
      .limit(MAX_SHADOW_UNIVERSE);
    if (assetError) throw assetError;

    const assets = (assetData ?? []) as AssetRow[];
    if (assets.length === 0) {
      return emptyWorkspace(activeEquities ?? 0);
    }
    const assetIds = assets.map((asset) => asset.id);
    const industryIds = unique(
      assets.map((asset) => asset.industry_id).filter((id): id is string => Boolean(id)),
    );
    const countryIds = unique(
      assets.map((asset) => asset.country_id).filter((id): id is string => Boolean(id)),
    );
    const assetBatches = chunkValues(assetIds, 75);

    const [scorePages, pricePages, industryResult, countryResult, earningsPages] =
      await Promise.all([
        Promise.all(
          assetBatches.map((batch) =>
            supabaseAdmin
              .from("latest_asset_scores")
              .select(
                "subject_id,score_type,value,confidence,inputs,positives,deductions,computed_at,calc_version",
              )
              .in("subject_id", batch)
              .in("score_type", [
                "momentum",
                "trend",
                "volatility",
                "valuation",
                "quality",
                "piotroski",
                "magic_formula",
              ])
              .limit(batch.length * 7),
          ),
        ),
        Promise.all(
          assetBatches.map((batch) =>
            supabaseAdmin
              .from("prices_daily")
              .select("asset_id,trade_date,close")
              .in("asset_id", batch)
              .order("trade_date", { ascending: false })
              .limit(batch.length * 6),
          ),
        ),
        industryIds.length
          ? supabaseAdmin.from("industries").select("id,code,name").in("id", industryIds)
          : Promise.resolve({ data: [], error: null }),
        countryIds.length
          ? supabaseAdmin.from("countries").select("id,iso2,name").in("id", countryIds)
          : Promise.resolve({ data: [], error: null }),
        Promise.all(
          assetBatches.map((batch) =>
            supabaseAdmin
              .from("earnings_events")
              .select("asset_id,scheduled_at,period_end,estimate_eps,actual_eps,surprise_pct")
              .in("asset_id", batch)
              .order("scheduled_at", { ascending: false })
              .limit(batch.length * 4),
          ),
        ),
      ]);

    const scoreError = scorePages.find((result) => result.error)?.error;
    const priceError = pricePages.find((result) => result.error)?.error;
    const earningsError = earningsPages.find((result) => result.error)?.error;
    if (scoreError) throw scoreError;
    if (priceError) throw priceError;
    if (industryResult.error) throw industryResult.error;
    if (countryResult.error) throw countryResult.error;
    if (earningsError) throw earningsError;

    const latestScores = latestScoresByAsset(
      scorePages.flatMap((result) => result.data ?? []) as unknown as ScoreRow[],
    );
    const latestPrices = new Map<string, { close: number; tradeDate: string }>();
    for (const row of pricePages.flatMap((result) => result.data ?? [])) {
      const assetId = String(row.asset_id);
      if (!latestPrices.has(assetId) && row.close !== null) {
        latestPrices.set(assetId, {
          close: Number(row.close),
          tradeDate: String(row.trade_date),
        });
      }
    }
    const industries = new Map(
      (industryResult.data ?? []).map((row) => [
        String(row.id),
        { code: String(row.code), name: String(row.name) },
      ]),
    );
    const countries = new Map(
      (countryResult.data ?? []).map((row) => [
        String(row.id),
        { code: String(row.iso2), name: String(row.name) },
      ]),
    );
    const earnings = latestEarningsByAsset(
      earningsPages.flatMap((result) => result.data ?? []) as unknown as EarningsRow[],
    );

    const returnsByIndustry = new Map<string, Array<{ assetId: string; value: number }>>();
    const allReturns: Array<{ assetId: string; value: number }> = [];
    for (const asset of assets) {
      const momentum = latestScores.get(asset.id)?.momentum;
      const value = finite(momentum?.inputs.ret12m);
      if (value === null) continue;
      allReturns.push({ assetId: asset.id, value });
      const key = asset.industry_id ?? "unknown";
      returnsByIndustry.set(key, [
        ...(returnsByIndustry.get(key) ?? []),
        { assetId: asset.id, value },
      ]);
    }

    const candidates = assets.map((asset) => {
      const scoreBag = latestScores.get(asset.id) ?? {};
      const latestPrice = latestPrices.get(asset.id) ?? null;
      const industry = asset.industry_id ? (industries.get(asset.industry_id) ?? null) : null;
      const country = asset.country_id ? (countries.get(asset.country_id) ?? null) : null;
      const countryCode = country?.code ?? inferCountry(asset.exchange);
      const peerReturns = (returnsByIndustry.get(asset.industry_id ?? "unknown") ?? []).filter(
        (item) => item.assetId !== asset.id,
      );
      const broadReturns = allReturns.filter((item) => item.assetId !== asset.id);
      const context = buildPriceContext(scoreBag, peerReturns, broadReturns);
      const latestEarnings = earnings.get(asset.id) ?? [];
      const sectorBlocks = sectorModelBlocks(industry?.code ?? null);
      const evidence = buildEvidence(scoreBag, context, latestEarnings);
      const fundamentalModels = buildFundamentalModels(scoreBag);
      const horizons = Object.fromEntries(
        HORIZONS.map((horizon) => [
          horizon,
          scoreOpportunityHorizon(horizon, evidence, sectorBlocks),
        ]),
      ) as Record<InvestmentHorizon, OpportunityHorizonScore>;
      const funnel = Object.fromEntries(
        HORIZONS.map((horizon) => [
          horizon,
          buildCandidateFunnel(horizon, horizons[horizon], fundamentalModels, scoreBag.valuation),
        ]),
      ) as Record<InvestmentHorizon, CandidateFunnel>;
      const primary = horizons.one_to_three;
      const narrative = buildNarrative(
        asset,
        industry,
        context,
        primary,
        evidence,
        latestEarnings[0] ?? null,
        fundamentalModels,
      );

      return {
        assetId: asset.id,
        symbol: asset.symbol,
        name: asset.name,
        exchange: asset.exchange,
        currency: asset.currency,
        countryCode,
        industryCode: industry?.code ?? null,
        industryName: industry?.name ?? null,
        price: latestPrice?.close ?? finite(scoreBag.trend?.inputs.cur),
        priceAsOf: latestPrice?.tradeDate ?? null,
        return12mPct: toPercent(context.return12m),
        drawdownPct: toPercent(context.drawdown),
        sectorAdjustedReturnPct: toPercent(context.residualReturn),
        sectorBreadthPct:
          context.sectorBreadth === null ? null : round1(context.sectorBreadth * 100),
        latestEarningsSurprisePct: latestEarnings[0]?.surprise_pct ?? null,
        evidence,
        horizons,
        fundamentalModels,
        funnel,
        narrative,
        macroControl: {
          status: countryCode === "US" ? "context_only" : "unavailable",
          detail:
            countryCode === "US"
              ? "The live US macro regime is shown above. It is not yet allowed to change this score until security-level rate, currency, commodity and style exposures pass validation."
              : "A validated country-level macro engine and security exposure model are not active for this market.",
        },
      } satisfies OpportunityCandidate;
    });

    const asOf =
      candidates
        .map((candidate) => candidate.priceAsOf)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? new Date().toISOString();
    const horizonSummaries = HORIZONS.map((horizon) => summariseHorizon(horizon, candidates));
    const universeCount = activeEquities ?? assets.length;

    return {
      asOf,
      calcVersion: "opportunity.horizons.v0.2",
      universe: {
        activeEquities: universeCount,
        loaded: assets.length,
        cap: MAX_SHADOW_UNIVERSE,
        truncated: universeCount > assets.length,
      },
      candidates,
      horizonSummaries,
      coverage: coverageGates(candidates),
      capabilities: capabilityGates(),
      modelNote:
        "The model ranks the tracked universe in shadow mode. Price dislocation, Magic Formula and improving-value routes can nominate research candidates; missing evidence lowers confidence and is never silently estimated.",
    };
  },
);

type ScoreBag = Partial<
  Record<
    "momentum" | "trend" | "volatility" | "valuation" | "quality" | "piotroski" | "magic_formula",
    ScoreRow
  >
>;

interface PriceContext {
  return12m: number | null;
  drawdown: number | null;
  residualReturn: number | null;
  sectorBreadth: number | null;
  peerCount: number;
  usedBroadPeers: boolean;
  absolutePriceDamage: number | null;
  priceDislocation: number | null;
  idiosyncrasy: number | null;
  confidence: number;
  asOf: string | null;
}

function latestScoresByAsset(rows: ScoreRow[]): Map<string, ScoreBag> {
  const result = new Map<string, ScoreBag>();
  for (const row of rows) {
    if (
      ![
        "momentum",
        "trend",
        "volatility",
        "valuation",
        "quality",
        "piotroski",
        "magic_formula",
      ].includes(row.score_type)
    ) {
      continue;
    }
    const bag = result.get(row.subject_id) ?? {};
    const scoreType = row.score_type as keyof ScoreBag;
    if (!bag[scoreType]) bag[scoreType] = row;
    result.set(row.subject_id, bag);
  }
  return result;
}

function latestEarningsByAsset(rows: EarningsRow[]): Map<string, EarningsRow[]> {
  const result = new Map<string, EarningsRow[]>();
  for (const row of rows) {
    const list = result.get(row.asset_id) ?? [];
    if (list.length < 4) list.push(row);
    result.set(row.asset_id, list);
  }
  return result;
}

function buildPriceContext(
  scores: ScoreBag,
  sectorPeers: Array<{ assetId: string; value: number }>,
  broadPeers: Array<{ assetId: string; value: number }>,
): PriceContext {
  const return12m = finite(scores.momentum?.inputs.ret12m);
  const directDrawdown = finite(scores.volatility?.inputs.drawdown_from_hi);
  const current = finite(scores.trend?.inputs.cur);
  const high = finite(scores.trend?.inputs.hi52);
  const drawdown =
    directDrawdown ?? (current !== null && high !== null && high > 0 ? current / high - 1 : null);
  const useSector = sectorPeers.length >= 4;
  const peers = useSector ? sectorPeers : broadPeers;
  const peerValues = peers.map((item) => item.value);
  const peerMedian = peerValues.length >= 4 ? median(peerValues) : null;
  const sectorBreadth =
    sectorPeers.length >= 4
      ? sectorPeers.filter((item) => item.value <= -0.1).length / sectorPeers.length
      : null;
  const dislocation = computePriceDislocation({
    return12m,
    drawdown,
    peerMedianReturn: peerMedian,
    sectorBreadth,
  });
  const confidenceValues = [scores.momentum?.confidence, scores.volatility?.confidence].filter(
    (value): value is number => typeof value === "number",
  );

  return {
    return12m,
    drawdown,
    residualReturn: dislocation.residualReturn,
    sectorBreadth,
    peerCount: peers.length,
    usedBroadPeers: !useSector,
    absolutePriceDamage: dislocation.absolutePriceDamage,
    priceDislocation: dislocation.priceDislocation,
    idiosyncrasy: dislocation.idiosyncrasy,
    confidence: confidenceValues.length ? average(confidenceValues) : 0,
    asOf: scores.momentum?.computed_at ?? scores.trend?.computed_at ?? null,
  };
}

function buildFundamentalModels(scores: ScoreBag): CandidateFundamentalModels {
  const piotroski = scores.piotroski;
  const magic = scores.magic_formula;
  const rawScore = finite(piotroski?.inputs.raw_score);
  const provisionalScore = finite(piotroski?.inputs.provisional_score);
  const availableTests = finite(piotroski?.inputs.available_tests) ?? 0;
  const coverage = finite(piotroski?.inputs.coverage) ?? 0;
  const complete = piotroski?.inputs.complete === true;
  const tests = parsePiotroskiTests(piotroski?.inputs.tests);
  const magicEligible = magic?.inputs.eligible === true;
  const exclusionReason =
    typeof magic?.inputs.exclusion_reason === "string" ? magic.inputs.exclusion_reason : null;

  return {
    piotroski: {
      state: !piotroski ? "missing" : complete && rawScore !== null ? "complete" : "partial",
      score: complete ? rawScore : null,
      provisionalScore,
      availableTests,
      coverage,
      tests,
      knownAt: typeof piotroski?.inputs.known_at === "string" ? piotroski.inputs.known_at : null,
    },
    magicFormula: {
      state: !magic ? "missing" : magicEligible ? "ranked" : "ineligible",
      eligible: magicEligible,
      exclusionReason,
      returnOnCapital: finite(magic?.inputs.return_on_capital),
      earningsYield: finite(magic?.inputs.earnings_yield),
      universeRank: finite(magic?.inputs.universe_rank),
      universeSize: finite(magic?.inputs.universe_size) ?? 0,
      universePercentile: finite(magic?.inputs.universe_percentile),
      industryRank: finite(magic?.inputs.industry_rank),
      industrySize: finite(magic?.inputs.industry_size) ?? 0,
      industryPercentile: finite(magic?.inputs.industry_percentile),
      periodEnd: typeof magic?.inputs.period_end === "string" ? magic.inputs.period_end : null,
      knownAt: typeof magic?.inputs.known_at === "string" ? magic.inputs.known_at : null,
    },
  };
}

function buildCandidateFunnel(
  horizon: InvestmentHorizon,
  result: OpportunityHorizonScore,
  models: CandidateFundamentalModels,
  valuation: ScoreRow | undefined,
): CandidateFunnel {
  const routes: DiscoveryRoute[] = [];
  const priceRoute =
    horizon === "five_to_ten"
      ? ["quality_profile", "quality_watch"].includes(result.classification)
      : ["broken_stock", "sector_washout", "recovery_watch", "durable_candidate"].includes(
          result.classification,
        );
  if (priceRoute) routes.push("price_dislocation");
  if (
    models.magicFormula.state === "ranked" &&
    (models.magicFormula.universePercentile ?? 0) >= 75
  ) {
    routes.push("magic_formula");
  }
  const valuationScore = finite(valuation?.value);
  if (
    models.piotroski.state === "complete" &&
    (models.piotroski.score ?? 0) >= 7 &&
    (valuationScore ?? 0) >= 65
  ) {
    routes.push("improving_value");
  }

  const piotroskiValidation =
    models.piotroski.state !== "complete"
      ? "unavailable"
      : (models.piotroski.score ?? 0) >= 7
        ? "confirmation"
        : (models.piotroski.score ?? 9) <= 3
          ? "warning"
          : "neutral";
  const routeScores = [
    result.researchPriority,
    routes.includes("magic_formula") ? (models.magicFormula.universePercentile ?? 0) * 0.85 : 0,
    routes.includes("improving_value") ? ((models.piotroski.score ?? 0) / 9) * 85 : 0,
  ];
  const piotroskiAdjustment =
    piotroskiValidation === "confirmation" ? 4 : piotroskiValidation === "warning" ? -12 : 0;
  const shadowPriority = clamp(Math.max(...routeScores) + piotroskiAdjustment);
  const routeLabels = routes.map((route) =>
    route === "price_dislocation"
      ? "price dislocation"
      : route === "magic_formula"
        ? "Magic Formula"
        : "strong Piotroski plus value",
  );

  return {
    routes,
    nominated: routes.length > 0,
    shadowPriority: round1(shadowPriority),
    piotroskiValidation,
    detail:
      routes.length === 0
        ? "No discovery route currently nominates this company."
        : `Nominated through ${routeLabels.join(", ")}. Piotroski is ${
            piotroskiValidation === "confirmation"
              ? "confirming"
              : piotroskiValidation === "warning"
                ? "warning"
                : piotroskiValidation
          }.`,
  };
}

function parsePiotroskiTests(value: unknown): PiotroskiTest[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    if (typeof record.key !== "string" || typeof record.label !== "string") return [];
    const passed =
      typeof record.passed === "boolean" || record.passed === null ? record.passed : null;
    return [
      {
        key: record.key as PiotroskiTest["key"],
        label: record.label,
        passed,
        currentValue: finite(record.currentValue),
        priorValue: finite(record.priorValue),
        detail: typeof record.detail === "string" ? record.detail : "",
      },
    ];
  });
}

function buildEvidence(
  scores: ScoreBag,
  price: PriceContext,
  earnings: EarningsRow[],
): OpportunityEvidence {
  const quality = scores.quality;
  const valuation = scores.valuation;
  const trend = scores.trend;
  const momentum = scores.momentum;
  const volatility = scores.volatility;
  const qualityValue = finite(quality?.value);
  const valuationValue = finite(valuation?.value);
  const recoveryValues = [finite(trend?.value), finite(momentum?.value)].filter(
    (value): value is number => value !== null,
  );
  const balance = balanceSheetSignal(quality);
  const impairmentBase =
    qualityValue === null
      ? null
      : 100 - (balance.value === null ? qualityValue : qualityValue * 0.7 + balance.value * 0.3);
  const recentMisses = earnings
    .slice(0, 3)
    .filter((event) => event.surprise_pct !== null && event.surprise_pct < 0);
  const impairmentRisk =
    impairmentBase === null
      ? null
      : clamp(
          impairmentBase +
            (recentMisses[0]?.surprise_pct !== undefined &&
            recentMisses[0]?.surprise_pct !== null &&
            recentMisses[0].surprise_pct < -20
              ? 10
              : 0) +
            (recentMisses.length >= 2 ? 8 : 0),
        );
  const latestEarnings = earnings[0] ?? null;
  const earningsTemporary = temporaryEvidenceScore(latestEarnings, qualityValue);
  const recoveryDurabilityValues = [
    qualityValue === null ? null : qualityValue * 0.45,
    finite(trend?.value) === null ? null : finite(trend?.value)! * 0.25,
    finite(momentum?.value) === null ? null : finite(momentum?.value)! * 0.15,
    finite(volatility?.value) === null ? null : finite(volatility?.value)! * 0.15,
  ].filter((value): value is number => value !== null);

  const evidence: OpportunityEvidence = {
    absolutePriceDamage:
      price.absolutePriceDamage === null
        ? missingSignal("absolutePriceDamage", "A current 52-week drawdown is required.")
        : signal({
            key: "absolutePriceDamage",
            value: price.absolutePriceDamage,
            confidence: price.confidence,
            status: "observed",
            detail: `${Math.abs((price.drawdown ?? 0) * 100).toFixed(1)}% below the current 52-week high. This captures sector-wide damage that the peer-adjusted signal deliberately removes.`,
            asOf: price.asOf,
            source: "Equity price provider pool",
          }),
    priceDislocation:
      price.priceDislocation === null
        ? missingSignal("priceDislocation", "A 12-month return and drawdown are required.")
        : signal({
            key: "priceDislocation",
            value: price.priceDislocation,
            confidence: price.confidence,
            status: "proxy",
            detail: price.usedBroadPeers
              ? `Industry peer coverage is thin, so the ${formatPct(price.residualReturn)} gap uses the broad tracked universe.`
              : `${formatPct(price.residualReturn)} versus the industry median, with a ${formatPct(price.drawdown)} drawdown from the 52-week high.`,
            asOf: price.asOf,
            source: "Equity price provider pool",
          }),
    fundamentalResilience:
      qualityValue === null
        ? missingSignal(
            "fundamentalResilience",
            "Current profitability, margins, returns and balance-sheet ratios are unavailable.",
          )
        : signal({
            key: "fundamentalResilience",
            value: qualityValue,
            confidence: quality?.confidence ?? 0,
            status: "proxy",
            detail:
              "Current peer-relative quality is available, but multi-period revenue, margin and cash-flow resilience is not yet stored.",
            asOf: fundamentalAsOf(quality),
            source: "FMP current fundamentals",
          }),
    valuationCompression:
      valuationValue === null
        ? missingSignal("valuationCompression", "Current valuation multiples are unavailable.")
        : signal({
            key: "valuationCompression",
            value: valuationValue,
            confidence: valuation?.confidence ?? 0,
            status: "proxy",
            detail:
              "Current peer-relative multiples are available. Historical forward-multiple vintages and reverse-DCF expectations are not yet connected.",
            asOf: fundamentalAsOf(valuation),
            source: "FMP current fundamentals",
          }),
    temporaryEvidence:
      earningsTemporary === null
        ? missingSignal(
            "temporaryEvidence",
            "Estimate revisions, guidance history and enough earnings events are not available.",
          )
        : signal({
            key: "temporaryEvidence",
            value: earningsTemporary,
            confidence: 55,
            status: "proxy",
            detail:
              "Latest reported EPS surprise is available, but guidance and consensus-revision history are still missing.",
            asOf: latestEarnings?.scheduled_at ?? null,
            source: "Alpha Vantage earnings calendar",
          }),
    recoveryConfirmation:
      recoveryValues.length === 0
        ? missingSignal("recoveryConfirmation", "Trend and momentum scores are unavailable.")
        : signal({
            key: "recoveryConfirmation",
            value: average(recoveryValues),
            confidence: average(
              [trend?.confidence, momentum?.confidence].filter(
                (value): value is number => typeof value === "number",
              ),
            ),
            status: "observed",
            detail: "Combines the latest price trend and 12-minus-1-month momentum.",
            asOf: trend?.computed_at ?? momentum?.computed_at ?? null,
            source: "Equity price provider pool",
          }),
    ownershipEvidence: missingSignal(
      "ownershipEvidence",
      "Point-in-time insider purchases, short interest and institutional flows are not connected.",
    ),
    sustainableEarnings:
      qualityValue === null
        ? missingSignal(
            "sustainableEarnings",
            "At least seven years of revenue, margins, cash flow and estimate history are required.",
          )
        : signal({
            key: "sustainableEarnings",
            value: qualityValue,
            confidence: Math.min(quality?.confidence ?? 0, 55),
            status: "proxy",
            detail:
              "Current quality is a placeholder only. A full cycle of earnings and cash-flow history is required for production.",
            asOf: fundamentalAsOf(quality),
            source: "FMP current fundamentals",
          }),
    balanceSheetDurability: balance,
    recoveryDurability:
      recoveryDurabilityValues.length < 3
        ? missingSignal(
            "recoveryDurability",
            "Quality, trend, momentum and volatility must all be available.",
          )
        : signal({
            key: "recoveryDurability",
            value: sum(recoveryDurabilityValues),
            confidence: average(
              [
                quality?.confidence,
                trend?.confidence,
                momentum?.confidence,
                volatility?.confidence,
              ].filter((value): value is number => typeof value === "number"),
            ),
            status: "proxy",
            detail:
              "Current quality and price stabilisation agree, but a multi-year recovery record is not yet available.",
            asOf: latestDate([
              fundamentalAsOf(quality),
              trend?.computed_at,
              momentum?.computed_at,
              volatility?.computed_at,
            ]),
            source: "Current fundamentals and prices",
          }),
    macroResilience: missingSignal(
      "macroResilience",
      "Company-level rate, currency, commodity and economic sensitivities have not passed validation.",
    ),
    capitalAllocation: missingSignal(
      "capitalAllocation",
      "Point-in-time buyback, dilution, dividend and acquisition returns are not connected.",
    ),
    businessQuality:
      qualityValue === null
        ? missingSignal(
            "businessQuality",
            "A long-run profitability and competitive-position record is required.",
          )
        : signal({
            key: "businessQuality",
            value: qualityValue,
            confidence: Math.min(quality?.confidence ?? 0, 50),
            status: "proxy",
            detail:
              "Current peer-relative profitability is visible, but it does not yet cover multiple economic cycles.",
            asOf: fundamentalAsOf(quality),
            source: "FMP current fundamentals",
          }),
    reinvestmentRunway: missingSignal(
      "reinvestmentRunway",
      "Historical reinvestment rates, incremental returns and addressable-market evidence are not connected.",
    ),
    industryDurability: missingSignal(
      "industryDurability",
      "A validated industry structure and disruption model is not active.",
    ),
    entryValuation:
      valuationValue === null
        ? missingSignal("entryValuation", "Current valuation evidence is unavailable.")
        : signal({
            key: "entryValuation",
            value: valuationValue,
            confidence: Math.min(valuation?.confidence ?? 0, 55),
            status: "proxy",
            detail: "Current peer valuation is an entry reference, not a ten-year return forecast.",
            asOf: fundamentalAsOf(valuation),
            source: "FMP current fundamentals",
          }),
    idiosyncrasy:
      price.idiosyncrasy === null
        ? missingSignal("idiosyncrasy", "Enough industry peers and return history are required.")
        : signal({
            key: "idiosyncrasy",
            value: price.idiosyncrasy,
            confidence: Math.min(price.confidence, 60),
            status: "proxy",
            detail:
              "This first pass removes the industry median and sector breadth. Market, country, style, rates, currency and commodity betas are not yet removed.",
            asOf: price.asOf,
            source: "Tracked industry returns",
          }),
    impairmentRisk:
      impairmentRisk === null
        ? missingSignal(
            "impairmentRisk",
            "Current quality and balance-sheet evidence is unavailable.",
          )
        : signal({
            key: "impairmentRisk",
            value: impairmentRisk,
            confidence: Math.min(quality?.confidence ?? 0, 60),
            status: "proxy",
            detail:
              "Derived from current quality and balance-sheet ratios, with a penalty for repeated or severe EPS misses. Refinancing and accounting-risk history remain missing.",
            asOf: latestDate([fundamentalAsOf(quality), latestEarnings?.scheduled_at]),
            source: "Current fundamentals and reported earnings",
          }),
  };
  return evidence;
}

function balanceSheetSignal(quality: ScoreRow | undefined): OpportunitySignal {
  if (!quality) {
    return missingSignal(
      "balanceSheetDurability",
      "Debt, liquidity and refinancing evidence is unavailable.",
    );
  }
  const debtEquity = finite(quality.inputs[FUNDAMENTAL_METRICS.debtEquity]);
  const currentRatio = finite(quality.inputs[FUNDAMENTAL_METRICS.currentRatio]);
  if (debtEquity === null && currentRatio === null) {
    return missingSignal(
      "balanceSheetDurability",
      "Debt-to-equity and current-ratio inputs are unavailable.",
    );
  }
  const debtScore =
    debtEquity === null
      ? null
      : debtEquity <= 0.5
        ? 85
        : debtEquity <= 1
          ? 70
          : debtEquity <= 2
            ? 50
            : debtEquity <= 3
              ? 30
              : 15;
  const liquidityScore =
    currentRatio === null
      ? null
      : currentRatio >= 2
        ? 85
        : currentRatio >= 1.5
          ? 72
          : currentRatio >= 1
            ? 55
            : currentRatio >= 0.75
              ? 35
              : 15;
  const values = [debtScore, liquidityScore].filter((value): value is number => value !== null);
  return signal({
    key: "balanceSheetDurability",
    value: average(values),
    confidence: Math.min(quality.confidence, values.length === 2 ? 65 : 45),
    status: "proxy",
    detail: `Current debt/equity ${formatNumber(debtEquity)} and current ratio ${formatNumber(currentRatio)}. Debt maturity and refinancing schedules are not yet connected.`,
    asOf: fundamentalAsOf(quality),
    source: "FMP current fundamentals",
  });
}

function temporaryEvidenceScore(
  earnings: EarningsRow | null,
  quality: number | null,
): number | null {
  if (!earnings || earnings.surprise_pct === null) return null;
  const surprise = earnings.surprise_pct;
  const earningsScore = surprise >= 0 ? 62 : surprise >= -10 ? 68 : surprise >= -20 ? 48 : 20;
  return clamp(earningsScore * 0.45 + (quality ?? 50) * 0.55);
}

function buildNarrative(
  asset: AssetRow,
  industry: { code: string; name: string } | null,
  price: PriceContext,
  primary: OpportunityHorizonScore,
  evidence: OpportunityEvidence,
  earnings: EarningsRow | null,
  models: CandidateFundamentalModels,
): OpportunityCandidate["narrative"] {
  const priceSentence =
    price.drawdown === null
      ? "There is not enough current price history to measure the fall."
      : `The shares are ${Math.abs((price.drawdown ?? 0) * 100).toFixed(1)}% below their 52-week high`;
  const peerSentence =
    price.residualReturn === null
      ? "a reliable industry-adjusted return is not available"
      : `their 12-month return is ${Math.abs(price.residualReturn * 100).toFixed(1)} percentage points ${
          price.residualReturn < 0 ? "below" : "above"
        } the peer median`;
  const quality = evidence.fundamentalResilience?.value;
  const valuation = evidence.valuationCompression?.value;
  const latestMiss =
    earnings?.surprise_pct === null || earnings?.surprise_pct === undefined
      ? null
      : earnings.surprise_pct;
  const piotroskiText =
    models.piotroski.state === "complete"
      ? `Piotroski is ${models.piotroski.score}/9.`
      : models.piotroski.state === "partial"
        ? `Piotroski is incomplete at ${models.piotroski.provisionalScore ?? 0} passes from ${models.piotroski.availableTests} available tests.`
        : "Piotroski statement history is not available.";
  const magicText =
    models.magicFormula.state === "ranked"
      ? `Magic Formula ranks ${models.magicFormula.universeRank} of ${models.magicFormula.universeSize}.`
      : models.magicFormula.state === "ineligible"
        ? `Magic Formula is ineligible: ${models.magicFormula.exclusionReason ?? "required inputs are unavailable"}.`
        : "Magic Formula evidence is not available.";
  const summary = `${priceSentence}, and ${peerSentence}. The current 1–3 year model classifies this as ${classificationLabel(primary.classification).toLowerCase()}, but it remains ${primary.modelState} rather than a buy signal.`;
  const detail = `Current quality is ${
    quality === null || quality === undefined ? "unavailable" : `${quality.toFixed(0)}/100`
  } and peer-relative valuation is ${
    valuation === null || valuation === undefined ? "unavailable" : `${valuation.toFixed(0)}/100`
  }. ${
    latestMiss === null
      ? "No recent EPS surprise is available."
      : `The latest stored EPS surprise was ${latestMiss.toFixed(1)}%.`
  } ${piotroskiText} ${magicText} ${
    industry
      ? `The generic model treats ${industry.name} with its standard operating-company rules.`
      : ""
  }`;
  const watch = unique([
    ...primary.blockedReasons.slice(0, 3),
    price.usedBroadPeers
      ? "Build a deeper industry peer set before trusting the company-specific return."
      : "Run the full market, country, style and macro factor regression before promoting the idiosyncrasy score.",
    "Check the next results for revenue, margin, free-cash-flow and guidance confirmation.",
  ]);
  return { summary, detail, watch };
}

function sectorModelBlocks(industryCode: string | null): string[] {
  if (industryCode === "SEC_FIN") {
    return [
      "Financial companies need a separate capital, liquidity, credit-quality and book-value model.",
    ];
  }
  if (industryCode === "SEC_RE") {
    return ["REITs need a separate FFO, NAV, loan-to-value, occupancy and refinancing model."];
  }
  return [];
}

function summariseHorizon(
  horizon: InvestmentHorizon,
  candidates: OpportunityCandidate[],
): HorizonSummary {
  const results = candidates.map((candidate) => candidate.horizons[horizon]);
  const candidateCount = candidates.filter(
    (candidate) => candidate.funnel[horizon].nominated,
  ).length;
  return {
    horizon,
    label: HORIZON_CONFIGS[horizon].label,
    scoreLabel: HORIZON_CONFIGS[horizon].scoreLabel,
    description: HORIZON_CONFIGS[horizon].description,
    refresh: HORIZON_CONFIGS[horizon].refresh,
    candidates: candidateCount,
    eligible: results.filter((result) => result.modelState === "eligible").length,
    shadow: results.filter((result) => result.modelState === "shadow").length,
    blocked: results.filter((result) => result.modelState === "blocked").length,
    medianConfidence: round1(median(results.map((result) => result.dataConfidence))),
  };
}

function coverageGates(candidates: OpportunityCandidate[]): CoverageGate[] {
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    counts.set(candidate.countryCode, (counts.get(candidate.countryCode) ?? 0) + 1);
  }
  return [
    {
      market: "United States",
      code: "US",
      state: "shadow",
      trackedAssets: counts.get("US") ?? 0,
      available: "Daily prices, current fundamentals and reported EPS",
      missing: "Point-in-time estimates, ownership and full factor controls",
      activationRule:
        "At least 95% adjusted-price coverage, 90% fundamentals coverage and a clean point-in-time backtest.",
    },
    {
      market: "United Kingdom",
      code: "UK",
      state: "blocked",
      trackedAssets: counts.get("GB") ?? counts.get("UK") ?? 0,
      available: "Macro engine and provider adapters",
      missing: "Validated identifiers, fundamentals history and corporate actions",
      activationRule: "Pass the same data-quality trial as the US universe before scoring.",
    },
    {
      market: "Developed Europe",
      code: "EU",
      state: "blocked",
      trackedAssets: 0,
      available: "Euro-area macro engine",
      missing: "Exchange mapping, estimates, filings and point-in-time fundamentals",
      activationRule: "Activate country by country after identifier and filing coverage passes.",
    },
    {
      market: "Other developed markets",
      code: "DEV",
      state: "disabled",
      trackedAssets: 0,
      available: "Model specification only",
      missing: "All production equity evidence",
      activationRule:
        "Start only after US, UK and Europe operate within provider and storage budgets.",
    },
    {
      market: "Emerging markets",
      code: "EM",
      state: "disabled",
      trackedAssets: 0,
      available: "Model specification only",
      missing: "Reliable identifiers, filings, estimates, FX and delisted-company history",
      activationRule: "Remain disabled until local-market point-in-time quality is proven.",
    },
  ];
}

function capabilityGates(): CapabilityGate[] {
  return [
    {
      capability: "Adjusted prices and technical history",
      state: "live",
      currentUse: "Three-year price behaviour, drawdown, trend and volatility",
      productionRequirement: "Corporate-action completeness above 95% and daily freshness",
    },
    {
      capability: "Current fundamentals",
      state: "partial",
      currentUse: "Peer-relative valuation and quality proxies",
      productionRequirement:
        "Quarterly and annual point-in-time history with publication timestamps",
    },
    {
      capability: "Piotroski financial health",
      state: "partial",
      currentUse:
        "Nine transparent annual tests nominate or warn on candidates without changing the core Radar score",
      productionRequirement:
        "Three complete point-in-time annual periods and out-of-sample false-positive testing",
    },
    {
      capability: "Magic Formula discovery",
      state: "partial",
      currentUse:
        "Annual Greenblatt ROC and EBIT/EV ranks provide a separate quality-value nomination route",
      productionRequirement:
        "Complete eligible universe, quarterly TTM extension and out-of-sample ranking validation",
    },
    {
      capability: "Historical valuation and estimates",
      state: "missing",
      currentUse: "No score contribution; confidence is reduced",
      productionRequirement: "Seven to ten years of forward multiples and consensus revisions",
    },
    {
      capability: "Systematic return controls",
      state: "partial",
      currentUse: "Industry median and sector breadth only",
      productionRequirement: "Market, country, style, rates, FX and commodity exposures",
    },
    {
      capability: "Insider, short and institutional evidence",
      state: "missing",
      currentUse: "No score contribution; confidence is reduced",
      productionRequirement: "Point-in-time filings with reporting-lag metadata",
    },
    {
      capability: "Long-term quality and capital allocation",
      state: "missing",
      currentUse: "5–10 year view remains an experimental profile",
      productionRequirement: "Ten to fifteen years across economic and industry cycles",
    },
  ];
}

function emptyWorkspace(activeEquities: number): OpportunityRadarWorkspace {
  return {
    asOf: new Date().toISOString(),
    calcVersion: "opportunity.horizons.v0.2",
    universe: {
      activeEquities,
      loaded: 0,
      cap: MAX_SHADOW_UNIVERSE,
      truncated: activeEquities > 0,
    },
    candidates: [],
    horizonSummaries: HORIZONS.map((horizon) => ({
      horizon,
      label: HORIZON_CONFIGS[horizon].label,
      scoreLabel: HORIZON_CONFIGS[horizon].scoreLabel,
      description: HORIZON_CONFIGS[horizon].description,
      refresh: HORIZON_CONFIGS[horizon].refresh,
      candidates: 0,
      eligible: 0,
      shadow: 0,
      blocked: 0,
      medianConfidence: 0,
    })),
    coverage: coverageGates([]),
    capabilities: capabilityGates(),
    modelNote:
      "No active equities are available. The model will remain inactive rather than manufacture a ranking.",
  };
}

function signal(input: {
  key: OpportunitySignalKey;
  value: number;
  confidence: number;
  status: SignalStatus;
  detail: string;
  asOf?: string | null;
  source?: string;
}): OpportunitySignal {
  return {
    key: input.key,
    label: signalLabel(input.key),
    value: clamp(input.value),
    confidence: clamp(input.confidence),
    status: input.status,
    detail: input.detail,
    asOf: input.asOf,
    source: input.source,
  };
}

function signalLabel(key: OpportunitySignalKey): string {
  const signal = missingSignal(key, "");
  return signal.label;
}

function fundamentalAsOf(score: ScoreRow | undefined): string | null {
  const asOf = score?.inputs._as_of;
  return typeof asOf === "string" ? asOf : (score?.computed_at ?? null);
}

function inferCountry(exchange: string | null): string {
  if (exchange && ["XNAS", "XNYS", "ARCX", "BATS"].includes(exchange)) return "US";
  if (exchange === "XLON") return "GB";
  return "UNMAPPED";
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function average(values: number[]): number {
  return values.length ? sum(values) / values.length : 0;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 50));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function toPercent(value: number | null): number | null {
  return value === null ? null : round1(value * 100);
}

function formatPct(value: number | null): string {
  return value === null ? "unknown" : `${(value * 100).toFixed(1)} percentage-point`;
}

function formatNumber(value: number | null): string {
  return value === null ? "unavailable" : value.toFixed(2);
}

function latestDate(values: Array<string | null | undefined>): string | null {
  return (
    values
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null
  );
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function chunkValues<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < values.length; start += size) {
    chunks.push(values.slice(start, start + size));
  }
  return chunks;
}
