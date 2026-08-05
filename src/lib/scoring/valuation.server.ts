import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  FUNDAMENTAL_METRICS,
  VALUATION_LOWER_IS_BETTER,
  QUALITY_METRICS,
} from "@/lib/ingestion/fundamentals/metrics";
import {
  FUNDAMENTAL_FRESH_DAYS,
  FUNDAMENTAL_STALE_DAYS,
} from "@/lib/opportunity/evidence-freshness";

export const VALUATION_CALC_VERSION = "score.valuation.v0.3";
export const QUALITY_CALC_VERSION = "score.quality.v0.3";

/** For each fundamentals metric_code, latest non-stale value per asset. */
export interface LatestByMetric {
  // metric_code -> asset_id -> { value, asOf }
  byMetric: Map<string, Map<string, { value: number; asOf: string }>>;
  /** Oldest contributing current-fundamental timestamp for each asset. */
  fundAsOfByAsset: Map<string, string>;
}

export async function loadLatestFundamentals(assetIds: string[]): Promise<LatestByMetric> {
  const codes = [
    ...VALUATION_LOWER_IS_BETTER.map((m) => m.code),
    ...QUALITY_METRICS.map((m) => m.code),
    FUNDAMENTAL_METRICS.marketCap,
  ];
  const data = [];
  for (let start = 0; start < assetIds.length; start += 75) {
    const batch = assetIds.slice(start, start + 75);
    const { data: page, error } = await supabaseAdmin
      .from("latest_asset_fundamentals")
      .select("subject_id, metric_code, value_num, as_of")
      .in("subject_id", batch)
      .in("metric_code", codes)
      .limit(batch.length * codes.length);
    if (error) throw error;
    data.push(...(page ?? []));
  }

  const staleCutoffMs = Date.now() - FUNDAMENTAL_STALE_DAYS * 86_400_000;
  const byMetric = new Map<string, Map<string, { value: number; asOf: string }>>();
  const fundAsOfByAsset = new Map<string, string>();
  for (const row of data) {
    const metric = row.metric_code as string;
    const asset = row.subject_id as string;
    if (row.value_num === null || !row.as_of) continue;
    const asOf = String(row.as_of);
    const asOfMs = Date.parse(asOf);
    if (!Number.isFinite(asOfMs) || asOfMs < staleCutoffMs) continue;

    const bag = byMetric.get(metric) ?? new Map();
    if (!bag.has(asset)) bag.set(asset, { value: Number(row.value_num), asOf });
    byMetric.set(metric, bag);

    // A composite is only as fresh as its oldest contributing current input.
    const current = fundAsOfByAsset.get(asset);
    if (!current || asOf < current) fundAsOfByAsset.set(asset, asOf);
  }
  return { byMetric, fundAsOfByAsset };
}

/** Percentile rank within a peer array. Direction chooses which end is "good". */
function percentileRank(value: number, peers: number[], direction: "low" | "high"): number {
  if (peers.length === 0) return 50;
  const better = peers.filter((p) => (direction === "low" ? p > value : p < value)).length;
  const equal = peers.filter((p) => p === value).length;
  return ((better + 0.5 * equal) / peers.length) * 100;
}

interface AssetMeta {
  id: string;
  industry_id: string | null;
}

export interface CompositeScoreResult {
  value: number;
  confidence: number;
  positives: Array<{ id: string; label: string; detail?: string }>;
  deductions: Array<{ id: string; label: string; detail?: string }>;
  inputs: Record<string, number | string | null>;
  weights: Record<string, number>;
  calcVersion: string;
  ageSec: number | null;
}

export function isUsableFundamentalValue(
  kind: "valuation" | "quality",
  metricCode: string,
  value: number,
): boolean {
  if (!Number.isFinite(value)) return false;

  if (kind === "valuation") {
    if (
      [
        FUNDAMENTAL_METRICS.pe,
        FUNDAMENTAL_METRICS.pb,
        FUNDAMENTAL_METRICS.ps,
        FUNDAMENTAL_METRICS.evEbitda,
      ].includes(metricCode as never)
    ) {
      return value > 0;
    }
    if (metricCode === FUNDAMENTAL_METRICS.fcfYield) return value > 0;
  }

  if (kind === "quality") {
    // Negative debt/equity normally indicates negative book equity, not a
    // conservatively financed company. Ranking it as "low debt" creates traps.
    if (metricCode === FUNDAMENTAL_METRICS.debtEquity) return value >= 0;
    if (metricCode === FUNDAMENTAL_METRICS.currentRatio) return value > 0;
  }

  return true;
}

function composite(
  kind: "valuation" | "quality",
  asset: AssetMeta,
  latest: LatestByMetric,
  peersByIndustry: Map<string | null, AssetMeta[]>,
  allAssets: AssetMeta[],
): CompositeScoreResult | null {
  const definition = kind === "valuation" ? VALUATION_LOWER_IS_BETTER : QUALITY_METRICS;
  const scores: number[] = [];
  const weights: Record<string, number> = {};
  const inputs: Record<string, number | string | null> = {};
  const positives: Array<{ id: string; label: string; detail?: string }> = [];
  const deductions: Array<{ id: string; label: string; detail?: string }> = [];

  const industryPeers = (peersByIndustry.get(asset.industry_id) ?? []).filter(
    (a) => a.id !== asset.id,
  );
  const usingIndustryPeers = industryPeers.length >= 5;
  const peerPool = usingIndustryPeers ? industryPeers : allAssets.filter((a) => a.id !== asset.id);

  let contributing = 0;
  let invalid = 0;
  for (const metric of definition) {
    const bag = latest.byMetric.get(metric.code);
    const own = bag?.get(asset.id);
    if (!own) {
      inputs[metric.code] = null;
      continue;
    }
    inputs[metric.code] = own.value;
    if (!isUsableFundamentalValue(kind, metric.code, own.value)) {
      invalid++;
      deductions.push({
        id: `${kind}-${metric.code}-invalid`,
        label: `${metric.label} is not economically usable`,
        detail: `${own.value.toFixed(2)} excluded from the peer rank`,
      });
      continue;
    }

    const peerValues: number[] = [];
    for (const p of peerPool) {
      const pv = bag?.get(p.id)?.value;
      if (typeof pv === "number" && isUsableFundamentalValue(kind, metric.code, pv)) {
        peerValues.push(pv);
      }
    }
    if (peerValues.length < 3) continue;

    const pct = percentileRank(own.value, peerValues, metric.direction);
    scores.push(pct);
    weights[metric.code] = 1;
    contributing++;
    if (pct >= 70)
      positives.push({
        id: `${kind}-${metric.code}-good`,
        label: `${metric.label} in best-third of peers`,
        detail: `${own.value.toFixed(2)} · pct ${pct.toFixed(0)}`,
      });
    if (pct <= 30)
      deductions.push({
        id: `${kind}-${metric.code}-bad`,
        label: `${metric.label} in worst-third of peers`,
        detail: `${own.value.toFixed(2)} · pct ${pct.toFixed(0)}`,
      });
  }

  const minimumContributors = kind === "valuation" ? 3 : 4;
  if (contributing < minimumContributors) return null;

  let value = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const fcfYield = latest.byMetric
    .get(FUNDAMENTAL_METRICS.fcfYield)
    ?.get(asset.id)?.value;
  const positiveFcfYield =
    typeof fcfYield === "number" &&
    isUsableFundamentalValue("valuation", FUNDAMENTAL_METRICS.fcfYield, fcfYield);

  if (kind === "valuation" && !positiveFcfYield) {
    value = Math.min(value, 55);
    deductions.push({
      id: "valuation-no-positive-fcf",
      label: "No positive free-cash-flow yield confirmation",
      detail: "Cheap accounting multiples cannot score above 55 without positive trailing free cash flow.",
    });
  }
  if (kind === "valuation" && contributing === minimumContributors) {
    value = Math.min(value, 65);
    deductions.push({
      id: "valuation-minimum-coverage-cap",
      label: "Valuation score capped for minimum evidence coverage",
      detail: `${contributing} of ${definition.length} valuation measures contributed.`,
    });
  }

  // Confidence — start at 90 and dock for missing/invalid metrics, thin peers and ageing data.
  let confidence = 90;
  const missing = definition.length - contributing;
  if (missing > 0) {
    confidence -= Math.min(missing * 8, 35);
    deductions.push({
      id: `${kind}-missing`,
      label: `${missing} of ${definition.length} metrics unavailable or unusable`,
    });
  }
  if (invalid > 0) confidence -= Math.min(invalid * 5, 15);
  if (!usingIndustryPeers) {
    confidence -= 15;
    deductions.push({
      id: `${kind}-thin-peers`,
      label: `Thin industry peer group (${industryPeers.length}); ranked against full universe`,
    });
  }

  const asOf = latest.fundAsOfByAsset.get(asset.id) ?? null;
  const ageSec = asOf
    ? Math.max(0, Math.floor((Date.now() - new Date(asOf).getTime()) / 1000))
    : null;
  const ageDays = ageSec === null ? null : ageSec / 86_400;
  const freshnessState = ageDays === null
    ? "missing"
    : ageDays <= FUNDAMENTAL_FRESH_DAYS
      ? "fresh"
      : ageDays <= FUNDAMENTAL_STALE_DAYS
        ? "warning"
        : "stale";

  if (freshnessState === "warning") {
    confidence -= 15;
    deductions.push({
      id: `${kind}-age-warning`,
      label: `Fundamentals are older than ${FUNDAMENTAL_FRESH_DAYS} days`,
      detail: `Current evidence remains usable until ${FUNDAMENTAL_STALE_DAYS} days, but confidence is reduced.`,
    });
  }

  inputs["_peers"] = peerPool.length;
  inputs["_industry_peers"] = industryPeers.length;
  inputs["_as_of"] = asOf;
  inputs["_freshness_state"] = freshnessState;
  inputs["_contributing_metrics"] = contributing;
  inputs["_invalid_metrics"] = invalid;
  inputs["_positive_fcf_yield"] = kind === "valuation" ? (positiveFcfYield ? 1 : 0) : null;

  return {
    value,
    confidence: Math.max(0, Math.min(100, confidence)),
    positives,
    deductions,
    inputs,
    weights,
    calcVersion: kind === "valuation" ? VALUATION_CALC_VERSION : QUALITY_CALC_VERSION,
    ageSec,
  };
}

export function computeValuationScore(
  asset: AssetMeta,
  latest: LatestByMetric,
  peersByIndustry: Map<string | null, AssetMeta[]>,
  all: AssetMeta[],
) {
  return composite("valuation", asset, latest, peersByIndustry, all);
}

export function computeQualityScore(
  asset: AssetMeta,
  latest: LatestByMetric,
  peersByIndustry: Map<string | null, AssetMeta[]>,
  all: AssetMeta[],
) {
  return composite("quality", asset, latest, peersByIndustry, all);
}
