// Freshness policy per data category. See spec §19 / seed rows in source_freshness_policies.
export type DataCategory =
  | "macro_release"
  | "price_daily"
  | "price_intraday"
  | "fundamentals"
  | "earnings"
  | "news"
  | "commodity"
  | "fx"
  | "alt_data"
  | "corporate_action";

export interface FreshnessPolicy {
  maxAgeSeconds: number;
  warnAgeSeconds: number;
}

export const DEFAULT_FRESHNESS: Record<DataCategory, FreshnessPolicy> = {
  macro_release:    { maxAgeSeconds: 60 * 60 * 24 * 7,   warnAgeSeconds: 60 * 60 * 24 * 2 },
  price_daily:      { maxAgeSeconds: 60 * 60 * 24 * 2,   warnAgeSeconds: 60 * 60 * 24 },
  price_intraday:   { maxAgeSeconds: 60 * 10,            warnAgeSeconds: 60 * 2 },
  fundamentals:     { maxAgeSeconds: 60 * 60 * 24 * 100, warnAgeSeconds: 60 * 60 * 24 * 45 },
  earnings:         { maxAgeSeconds: 60 * 60 * 24 * 2,   warnAgeSeconds: 60 * 60 * 12 },
  news:             { maxAgeSeconds: 60 * 60 * 6,        warnAgeSeconds: 60 * 60 },
  commodity:        { maxAgeSeconds: 60 * 60 * 6,        warnAgeSeconds: 60 * 60 },
  fx:               { maxAgeSeconds: 60 * 10,            warnAgeSeconds: 60 * 2 },
  alt_data:         { maxAgeSeconds: 60 * 60 * 24 * 3,   warnAgeSeconds: 60 * 60 * 24 },
  corporate_action: { maxAgeSeconds: 60 * 60 * 24 * 3,   warnAgeSeconds: 60 * 60 * 12 },
};

export type FreshnessState = "fresh" | "warn" | "stale";

export function freshnessState(
  ageSeconds: number,
  policy: FreshnessPolicy,
): FreshnessState {
  if (ageSeconds >= policy.maxAgeSeconds) return "stale";
  if (ageSeconds >= policy.warnAgeSeconds) return "warn";
  return "fresh";
}

/** 1.0 fresh → 0.0 fully stale, linear between warn and max. */
export function freshnessScore(ageSeconds: number, policy: FreshnessPolicy): number {
  if (ageSeconds <= policy.warnAgeSeconds) return 1;
  if (ageSeconds >= policy.maxAgeSeconds) return 0;
  const range = policy.maxAgeSeconds - policy.warnAgeSeconds;
  return 1 - (ageSeconds - policy.warnAgeSeconds) / range;
}