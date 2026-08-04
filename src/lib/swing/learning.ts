import type { SwingComponents, SwingSetupType } from "./model";

export interface SwingLearningSignal {
  setupType: SwingSetupType;
  setupScore: number;
  highConviction: boolean;
  components: SwingComponents;
  metrics: Record<string, unknown>;
}

export interface SwingLearningPattern {
  key: string;
  label: string;
  sampleSize: number;
  wins: number;
  hitRate: number;
  validated: boolean;
}

export interface SwingEmpiricalOverlay {
  adjustment: number;
  expectationsAdjustment: number;
  totalAdjustment: number;
  rankScore: number;
  matchedPatterns: string[];
  evidenceCount: number;
  active: boolean;
}

const PRIOR_STRENGTH = 30;
const MAX_ADJUSTMENT = 5;
const MAX_EXPECTATIONS_ADJUSTMENT = 7;

/**
 * Converts validated historical pattern evidence into a deliberately small
 * ranking overlay. It does not rewrite the raw technical score. A separately
 * validated analyst-expectation overlay may also contribute to the ranking,
 * but remains visible and capped independently from the empirical outcome
 * adjustment.
 */
export function empiricalOverlayForSignal(
  signal: SwingLearningSignal,
  patterns: SwingLearningPattern[],
  baselineHitRate: number | null,
): SwingEmpiricalOverlay {
  const expectationsAdjustment = round(
    clamp(finite(signal.metrics.expectationsAdjustment) ?? 0, -MAX_EXPECTATIONS_ADJUSTMENT, MAX_EXPECTATIONS_ADJUSTMENT),
    2,
  );

  if (baselineHitRate === null || !Number.isFinite(baselineHitRate)) {
    return emptyOverlay(signal.setupScore, expectationsAdjustment);
  }

  const keys = new Set(conditionKeysForSignal(signal));
  const matched = patterns.filter(
    (pattern) => pattern.validated && pattern.sampleSize >= 30 && keys.has(pattern.key),
  );
  if (!matched.length) return emptyOverlay(signal.setupScore, expectationsAdjustment);

  const baseline = clamp(baselineHitRate, 1, 99);
  const deltas = matched.map((pattern) => {
    const smoothed =
      (pattern.wins * 100 + PRIOR_STRENGTH * baseline) /
      (pattern.sampleSize + PRIOR_STRENGTH);
    const reliability = Math.min(1, Math.sqrt(pattern.sampleSize / 100));
    return (smoothed - baseline) * reliability;
  });
  const meanDelta = deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
  // Roughly 5 percentage points of conservatively-smoothed hit-rate advantage
  // is worth one ranking point. The empirical overlay can never exceed +/-5.
  const adjustment = round(clamp(meanDelta / 5, -MAX_ADJUSTMENT, MAX_ADJUSTMENT), 2);
  const totalAdjustment = round(adjustment + expectationsAdjustment, 2);
  return {
    adjustment,
    expectationsAdjustment,
    totalAdjustment,
    rankScore: round(clamp(signal.setupScore + totalAdjustment, 0, 100), 2),
    matchedPatterns: matched.map((pattern) => pattern.label),
    evidenceCount: matched.length,
    active: true,
  };
}

export function conditionKeysForSignal(signal: SwingLearningSignal): string[] {
  const keys = [`setup:${signal.setupType}`];
  if (signal.setupScore >= 80) keys.push("score:80");
  if (signal.highConviction) keys.push("high_conviction");
  if (signal.components.confirmation?.score >= 70) keys.push("confirmation:70");
  if (signal.components.location?.score >= 65) keys.push("location:65");
  if (signal.components.volume?.score >= 70) keys.push("volume:70");
  if (signal.components.regime?.available && signal.components.regime.score >= 60) keys.push("regime:60");
  const rsi = finite(signal.metrics.rsi14);
  if (rsi !== null && rsi >= 35 && rsi <= 55) keys.push("rsi:35-55");
  const relativeVolume = finite(signal.metrics.relativeVolume20);
  if (relativeVolume !== null && relativeVolume >= 1.2) keys.push("relvol:1.2");
  return keys;
}

function emptyOverlay(score: number, expectationsAdjustment: number): SwingEmpiricalOverlay {
  return {
    adjustment: 0,
    expectationsAdjustment,
    totalAdjustment: expectationsAdjustment,
    rankScore: round(clamp(score + expectationsAdjustment, 0, 100), 2),
    matchedPatterns: [],
    evidenceCount: 0,
    active: false,
  };
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
