import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { FUNDAMENTAL_METRICS, VALUATION_LOWER_IS_BETTER, QUALITY_METRICS } from "@/lib/ingestion/fundamentals/metrics";

export const VALUATION_CALC_VERSION = "score.valuation.v0.1";
export const QUALITY_CALC_VERSION   = "score.quality.v0.1";

/** For each fundamentals metric_code, latest value per asset. */
export interface LatestByMetric {
  // metric_code -> asset_id -> { value, asOf }
  byMetric: Map<string, Map<string, { value: number; asOf: string }>>;
  fundAsOfByAsset: Map<string, string>;
}

export async function loadLatestFundamentals(): Promise<LatestByMetric> {
  const codes = [
    ...VALUATION_LOWER_IS_BETTER.map((m) => m.code),
    ...QUALITY_METRICS.map((m) => m.code),
    FUNDAMENTAL_METRICS.marketCap,
  ];
  const { data } = await supabaseAdmin.from("data_points")
    .select("subject_id, metric_code, value_num, as_of")
    .eq("subject_type", "asset")
    .in("metric_code", codes)
    .order("as_of", { ascending: false })
    .limit(20000);

  const byMetric = new Map<string, Map<string, { value: number; asOf: string }>>();
  const fundAsOfByAsset = new Map<string, string>();
  for (const row of data ?? []) {
    const metric = row.metric_code as string;
    const asset = row.subject_id as string;
    if (row.value_num === null) continue;
    const bag = byMetric.get(metric) ?? new Map();
    if (!bag.has(asset)) bag.set(asset, { value: Number(row.value_num), asOf: row.as_of as string });
    byMetric.set(metric, bag);
    const cur = fundAsOfByAsset.get(asset);
    if (!cur || (row.as_of as string) > cur) fundAsOfByAsset.set(asset, row.as_of as string);
  }
  return { byMetric, fundAsOfByAsset };
}

/** Percentile rank within a peer array. Direction chooses which end is "good". */
function percentileRank(value: number, peers: number[], direction: "low" | "high"): number {
  if (peers.length === 0) return 50;
  const better = peers.filter((p) => (direction === "low" ? p > value : p < value)).length;
  const equal  = peers.filter((p) => p === value).length;
  return ((better + 0.5 * equal) / peers.length) * 100;
}

interface AssetMeta { id: string; industry_id: string | null }

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

  const industryPeers = (peersByIndustry.get(asset.industry_id) ?? []).filter((a) => a.id !== asset.id);
  const usingIndustryPeers = industryPeers.length >= 5;
  const peerPool = usingIndustryPeers ? industryPeers : allAssets.filter((a) => a.id !== asset.id);

  let contributing = 0;
  for (const metric of definition) {
    const bag = latest.byMetric.get(metric.code);
    const own = bag?.get(asset.id);
    if (!own) { inputs[metric.code] = null; continue; }
    const peerValues: number[] = [];
    for (const p of peerPool) {
      const pv = bag?.get(p.id)?.value;
      if (typeof pv === "number" && Number.isFinite(pv)) peerValues.push(pv);
    }
    if (peerValues.length < 3) { inputs[metric.code] = own.value; continue; }
    const pct = percentileRank(own.value, peerValues, metric.direction);
    scores.push(pct);
    weights[metric.code] = 1;
    inputs[metric.code] = own.value;
    contributing++;
    if (pct >= 70) positives.push({ id: `${kind}-${metric.code}-good`, label: `${metric.label} in best-third of peers`, detail: `${own.value.toFixed(2)} · pct ${pct.toFixed(0)}` });
    if (pct <= 30) deductions.push({ id: `${kind}-${metric.code}-bad`, label: `${metric.label} in worst-third of peers`, detail: `${own.value.toFixed(2)} · pct ${pct.toFixed(0)}` });
  }

  if (contributing === 0) return null;
  const value = scores.reduce((s, x) => s + x, 0) / scores.length;

  // Confidence — start at 90 and dock for missing metrics / thin peer group / stale data.
  let confidence = 90;
  const missing = definition.length - contributing;
  if (missing > 0) { confidence -= Math.min(missing * 8, 30); deductions.push({ id: `${kind}-missing`, label: `${missing} of ${definition.length} metrics unavailable` }); }
  if (!usingIndustryPeers) { confidence -= 15; deductions.push({ id: `${kind}-thin-peers`, label: `Thin industry peer group (${industryPeers.length}); ranked against full universe` }); }

  const asOf = latest.fundAsOfByAsset.get(asset.id) ?? null;
  const ageSec = asOf ? Math.max(0, Math.floor((Date.now() - new Date(asOf).getTime()) / 1000)) : null;
  if (ageSec !== null && ageSec > 60 * 60 * 24 * 120) { confidence -= 15; deductions.push({ id: `${kind}-stale`, label: `Fundamentals older than 120 days` }); }

  inputs["_peers"] = peerPool.length;
  inputs["_industry_peers"] = industryPeers.length;
  inputs["_as_of"] = asOf;

  return {
    value, confidence: Math.max(0, Math.min(100, confidence)),
    positives, deductions, inputs, weights,
    calcVersion: kind === "valuation" ? VALUATION_CALC_VERSION : QUALITY_CALC_VERSION,
    ageSec,
  };
}

export function computeValuationScore(asset: AssetMeta, latest: LatestByMetric, peersByIndustry: Map<string | null, AssetMeta[]>, all: AssetMeta[]) {
  return composite("valuation", asset, latest, peersByIndustry, all);
}
export function computeQualityScore(asset: AssetMeta, latest: LatestByMetric, peersByIndustry: Map<string | null, AssetMeta[]>, all: AssetMeta[]) {
  return composite("quality", asset, latest, peersByIndustry, all);
}