/**
 * Registry-driven runner. Consumers pass the indicator's
 * `allowed_transformations` list; anything outside the list is silently
 * skipped so a rogue transform can never be persisted for the wrong series.
 */
import { createHash } from "crypto";
import type { Frequency, SeriesPoint, TransformName, TransformResult } from "./types";
import { SPECS, computeOne } from "./catalog";

export const TRANSFORM_FRAMEWORK_VERSION = "transforms.v1.0";

function hashSeries(series: SeriesPoint[]): string {
  const payload = series.map((p) => `${p.date}|${p.value == null ? "" : p.value}`).join("\n");
  return createHash("sha256").update(payload).digest("hex");
}

export interface RunTransformsInput {
  series: SeriesPoint[];
  allowed: TransformName[];
  frequency: Frequency;
  seasonalAdjusted?: boolean;
  calcVersion?: string;
}

export function runTransforms(input: RunTransformsInput): TransformResult[] {
  const cv = input.calcVersion ?? TRANSFORM_FRAMEWORK_VERSION;
  const inputsHash = hashSeries(input.series);
  const nowIso = new Date().toISOString();
  const results: TransformResult[] = [];
  const seen = new Set<TransformName>();
  for (const name of input.allowed) {
    if (seen.has(name)) continue;
    seen.add(name);
    const spec = SPECS[name];
    if (!spec) continue;
    const points = computeOne(name, input.series, input.frequency);
    results.push({
      name, spec, points, calcVersion: cv, computedAt: nowIso, inputsHash,
      frequency: input.frequency, seasonalAdjusted: Boolean(input.seasonalAdjusted),
      lookback: spec.minHistory,
    });
  }
  return results;
}

/** Convenience: latest non-null point of a transform, or null. */
export function latestOf(result: TransformResult | undefined): number | null {
  if (!result) return null;
  for (let i = result.points.length - 1; i >= 0; i--) {
    if (result.points[i].value != null) return result.points[i].value as number;
  }
  return null;
}