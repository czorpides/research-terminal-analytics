/**
 * Context-aware traffic-light rules. `zoneFor` supports three modes:
 *   - target-band: green when value is inside `band`, yellow near it, red outside
 *   - lower_is_better / higher_is_better: green/yellow/red by percentile of history
 */
import type { Directionality, TargetRange, Zone } from "./types";

export function zoneForTarget(value: number | null, target: TargetRange | null): Zone {
  if (value == null || !target) return "gray";
  const [lo, hi] = target.band;
  if (value >= lo && value <= hi) return "green";
  const width = Math.max(1e-6, hi - lo);
  const dist = value < lo ? lo - value : value - hi;
  return dist <= 0.5 * width ? "yellow" : "red";
}

export function zoneForDirection(value: number | null, history: number[], dir: Directionality): Zone {
  if (value == null || history.length < 12) return "gray";
  const sorted = history.slice().sort((a, b) => a - b);
  let idx = 0;
  while (idx < sorted.length && sorted[idx] <= value) idx++;
  const pct = idx / sorted.length;
  if (dir === "context") return "gray";
  const good = dir === "higher_is_better" ? pct : 1 - pct;
  if (good >= 0.66) return "green";
  if (good >= 0.33) return "yellow";
  return "red";
}

export function zoneFor(
  value: number | null,
  ctx: { target?: TargetRange | null; history?: number[]; direction?: Directionality },
): Zone {
  if (ctx.target) return zoneForTarget(value, ctx.target);
  return zoneForDirection(value, ctx.history ?? [], ctx.direction ?? "context");
}