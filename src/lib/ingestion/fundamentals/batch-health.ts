export interface FundamentalsBatchItem {
  status: "success" | "failed" | "skipped";
  rowsInserted: number;
  reason?: string;
  error?: string;
}
export interface FundamentalsBatchSummary {
  outcome: "updated" | "partial" | "blocked" | "failed" | "unavailable";
  httpStatus: 200 | 207 | 424 | 502 | 503;
  successful: number;
  failed: number;
  skipped: number;
  rowsInserted: number;
  entitlementBlocked: boolean;
  needsAttention: boolean;
}
/**
 * A cron or network HTTP completion must not be conflated with observations.
 * In particular HTTP 402 entitlements must never yield a healthy HTTP 200.
 */
export function summarizeFundamentalsBatch(
  results: FundamentalsBatchItem[],
): FundamentalsBatchSummary {
  const successful = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const rowsInserted = results.reduce((sum, r) =>
    sum + (r.status === "success" && Number.isFinite(r.rowsInserted)
      ? Math.max(0, r.rowsInserted)
      : 0), 0);
  const entitlementBlocked = results.some((r) =>
    /entitlement unavailable|http 402/i.test(r.reason ?? r.error ?? ""));
  const all = results.length;
  const outcome = entitlementBlocked && successful === 0
    ? "blocked"
    : successful > 0 && (failed > 0 || skipped > 0)
      ? "partial"
      : successful > 0 && rowsInserted > 0
        ? "updated"
        : failed > 0
          ? "failed"
          : "unavailable";
  const httpStatus = outcome === "blocked" ? 503
    : outcome === "partial" ? 207
      : outcome === "updated" ? 200
        : outcome === "failed" ? 502 : 424;
  return {
    outcome, httpStatus, successful, failed, skipped, rowsInserted,
    entitlementBlocked, needsAttention: outcome !== "updated" || all === 0,
  };
}
