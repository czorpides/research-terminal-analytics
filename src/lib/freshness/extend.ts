import type { ChartPoint } from "@/lib/panels/contract";

export type Cadence = "intraday" | "hourly" | "daily" | "weekly" | "monthly" | "quarterly";

function stepMs(c: Cadence): number {
  switch (c) {
    case "intraday": return 15 * 60_000;
    case "hourly":   return 60 * 60_000;
    case "daily":    return 24 * 60 * 60_000;
    case "weekly":   return 7 * 24 * 60 * 60_000;
    case "monthly":  return 30 * 24 * 60 * 60_000;
    case "quarterly":return 91 * 24 * 60 * 60_000;
  }
}

/**
 * Forward-fill a time series with `stale: true` points up to `today` so
 * every chart line reaches the current date. Never overwrites real
 * observations. Returns a new array.
 */
export function extendSeriesToToday(
  points: ChartPoint[],
  cadence: Cadence,
  now: Date = new Date(),
): ChartPoint[] {
  if (points.length === 0) return points;
  const step = stepMs(cadence);
  const last = points[points.length - 1];
  const lastMs = new Date(last.t).getTime();
  const nowMs = now.getTime();
  if (!Number.isFinite(lastMs) || nowMs - lastMs <= step) return points;

  const out = [...points];
  let cursor = lastMs + step;
  // Cap forward fill so we never insert more than ~90 fake steps
  const cap = 90;
  let added = 0;
  while (cursor <= nowMs && added < cap) {
    const iso = cadence === "daily" || cadence === "weekly" || cadence === "monthly" || cadence === "quarterly"
      ? new Date(cursor).toISOString().slice(0, 10)
      : new Date(cursor).toISOString();
    out.push({ t: iso, v: last.v, stale: true });
    cursor += step;
    added += 1;
  }
  return out;
}
