export type EvidenceFreshnessState = "fresh" | "warning" | "stale" | "missing";

export interface EvidenceFreshness {
  state: EvidenceFreshnessState;
  asOf: string | null;
  ageDays: number | null;
  detail: string;
}

export interface CandidateEvidenceFreshness {
  technical: EvidenceFreshness & { requiredAfter: string | null };
  fundamentals: EvidenceFreshness;
}

export const FUNDAMENTAL_FRESH_DAYS = 45;
export const FUNDAMENTAL_STALE_DAYS = 100;

export function classifyFundamentalFreshness(
  asOf: string | null | undefined,
  nowMs = Date.now(),
): EvidenceFreshness {
  const timestamp = parseTimestamp(asOf);
  if (timestamp === null) {
    return {
      state: "missing",
      asOf: null,
      ageDays: null,
      detail: "No current fundamental as-of timestamp is available.",
    };
  }

  const ageDays = Math.max(0, (nowMs - timestamp) / 86_400_000);
  if (ageDays <= FUNDAMENTAL_FRESH_DAYS) {
    return {
      state: "fresh",
      asOf: new Date(timestamp).toISOString(),
      ageDays,
      detail: `Fundamentals are ${formatAge(ageDays)} old.`,
    };
  }
  if (ageDays <= FUNDAMENTAL_STALE_DAYS) {
    return {
      state: "warning",
      asOf: new Date(timestamp).toISOString(),
      ageDays,
      detail: `Fundamentals are ${formatAge(ageDays)} old; confidence is reduced until refreshed.`,
    };
  }
  return {
    state: "stale",
    asOf: new Date(timestamp).toISOString(),
    ageDays,
    detail: `Fundamentals are ${formatAge(ageDays)} old and are too stale for live Opportunity ranking.`,
  };
}

export function classifyTechnicalFreshness(
  scoreTimes: Array<string | null | undefined>,
  latestBulkFinishedAt: string | null | undefined,
): EvidenceFreshness & { requiredAfter: string | null } {
  const bulkTimestamp = parseTimestamp(latestBulkFinishedAt);
  const validScoreTimes = scoreTimes
    .map((value) => ({ value: value ?? null, timestamp: parseTimestamp(value) }))
    .filter((value): value is { value: string; timestamp: number } => value.timestamp !== null && value.value !== null);

  if (bulkTimestamp === null) {
    return {
      state: "missing",
      asOf: oldestIso(validScoreTimes.map((item) => item.timestamp)),
      ageDays: null,
      requiredAfter: null,
      detail: "No successful authoritative full-universe EOD run is available for score freshness comparison.",
    };
  }
  if (validScoreTimes.length < scoreTimes.length || scoreTimes.length === 0) {
    return {
      state: "missing",
      asOf: oldestIso(validScoreTimes.map((item) => item.timestamp)),
      ageDays: null,
      requiredAfter: new Date(bulkTimestamp).toISOString(),
      detail: "Momentum, trend and volatility have not all been calculated for this asset.",
    };
  }

  const oldestScore = Math.min(...validScoreTimes.map((item) => item.timestamp));
  if (oldestScore < bulkTimestamp) {
    return {
      state: "stale",
      asOf: new Date(oldestScore).toISOString(),
      ageDays: Math.max(0, (Date.now() - oldestScore) / 86_400_000),
      requiredAfter: new Date(bulkTimestamp).toISOString(),
      detail: "At least one technical score predates the latest authoritative EOD refresh.",
    };
  }

  return {
    state: "fresh",
    asOf: new Date(oldestScore).toISOString(),
    ageDays: Math.max(0, (Date.now() - oldestScore) / 86_400_000),
    requiredAfter: new Date(bulkTimestamp).toISOString(),
    detail: "Momentum, trend and volatility were all recomputed after the latest authoritative EOD refresh.",
  };
}

export function freshnessConfidenceMultiplier(state: EvidenceFreshnessState): number {
  if (state === "fresh") return 1;
  if (state === "warning") return 0.72;
  return 0;
}

export function freshnessBlocks(freshness: CandidateEvidenceFreshness): string[] {
  const blocks: string[] = [];
  if (freshness.technical.state === "stale" || freshness.technical.state === "missing") {
    blocks.push("Technical evidence is not current to the latest authoritative EOD refresh.");
  }
  if (freshness.fundamentals.state === "stale" || freshness.fundamentals.state === "missing") {
    blocks.push("Current fundamental evidence is stale or unavailable for live ranking.");
  }
  return blocks;
}

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function oldestIso(values: number[]): string | null {
  return values.length ? new Date(Math.min(...values)).toISOString() : null;
}

function formatAge(days: number): string {
  if (days < 1) return "under one day";
  return `${Math.floor(days)} day${Math.floor(days) === 1 ? "" : "s"}`;
}
