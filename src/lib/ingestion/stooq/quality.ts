import type { StooqBar } from "./client.server";

export interface QualityIssue {
  code: "missing_fields" | "stale_latest" | "unexpected_gap" | "empty" | "non_monotonic" | "negative_price";
  severity: "warn" | "block";
  detail: string;
}

export interface QualityReport {
  passed: boolean;
  blocked: boolean;
  issues: QualityIssue[];
  latestDate: string | null;
  rowCount: number;
  missingFieldCount: number;
  maxGapBusinessDays: number;
  ageBusinessDays: number | null;
}

const MAX_STALE_BDAYS = 5;
const MAX_GAP_BDAYS = 5;

function businessDaysBetween(a: Date, b: Date): number {
  const ms = Math.abs(b.getTime() - a.getTime());
  const days = Math.floor(ms / 86_400_000);
  // Approximation: 5/7 of calendar days
  return Math.floor(days * 5 / 7);
}

/**
 * Validate a batch of Stooq bars. `existingLatest` is the most recent stored
 * trade_date for the asset (used to catch stale providers even when the diff
 * window returned zero rows). Returns a report; scoring must skip assets
 * whose latest ingestion is `blocked`.
 */
export function validateStooqBars(
  bars: StooqBar[],
  opts: { existingLatest?: string | null; now?: Date } = {},
): QualityReport {
  const now = opts.now ?? new Date();
  const issues: QualityIssue[] = [];
  let missingFieldCount = 0;
  let negativeCount = 0;
  let nonMonotonic = 0;

  const clean: StooqBar[] = [];
  let lastDate: string | null = null;
  for (const b of bars) {
    const missing = b.close === null || b.open === null || b.high === null || b.low === null;
    if (missing) { missingFieldCount++; continue; }
    if ((b.close ?? 0) <= 0) { negativeCount++; continue; }
    if (lastDate && b.date <= lastDate) nonMonotonic++;
    lastDate = b.date;
    clean.push(b);
  }

  if (missingFieldCount > 0) {
    issues.push({
      code: "missing_fields",
      severity: missingFieldCount > bars.length * 0.1 ? "block" : "warn",
      detail: `${missingFieldCount}/${bars.length} rows dropped for missing OHLC.`,
    });
  }
  if (negativeCount > 0) {
    issues.push({ code: "negative_price", severity: "block", detail: `${negativeCount} rows with non-positive close.` });
  }
  if (nonMonotonic > 0) {
    issues.push({ code: "non_monotonic", severity: "warn", detail: `${nonMonotonic} out-of-order dates.` });
  }

  const latestDate = clean.length > 0 ? clean[clean.length - 1].date : (opts.existingLatest ?? null);
  const ageBDays = latestDate ? businessDaysBetween(new Date(`${latestDate}T21:00:00Z`), now) : null;

  if (bars.length === 0 && !opts.existingLatest) {
    issues.push({ code: "empty", severity: "block", detail: "Provider returned zero rows and no history exists." });
  }

  if (ageBDays !== null && ageBDays > MAX_STALE_BDAYS) {
    issues.push({
      code: "stale_latest",
      severity: "block",
      detail: `Latest bar ${latestDate} is ~${ageBDays} business days old (max ${MAX_STALE_BDAYS}).`,
    });
  }

  // Gap detection within the new batch
  let maxGap = 0;
  for (let i = 1; i < clean.length; i++) {
    const gap = businessDaysBetween(new Date(clean[i - 1].date), new Date(clean[i].date));
    if (gap > maxGap) maxGap = gap;
  }
  if (maxGap > MAX_GAP_BDAYS) {
    issues.push({
      code: "unexpected_gap",
      severity: "block",
      detail: `Largest intra-batch gap ~${maxGap} business days (max ${MAX_GAP_BDAYS}).`,
    });
  }

  const blocked = issues.some((i) => i.severity === "block");
  return {
    passed: issues.length === 0,
    blocked,
    issues,
    latestDate,
    rowCount: clean.length,
    missingFieldCount,
    maxGapBusinessDays: maxGap,
    ageBusinessDays: ageBDays,
  };
}