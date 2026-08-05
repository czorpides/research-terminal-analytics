import { createServerFn } from "@tanstack/react-start";

import {
  buildExpectationSignal,
  type AnalystExpectationSnapshot,
  type SwingExpectationSignal,
  type SwingExpectationsWorkspace,
} from "./expectations";
import type { SwingWorkspaceCandidate } from "./workspace.functions";

const FMP_DAILY_LIMIT = 250;
const FMP_QUOTA_RESERVE = 80;
const REFRESH_MINUTES = 120;
const REFRESH_SYMBOL_CAP = 4;

interface SnapshotDbRow {
  id: string;
  asset_id: string;
  provider_code: string;
  source_tier: string;
  observed_at: string;
  last_verified_at: string;
  listing_currency: string | null;
  reference_price: number | null;
  fy1_date: string | null;
  fy1_eps_avg: number | null;
  fy1_eps_low: number | null;
  fy1_eps_high: number | null;
  fy1_eps_analysts: number | null;
  fy1_revenue_avg: number | null;
  fy1_revenue_low: number | null;
  fy1_revenue_high: number | null;
  fy1_revenue_analysts: number | null;
  fy2_date: string | null;
  fy2_eps_avg: number | null;
  fy2_eps_low: number | null;
  fy2_eps_high: number | null;
  fy2_eps_analysts: number | null;
  fy2_revenue_avg: number | null;
  fy2_revenue_low: number | null;
  fy2_revenue_high: number | null;
  fy2_revenue_analysts: number | null;
  target_consensus: number | null;
  target_median: number | null;
  target_high: number | null;
  target_low: number | null;
  target_last_month_avg: number | null;
  target_last_month_count: number | null;
  target_last_quarter_avg: number | null;
  target_last_quarter_count: number | null;
  target_last_year_avg: number | null;
  target_last_year_count: number | null;
  target_publishers: unknown;
  validation_state: "accepted" | "quarantined";
  validation_reasons: unknown;
  confidence: number;
}

interface FmpEstimateRow {
  symbol?: string;
  date?: string;
  revenueLow?: number;
  revenueHigh?: number;
  revenueAvg?: number;
  epsLow?: number;
  epsHigh?: number;
  epsAvg?: number;
  numAnalystsRevenue?: number;
  numAnalystsEps?: number;
}

interface FmpTargetConsensus {
  symbol?: string;
  targetHigh?: number;
  targetLow?: number;
  targetConsensus?: number;
  targetMedian?: number;
}

interface FmpTargetSummary {
  symbol?: string;
  lastMonthCount?: number | string;
  lastMonthAvgPriceTarget?: number | string;
  lastQuarterCount?: number | string;
  lastQuarterAvgPriceTarget?: number | string;
  lastYearCount?: number | string;
  lastYearAvgPriceTarget?: number | string;
  publishers?: string | string[];
}

export interface ExpectationRefreshSummary {
  attempted: number;
  refreshed: number;
  unchanged: number;
  quarantined: number;
  skippedFresh: number;
  failures: Array<{ symbol: string; error: string }>;
  asOf: string;
}

export async function refreshSwingExpectationEvidence(
  candidates: SwingWorkspaceCandidate[],
  options: { maxSymbols?: number; minAgeMinutes?: number } = {},
): Promise<ExpectationRefreshSummary> {
  const maxSymbols = clampInt(options.maxSymbols ?? REFRESH_SYMBOL_CAP, 1, 12);
  const minAgeMinutes = clampInt(options.minAgeMinutes ?? REFRESH_MINUTES, 15, 24 * 60);
  if (!candidates.length) return emptyRefreshSummary();

  try {
    const db = await looseDb();
    const ids = candidates.map((candidate) => candidate.assetId);
    const { data, error } = await db
      .from("analyst_expectation_snapshots")
      .select("asset_id,last_verified_at")
      .in("asset_id", ids)
      .order("last_verified_at", { ascending: false })
      .limit(Math.max(100, ids.length * 3));
    if (error) throw error;

    const latestVerified = new Map<string, string>();
    for (const row of (data ?? []) as Array<{ asset_id: string; last_verified_at: string }>) {
      if (!latestVerified.has(row.asset_id)) latestVerified.set(row.asset_id, row.last_verified_at);
    }

    const now = Date.now();
    const ordered = [...candidates]
      .sort((left, right) =>
        Number(right.trade.highConviction) - Number(left.trade.highConviction) ||
        right.trade.setupScore - left.trade.setupScore,
      );
    const stale = ordered.filter((candidate) => {
      const verified = latestVerified.get(candidate.assetId);
      if (!verified) return true;
      const age = (now - new Date(verified).getTime()) / 60_000;
      return !Number.isFinite(age) || age >= minAgeMinutes;
    });
    const selected = stale.slice(0, maxSymbols);
    const summary: ExpectationRefreshSummary = {
      attempted: selected.length,
      refreshed: 0,
      unchanged: 0,
      quarantined: 0,
      skippedFresh: Math.max(0, ordered.length - stale.length),
      failures: [],
      asOf: new Date().toISOString(),
    };

    for (const candidate of selected) {
      try {
        const result = await ingestExpectationSnapshot(candidate);
        if (result === "refreshed") summary.refreshed += 1;
        else if (result === "unchanged") summary.unchanged += 1;
        else if (result === "quarantined") summary.quarantined += 1;
      } catch (error) {
        summary.failures.push({ symbol: candidate.symbol, error: failureMessage(error) });
      }
      await sleep(350);
    }
    summary.asOf = new Date().toISOString();
    return summary;
  } catch (error) {
    return {
      ...emptyRefreshSummary(),
      failures: [{ symbol: "workspace", error: failureMessage(error) }],
      asOf: new Date().toISOString(),
    };
  }
}

export async function loadExpectationSignalsForAssets(
  assetIds: string[],
): Promise<Record<string, SwingExpectationSignal>> {
  if (!assetIds.length) return {};
  const db = await looseDb();
  const { data, error } = await db
    .from("analyst_expectation_snapshots")
    .select("*")
    .in("asset_id", assetIds)
    .order("observed_at", { ascending: false })
    .limit(Math.max(500, assetIds.length * 10));
  if (error) throw error;
  return buildSignals((data ?? []) as SnapshotDbRow[]);
}

export const getSwingExpectationsWorkspace = createServerFn({ method: "GET" }).handler(
  async (): Promise<SwingExpectationsWorkspace> => {
    try {
      const db = await looseDb();
      const { data, error } = await db
        .from("analyst_expectation_snapshots")
        .select("*")
        .order("observed_at", { ascending: false })
        .limit(1500);
      if (error) throw error;
      const byAsset = buildSignals((data ?? []) as SnapshotDbRow[]);
      const signals = Object.values(byAsset);
      const verified = signals
        .map((signal) => signal.lastVerifiedAt)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null;
      return {
        asOf: new Date().toISOString(),
        health: {
          trackedAssets: signals.length,
          freshAssets: signals.filter((signal) => signal.freshness === "fresh").length,
          warningAssets: signals.filter((signal) => signal.freshness === "warn").length,
          staleAssets: signals.filter((signal) => signal.freshness === "stale").length,
          quarantinedAssets: signals.filter((signal) => signal.validationState === "quarantined").length,
          lastVerifiedAt: verified,
        },
        byAsset,
      };
    } catch {
      return {
        asOf: new Date().toISOString(),
        health: {
          trackedAssets: 0,
          freshAssets: 0,
          warningAssets: 0,
          staleAssets: 0,
          quarantinedAssets: 0,
          lastVerifiedAt: null,
        },
        byAsset: {},
      };
    }
  },
);

async function ingestExpectationSnapshot(
  candidate: SwingWorkspaceCandidate,
): Promise<"refreshed" | "unchanged" | "quarantined"> {
  const { canUse } = await import("@/lib/ingestion/providers/quota.server");
  const gate = await canUse("fmp", FMP_DAILY_LIMIT, FMP_QUOTA_RESERVE);
  if (!gate.ok) throw new Error(gate.reason ?? "FMP quota unavailable");
  const key = process.env.FMP_API_KEY;
  if (!key) throw new Error("FMP_API_KEY missing");

  const estimatesPayload = await fmp(
    "analyst-estimates",
    candidate.symbol,
    key,
    { period: "annual", page: "0", limit: "10" },
  );
  await sleep(225);
  const consensusPayload = await fmp("price-target-consensus", candidate.symbol, key);
  await sleep(225);
  const summaryPayload = await fmp("price-target-summary", candidate.symbol, key);

  const estimates = toRows<FmpEstimateRow>(estimatesPayload);
  const targetConsensus = firstRow<FmpTargetConsensus>(consensusPayload);
  const targetSummary = firstRow<FmpTargetSummary>(summaryPayload);
  if (!estimates.length && !targetConsensus && !targetSummary) {
    throw new Error("FMP returned no analyst expectation evidence");
  }

  const forward = selectForwardEstimates(estimates);
  const nowIso = new Date().toISOString();
  const normalized = normalizePayload({
    candidate,
    forward,
    targetConsensus,
    targetSummary,
    estimates,
    rawConsensus: consensusPayload,
    rawSummary: summaryPayload,
  });

  const db = await looseDb();
  const prior = await latestAcceptedSnapshot(candidate.assetId, db);
  const validation = validateNormalized(normalized, prior);
  const confidence = expectationConfidence(normalized);
  const { createHash } = await import("node:crypto");
  const sourceHash = createHash("sha256")
    .update(JSON.stringify({ estimates, targetConsensus, targetSummary }))
    .digest("hex");

  const { data: existing, error: existingError } = await db
    .from("analyst_expectation_snapshots")
    .select("id,validation_state")
    .eq("asset_id", candidate.assetId)
    .eq("provider_code", "fmp")
    .eq("source_hash", sourceHash)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    const { error: verifyError } = await db
      .from("analyst_expectation_snapshots")
      .update({ last_verified_at: nowIso })
      .eq("id", existing.id);
    if (verifyError) throw verifyError;
    return existing.validation_state === "quarantined" ? "quarantined" : "unchanged";
  }

  const row = {
    asset_id: candidate.assetId,
    provider_code: "fmp",
    source_tier: "tier2_regulated",
    source_endpoints: ["analyst-estimates", "price-target-consensus", "price-target-summary"],
    source_hash: sourceHash,
    observed_at: nowIso,
    last_verified_at: nowIso,
    ingested_at: nowIso,
    listing_currency: candidate.currency,
    reference_price: positive(candidate.trade.metrics.current),
    fy1_date: forward[0]?.date ?? null,
    fy1_eps_avg: finite(forward[0]?.epsAvg),
    fy1_eps_low: finite(forward[0]?.epsLow),
    fy1_eps_high: finite(forward[0]?.epsHigh),
    fy1_eps_analysts: integer(forward[0]?.numAnalystsEps),
    fy1_revenue_avg: finite(forward[0]?.revenueAvg),
    fy1_revenue_low: finite(forward[0]?.revenueLow),
    fy1_revenue_high: finite(forward[0]?.revenueHigh),
    fy1_revenue_analysts: integer(forward[0]?.numAnalystsRevenue),
    fy2_date: forward[1]?.date ?? null,
    fy2_eps_avg: finite(forward[1]?.epsAvg),
    fy2_eps_low: finite(forward[1]?.epsLow),
    fy2_eps_high: finite(forward[1]?.epsHigh),
    fy2_eps_analysts: integer(forward[1]?.numAnalystsEps),
    fy2_revenue_avg: finite(forward[1]?.revenueAvg),
    fy2_revenue_low: finite(forward[1]?.revenueLow),
    fy2_revenue_high: finite(forward[1]?.revenueHigh),
    fy2_revenue_analysts: integer(forward[1]?.numAnalystsRevenue),
    target_consensus: finite(targetConsensus?.targetConsensus),
    target_median: finite(targetConsensus?.targetMedian),
    target_high: finite(targetConsensus?.targetHigh),
    target_low: finite(targetConsensus?.targetLow),
    target_last_month_avg: finite(targetSummary?.lastMonthAvgPriceTarget),
    target_last_month_count: integer(targetSummary?.lastMonthCount),
    target_last_quarter_avg: finite(targetSummary?.lastQuarterAvgPriceTarget),
    target_last_quarter_count: integer(targetSummary?.lastQuarterCount),
    target_last_year_avg: finite(targetSummary?.lastYearAvgPriceTarget),
    target_last_year_count: integer(targetSummary?.lastYearCount),
    target_publishers: publishers(targetSummary?.publishers),
    validation_state: validation.length ? "quarantined" : "accepted",
    validation_reasons: validation,
    confidence,
    raw_estimates: estimates,
    raw_target_consensus: targetConsensus ?? {},
    raw_target_summary: targetSummary ?? {},
  };
  const { error: insertError } = await db.from("analyst_expectation_snapshots").insert(row);
  if (insertError) throw insertError;
  return validation.length ? "quarantined" : "refreshed";
}

function buildSignals(rows: SnapshotDbRow[]): Record<string, SwingExpectationSignal> {
  const groups = new Map<string, AnalystExpectationSnapshot[]>();
  for (const row of rows) {
    const snapshot = fromDb(row);
    const list = groups.get(snapshot.assetId) ?? [];
    list.push(snapshot);
    groups.set(snapshot.assetId, list);
  }
  const output: Record<string, SwingExpectationSignal> = {};
  for (const [assetId, snapshots] of groups) {
    snapshots.sort((a, b) => b.observedAt.localeCompare(a.observedAt));
    const latest = snapshots[0] ?? null;
    const baseline = latest ? baselineFor(latest, snapshots.slice(1)) : null;
    output[assetId] = buildExpectationSignal(latest, baseline);
  }
  return output;
}

function baselineFor(
  latest: AnalystExpectationSnapshot,
  history: AnalystExpectationSnapshot[],
): AnalystExpectationSnapshot | null {
  const accepted = history.filter((row) => row.validationState === "accepted");
  if (!accepted.length) return null;
  const target = new Date(latest.observedAt).getTime() - 30 * 86_400_000;
  const sufficientlyOld = accepted.filter(
    (row) => new Date(latest.observedAt).getTime() - new Date(row.observedAt).getTime() >= 12 * 60 * 60_000,
  );
  if (!sufficientlyOld.length) return null;
  return sufficientlyOld.reduce((best, row) =>
    Math.abs(new Date(row.observedAt).getTime() - target) < Math.abs(new Date(best.observedAt).getTime() - target)
      ? row
      : best,
  );
}

function selectForwardEstimates(rows: FmpEstimateRow[]): FmpEstimateRow[] {
  const today = new Date().toISOString().slice(0, 10);
  return rows
    .filter((row) => typeof row.date === "string" && row.date >= today)
    .filter((row) => finite(row.epsAvg) !== null || finite(row.revenueAvg) !== null)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(0, 2);
}

function normalizePayload(input: {
  candidate: SwingWorkspaceCandidate;
  forward: FmpEstimateRow[];
  targetConsensus: FmpTargetConsensus | null;
  targetSummary: FmpTargetSummary | null;
  estimates: FmpEstimateRow[];
  rawConsensus: unknown;
  rawSummary: unknown;
}) {
  return {
    referencePrice: positive(input.candidate.trade.metrics.current),
    currency: input.candidate.currency,
    fy1: input.forward[0] ?? null,
    fy2: input.forward[1] ?? null,
    consensus: input.targetConsensus,
    summary: input.targetSummary,
  };
}

function validateNormalized(
  value: ReturnType<typeof normalizePayload>,
  prior: AnalystExpectationSnapshot | null,
): string[] {
  const reasons: string[] = [];
  const price = value.referencePrice;
  validateEstimateRange(value.fy1, "FY1", reasons);
  validateEstimateRange(value.fy2, "FY2", reasons);

  const low = finite(value.consensus?.targetLow);
  const median = finite(value.consensus?.targetMedian);
  const consensus = finite(value.consensus?.targetConsensus);
  const high = finite(value.consensus?.targetHigh);
  if (low !== null && high !== null && low > high) reasons.push("target_low_exceeds_target_high");
  if (median !== null && low !== null && median < low) reasons.push("target_median_below_target_low");
  if (median !== null && high !== null && median > high) reasons.push("target_median_above_high");
  if (consensus !== null && low !== null && consensus < low) reasons.push("target_consensus_below_target_low");
  if (consensus !== null && high !== null && consensus > high) reasons.push("target_consensus_above_target_high");

  for (const [label, targetValue] of [
    ["consensus", consensus],
    ["median", median],
    ["month_avg", finite(value.summary?.lastMonthAvgPriceTarget)],
    ["quarter_avg", finite(value.summary?.lastQuarterAvgPriceTarget)],
  ] as const) {
    if (targetValue !== null && targetValue <= 0) reasons.push(`target_${label}_non_positive`);
    if (targetValue !== null && price !== null) {
      const ratio = targetValue / price;
      if (ratio > 5 || ratio < 0.2) reasons.push(`target_${label}_extreme_vs_reference_price`);
    }
  }

  if (prior) {
    const next = snapshotFromNormalized(value);
    const targetRevision = safeRevision(next.targetConsensus, prior.targetConsensus);
    const epsRevision = sameDateRevision(next.fy1Date, next.fy1EpsAvg, prior.fy1Date, prior.fy1EpsAvg);
    const revenueRevision = sameDateRevision(next.fy1Date, next.fy1RevenueAvg, prior.fy1Date, prior.fy1RevenueAvg);
    if (targetRevision !== null && Math.abs(targetRevision) > 75) reasons.push("target_revision_over_75pct_requires_verification");
    if (epsRevision !== null && Math.abs(epsRevision) > 100) reasons.push("fy1_eps_revision_over_100pct_requires_verification");
    if (revenueRevision !== null && Math.abs(revenueRevision) > 50) reasons.push("fy1_revenue_revision_over_50pct_requires_verification");
  }
  return [...new Set(reasons)];
}

function validateEstimateRange(row: FmpEstimateRow | null, label: string, reasons: string[]) {
  if (!row) return;
  const epsLow = finite(row.epsLow);
  const epsAvg = finite(row.epsAvg);
  const epsHigh = finite(row.epsHigh);
  if (epsLow !== null && epsHigh !== null && epsLow > epsHigh) reasons.push(`${label.toLowerCase()}_eps_low_exceeds_high`);
  if (epsAvg !== null && epsLow !== null && epsAvg < epsLow) reasons.push(`${label.toLowerCase()}_eps_avg_below_low`);
  if (epsAvg !== null && epsHigh !== null && epsAvg > epsHigh) reasons.push(`${label.toLowerCase()}_eps_avg_above_high`);
  const revenueLow = finite(row.revenueLow);
  const revenueAvg = finite(row.revenueAvg);
  const revenueHigh = finite(row.revenueHigh);
  if (revenueLow !== null && revenueLow < 0) reasons.push(`${label.toLowerCase()}_revenue_negative`);
  if (revenueAvg !== null && revenueAvg < 0) reasons.push(`${label.toLowerCase()}_revenue_negative`);
  if (revenueHigh !== null && revenueHigh < 0) reasons.push(`${label.toLowerCase()}_revenue_negative`);
  if (revenueLow !== null && revenueHigh !== null && revenueLow > revenueHigh) reasons.push(`${label.toLowerCase()}_revenue_low_exceeds_high`);
  if (revenueAvg !== null && revenueLow !== null && revenueAvg < revenueLow) reasons.push(`${label.toLowerCase()}_revenue_avg_below_low`);
  if (revenueAvg !== null && revenueHigh !== null && revenueAvg > revenueHigh) reasons.push(`${label.toLowerCase()}_revenue_avg_above_high`);
  for (const count of [integer(row.numAnalystsEps), integer(row.numAnalystsRevenue)]) {
    if (count !== null && (count < 0 || count > 250)) reasons.push(`${label.toLowerCase()}_analyst_count_invalid`);
  }
}

function expectationConfidence(value: ReturnType<typeof normalizePayload>): number {
  let score = 0;
  const epsCount = integer(value.fy1?.numAnalystsEps) ?? 0;
  const revenueCount = integer(value.fy1?.numAnalystsRevenue) ?? 0;
  if (finite(value.fy1?.epsAvg) !== null) score += epsCount >= 5 ? 25 : epsCount >= 3 ? 18 : 8;
  if (finite(value.fy2?.epsAvg) !== null) score += (integer(value.fy2?.numAnalystsEps) ?? 0) >= 3 ? 15 : 7;
  if (finite(value.fy1?.revenueAvg) !== null) score += revenueCount >= 5 ? 15 : revenueCount >= 3 ? 10 : 5;
  if (finite(value.consensus?.targetConsensus) !== null) score += 20;
  const monthCount = integer(value.summary?.lastMonthCount) ?? 0;
  const quarterCount = integer(value.summary?.lastQuarterCount) ?? 0;
  if (finite(value.summary?.lastMonthAvgPriceTarget) !== null && monthCount >= 3) score += 15;
  if (finite(value.summary?.lastQuarterAvgPriceTarget) !== null && quarterCount >= 5) score += 10;
  return Math.min(100, score);
}

async function latestAcceptedSnapshot(assetId: string, db: any): Promise<AnalystExpectationSnapshot | null> {
  const { data, error } = await db
    .from("analyst_expectation_snapshots")
    .select("*")
    .eq("asset_id", assetId)
    .eq("validation_state", "accepted")
    .order("observed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? fromDb(data as SnapshotDbRow) : null;
}

function snapshotFromNormalized(value: ReturnType<typeof normalizePayload>): AnalystExpectationSnapshot {
  return {
    id: "pending",
    assetId: "pending",
    providerCode: "fmp",
    sourceTier: "tier2_regulated",
    observedAt: new Date().toISOString(),
    lastVerifiedAt: new Date().toISOString(),
    listingCurrency: value.currency,
    referencePrice: value.referencePrice,
    fy1Date: value.fy1?.date ?? null,
    fy1EpsAvg: finite(value.fy1?.epsAvg),
    fy1EpsLow: finite(value.fy1?.epsLow),
    fy1EpsHigh: finite(value.fy1?.epsHigh),
    fy1EpsAnalysts: integer(value.fy1?.numAnalystsEps),
    fy1RevenueAvg: finite(value.fy1?.revenueAvg),
    fy1RevenueLow: finite(value.fy1?.revenueLow),
    fy1RevenueHigh: finite(value.fy1?.revenueHigh),
    fy1RevenueAnalysts: integer(value.fy1?.numAnalystsRevenue),
    fy2Date: value.fy2?.date ?? null,
    fy2EpsAvg: finite(value.fy2?.epsAvg),
    fy2EpsLow: finite(value.fy2?.epsLow),
    fy2EpsHigh: finite(value.fy2?.epsHigh),
    fy2EpsAnalysts: integer(value.fy2?.numAnalystsEps),
    fy2RevenueAvg: finite(value.fy2?.revenueAvg),
    fy2RevenueLow: finite(value.fy2?.revenueLow),
    fy2RevenueHigh: finite(value.fy2?.revenueHigh),
    fy2RevenueAnalysts: integer(value.fy2?.numAnalystsRevenue),
    targetConsensus: finite(value.consensus?.targetConsensus),
    targetMedian: finite(value.consensus?.targetMedian),
    targetHigh: finite(value.consensus?.targetHigh),
    targetLow: finite(value.consensus?.targetLow),
    targetLastMonthAvg: finite(value.summary?.lastMonthAvgPriceTarget),
    targetLastMonthCount: integer(value.summary?.lastMonthCount),
    targetLastQuarterAvg: finite(value.summary?.lastQuarterAvgPriceTarget),
    targetLastQuarterCount: integer(value.summary?.lastQuarterCount),
    targetLastYearAvg: finite(value.summary?.lastYearAvgPriceTarget),
    targetLastYearCount: integer(value.summary?.lastYearCount),
    targetPublishers: publishers(value.summary?.publishers),
    validationState: "accepted",
    validationReasons: [],
    confidence: expectationConfidence(value),
  };
}

function fromDb(row: SnapshotDbRow): AnalystExpectationSnapshot {
  return {
    id: row.id,
    assetId: row.asset_id,
    providerCode: row.provider_code,
    sourceTier: row.source_tier,
    observedAt: row.observed_at,
    lastVerifiedAt: row.last_verified_at,
    listingCurrency: row.listing_currency,
    referencePrice: finite(row.reference_price),
    fy1Date: row.fy1_date,
    fy1EpsAvg: finite(row.fy1_eps_avg),
    fy1EpsLow: finite(row.fy1_eps_low),
    fy1EpsHigh: finite(row.fy1_eps_high),
    fy1EpsAnalysts: integer(row.fy1_eps_analysts),
    fy1RevenueAvg: finite(row.fy1_revenue_avg),
    fy1RevenueLow: finite(row.fy1_revenue_low),
    fy1RevenueHigh: finite(row.fy1_revenue_high),
    fy1RevenueAnalysts: integer(row.fy1_revenue_analysts),
    fy2Date: row.fy2_date,
    fy2EpsAvg: finite(row.fy2_eps_avg),
    fy2EpsLow: finite(row.fy2_eps_low),
    fy2EpsHigh: finite(row.fy2_eps_high),
    fy2EpsAnalysts: integer(row.fy2_eps_analysts),
    fy2RevenueAvg: finite(row.fy2_revenue_avg),
    fy2RevenueLow: finite(row.fy2_revenue_low),
    fy2RevenueHigh: finite(row.fy2_revenue_high),
    fy2RevenueAnalysts: integer(row.fy2_revenue_analysts),
    targetConsensus: finite(row.target_consensus),
    targetMedian: finite(row.target_median),
    targetHigh: finite(row.target_high),
    targetLow: finite(row.target_low),
    targetLastMonthAvg: finite(row.target_last_month_avg),
    targetLastMonthCount: integer(row.target_last_month_count),
    targetLastQuarterAvg: finite(row.target_last_quarter_avg),
    targetLastQuarterCount: integer(row.target_last_quarter_count),
    targetLastYearAvg: finite(row.target_last_year_avg),
    targetLastYearCount: integer(row.target_last_year_count),
    targetPublishers: stringArray(row.target_publishers),
    validationState: row.validation_state,
    validationReasons: stringArray(row.validation_reasons),
    confidence: finite(row.confidence) ?? 0,
  };
}

async function fmp(endpoint: string, symbol: string, key: string, params: Record<string, string> = {}): Promise<unknown> {
  const { recordCall } = await import("@/lib/ingestion/providers/quota.server");
  const url = new URL(`https://financialmodelingprep.com/stable/${endpoint}`);
  url.searchParams.set("symbol", symbol);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  url.searchParams.set("apikey", key);
  try {
    const response = await fetch(url.toString());
    if (!response.ok) {
      const status = response.status === 402
        ? "entitlement"
        : response.status === 429
          ? "rate_limit"
          : response.status === 401 || response.status === 403
            ? "auth"
            : "error";
      await recordCall("fmp", status, `${endpoint} HTTP ${response.status}`);
      if (response.status === 402) {
        throw new Error(`FMP ${endpoint} entitlement unavailable (HTTP 402)`);
      }
      throw new Error(`FMP ${endpoint} HTTP ${response.status}`);
    }
    const payload = await response.json() as unknown;
    await recordCall("fmp", "ok");
    return payload;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("FMP ")) throw error;
    await recordCall("fmp", "error", failureMessage(error));
    throw error;
  }
}

function toRows<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  return value && typeof value === "object" ? [value as T] : [];
}

function firstRow<T>(value: unknown): T | null {
  return toRows<T>(value)[0] ?? null;
}

function publishers(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [value];
  } catch {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function safeRevision(current: number | null, prior: number | null): number | null {
  if (current === null || prior === null || Math.abs(prior) < 0.05 || current * prior < 0) return null;
  return (current / prior - 1) * 100;
}

function sameDateRevision(
  currentDate: string | null,
  current: number | null,
  priorDate: string | null,
  prior: number | null,
): number | null {
  return currentDate && priorDate && currentDate === priorDate ? safeRevision(current, prior) : null;
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positive(value: unknown): number | null {
  const number = finite(value);
  return number !== null && number > 0 ? number : null;
}

function integer(value: unknown): number | null {
  const number = finite(value);
  return number === null ? null : Math.trunc(number);
}

function clampInt(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, Math.trunc(value)));
}

function failureMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const parts = [record.code, record.message, record.details, record.hint]
      .filter((value) => value !== null && value !== undefined && String(value).trim())
      .map(String);
    if (parts.length) return parts.join(" · ");
    try { return JSON.stringify(record); } catch { return String(error); }
  }
  return String(error);
}

function emptyRefreshSummary(): ExpectationRefreshSummary {
  return {
    attempted: 0,
    refreshed: 0,
    unchanged: 0,
    quarantined: 0,
    skippedFresh: 0,
    failures: [],
    asOf: new Date().toISOString(),
  };
}

async function looseDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabaseAdmin as any;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
