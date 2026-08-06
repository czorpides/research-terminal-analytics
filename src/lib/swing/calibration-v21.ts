import {
  evaluateSwingOutcome,
  type SwingOutcomeBar,
  type SwingOutcomeEvaluation,
} from "./outcomes.ts";
import type { SwingV2EntryState, SwingV2SetupType } from "./model-v2.ts";

export type SwingV21StopFloorAtr = 0.5 | 0.75 | 1;

export interface SwingV21CalibrationSignal {
  signalId?: string;
  setup: SwingV2SetupType;
  entryState: SwingV2EntryState;
  signalDate: string;
  entry: number;
  target: number;
  structuralStop: number;
  atr14: number | null;
  rankingScore: number;
  entryQuality: number;
  confirmationCount: number;
  timeStopSessions: number;
}

export interface SwingV21CalibrationResult {
  signal: SwingV21CalibrationSignal;
  stopFloorAtr: SwingV21StopFloorAtr;
  executionStop: number;
  riskPerShare: number;
  plannedRewardRisk: number;
  outcome: SwingOutcomeEvaluation;
  realisedR: number | null;
}

export interface SwingV21CalibrationBucket {
  key: string;
  label: string;
  sampleSize: number;
  targetHits: number;
  stopHits: number;
  expiries: number;
  nearMisses: number;
  positiveR: number;
  targetHitRate: number | null;
  positiveRRate: number | null;
  averageRealisedR: number | null;
  medianRealisedR: number | null;
  averageMaxFavourablePct: number | null;
  averageMaxAdversePct: number | null;
  averageWinR: number | null;
  averageLossR: number | null;
  payoffRatio: number | null;
  validated: boolean;
}

export interface SwingV21CalibrationSummary {
  stopFloorAtr: SwingV21StopFloorAtr;
  minimumSample: number;
  totalSignals: number;
  calibrationEligible: number;
  ambiguous: number;
  active: number;
  overall: SwingV21CalibrationBucket;
  bySetup: SwingV21CalibrationBucket[];
  byRankingScore: SwingV21CalibrationBucket[];
  byEntryQuality: SwingV21CalibrationBucket[];
  byConfirmationCount: SwingV21CalibrationBucket[];
}

export interface SwingV21BacktestCase {
  signal: SwingV21CalibrationSignal;
  bars: SwingOutcomeBar[];
}

export interface SwingV21StopFloorComparison {
  stopFloorAtr: SwingV21StopFloorAtr;
  summary: SwingV21CalibrationSummary;
}

const DEFAULT_STOP_FLOOR: SwingV21StopFloorAtr = 0.75;
const DEFAULT_MINIMUM_SAMPLE = 30;

/**
 * Evaluate one already-created v2.1 signal against future daily bars.
 *
 * This is deliberately separate from historical signal reconstruction. The
 * caller must supply only information that was knowable on the signal date.
 * Future bars are delegated to the existing conservative outcome evaluator,
 * which excludes the signal bar and marks same-bar stop/target crossings as
 * ambiguous rather than guessing their order.
 */
export function evaluateSwingV21CalibrationSignal(
  signal: SwingV21CalibrationSignal,
  bars: SwingOutcomeBar[],
  stopFloorAtr: SwingV21StopFloorAtr = DEFAULT_STOP_FLOOR,
): SwingV21CalibrationResult {
  validateSignal(signal);
  const executionStop = executionStopForFloor(signal, stopFloorAtr);
  const riskPerShare = signal.entry - executionStop;
  const plannedRewardRisk = (signal.target - signal.entry) / riskPerShare;
  const outcome = evaluateSwingOutcome(
    {
      signalDate: signal.signalDate,
      entry: signal.entry,
      target: signal.target,
      invalidation: executionStop,
      atr14: signal.atr14,
      horizonSessions: signal.timeStopSessions,
    },
    bars,
  );
  const realisedR = realisedRForOutcome(outcome, signal.entry, riskPerShare, plannedRewardRisk);

  return {
    signal,
    stopFloorAtr,
    executionStop: round(executionStop, 6),
    riskPerShare: round(riskPerShare, 6),
    plannedRewardRisk: round(plannedRewardRisk, 4),
    outcome,
    realisedR: realisedR === null ? null : round(realisedR, 4),
  };
}

export function summarizeSwingV21Calibration(
  results: SwingV21CalibrationResult[],
  minimumSample = DEFAULT_MINIMUM_SAMPLE,
): SwingV21CalibrationSummary {
  const floor = results[0]?.stopFloorAtr ?? DEFAULT_STOP_FLOOR;
  const eligible = results.filter(isCalibrationEligible);

  return {
    stopFloorAtr: floor,
    minimumSample,
    totalSignals: results.length,
    calibrationEligible: eligible.length,
    ambiguous: results.filter((result) => result.outcome.status === "ambiguous_same_bar").length,
    active: results.filter((result) => result.outcome.status === "active").length,
    overall: bucket("overall", "Overall", eligible, minimumSample),
    bySetup: bucketGroups(
      eligible,
      (result) => result.signal.setup,
      (key) => setupLabel(key as SwingV2SetupType),
      minimumSample,
    ),
    byRankingScore: scoreBuckets(
      eligible,
      (result) => result.signal.rankingScore,
      "rank",
      "Ranking score",
      minimumSample,
    ),
    byEntryQuality: scoreBuckets(
      eligible,
      (result) => result.signal.entryQuality,
      "entry",
      "Entry quality",
      minimumSample,
    ),
    byConfirmationCount: bucketGroups(
      eligible,
      (result) => confirmationBand(result.signal.confirmationCount),
      (key) => `Confirmations ${key}`,
      minimumSample,
    ),
  };
}

/**
 * Compare the defensive ATR stop-floor hypotheses against the exact same set
 * of historical signals and future bars. No threshold is selected or promoted
 * here; the output is evidence for later walk-forward calibration.
 */
export function compareSwingV21StopFloors(
  cases: SwingV21BacktestCase[],
  floors: SwingV21StopFloorAtr[] = [0.5, 0.75, 1],
  minimumSample = DEFAULT_MINIMUM_SAMPLE,
): SwingV21StopFloorComparison[] {
  return floors.map((stopFloorAtr) => {
    const results = cases.map(({ signal, bars }) =>
      evaluateSwingV21CalibrationSignal(signal, bars, stopFloorAtr),
    );
    return {
      stopFloorAtr,
      summary: summarizeSwingV21Calibration(results, minimumSample),
    };
  });
}

function executionStopForFloor(
  signal: SwingV21CalibrationSignal,
  stopFloorAtr: SwingV21StopFloorAtr,
): number {
  let stop = signal.structuralStop;
  if (signal.atr14 !== null && Number.isFinite(signal.atr14) && signal.atr14 > 0) {
    const floorStop = signal.entry - signal.atr14 * stopFloorAtr;
    if (floorStop > 0 && stop > floorStop) stop = floorStop;
  }
  if (!(stop > 0 && stop < signal.entry)) {
    throw new Error("Swing v2.1 calibration signal requires a positive stop below entry");
  }
  return stop;
}

function realisedRForOutcome(
  outcome: SwingOutcomeEvaluation,
  entry: number,
  riskPerShare: number,
  plannedRewardRisk: number,
): number | null {
  if (!outcome.calibrationEligible || riskPerShare <= 0) return null;
  if (outcome.status === "target_hit") return plannedRewardRisk;
  if (outcome.status === "stop_hit") return -1;
  if (outcome.status === "near_miss" || outcome.status === "expired") {
    if (outcome.latestReturnPct === null) return null;
    const returnPerShare = entry * outcome.latestReturnPct / 100;
    return returnPerShare / riskPerShare;
  }
  return null;
}

function isCalibrationEligible(result: SwingV21CalibrationResult): boolean {
  return result.outcome.calibrationEligible && result.realisedR !== null;
}

function bucket(
  key: string,
  label: string,
  rows: SwingV21CalibrationResult[],
  minimumSample: number,
): SwingV21CalibrationBucket {
  const realised = rows
    .map((row) => row.realisedR)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const wins = realised.filter((value) => value > 0);
  const losses = realised.filter((value) => value < 0);
  const averageWinR = average(wins);
  const averageLossR = average(losses);

  return {
    key,
    label,
    sampleSize: rows.length,
    targetHits: rows.filter((row) => row.outcome.status === "target_hit").length,
    stopHits: rows.filter((row) => row.outcome.status === "stop_hit").length,
    expiries: rows.filter((row) => row.outcome.status === "expired").length,
    nearMisses: rows.filter((row) => row.outcome.status === "near_miss").length,
    positiveR: wins.length,
    targetHitRate: rate(rows.filter((row) => row.outcome.status === "target_hit").length, rows.length),
    positiveRRate: rate(wins.length, realised.length),
    averageRealisedR: average(realised),
    medianRealisedR: median(realised),
    averageMaxFavourablePct: average(
      rows.map((row) => row.outcome.maxFavourablePct).filter(isFiniteNumber),
    ),
    averageMaxAdversePct: average(
      rows.map((row) => row.outcome.maxAdversePct).filter(isFiniteNumber),
    ),
    averageWinR,
    averageLossR,
    payoffRatio:
      averageWinR !== null && averageLossR !== null && averageLossR < 0
        ? round(averageWinR / Math.abs(averageLossR), 4)
        : null,
    validated: rows.length >= minimumSample,
  };
}

function bucketGroups(
  rows: SwingV21CalibrationResult[],
  keyFor: (row: SwingV21CalibrationResult) => string,
  labelFor: (key: string) => string,
  minimumSample: number,
): SwingV21CalibrationBucket[] {
  const groups = new Map<string, SwingV21CalibrationResult[]>();
  for (const row of rows) {
    const key = keyFor(row);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .map(([key, values]) => bucket(key, labelFor(key), values, minimumSample))
    .sort((left, right) => left.key.localeCompare(right.key));
}

function scoreBuckets(
  rows: SwingV21CalibrationResult[],
  valueFor: (row: SwingV21CalibrationResult) => number,
  prefix: string,
  label: string,
  minimumSample: number,
): SwingV21CalibrationBucket[] {
  const bands = [
    { key: `${prefix}:lt60`, label: `${label} <60`, low: Number.NEGATIVE_INFINITY, high: 60 },
    { key: `${prefix}:60-69`, label: `${label} 60-69`, low: 60, high: 70 },
    { key: `${prefix}:70-79`, label: `${label} 70-79`, low: 70, high: 80 },
    { key: `${prefix}:80+`, label: `${label} 80+`, low: 80, high: Number.POSITIVE_INFINITY },
  ];
  return bands.map((band) =>
    bucket(
      band.key,
      band.label,
      rows.filter((row) => {
        const value = valueFor(row);
        return value >= band.low && value < band.high;
      }),
      minimumSample,
    ),
  );
}

function confirmationBand(count: number): string {
  if (count <= 0) return "0";
  if (count === 1) return "1";
  if (count === 2) return "2";
  return "3+";
}

function setupLabel(setup: SwingV2SetupType): string {
  switch (setup) {
    case "trend_pullback": return "Trend Pullback";
    case "deep_mean_reversion": return "Deep Mean Reversion";
    case "sma200_bounce": return "200SMA Bounce / Reclaim";
    case "catalyst_repricing": return "Catalyst Repricing";
    case "base_breakout_retest": return "Base Breakout / Retest";
    case "commodity_macro": return "Commodity Macro Swing";
  }
}

function validateSignal(signal: SwingV21CalibrationSignal): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(signal.signalDate)) {
    throw new Error("Swing v2.1 calibration signal requires YYYY-MM-DD signalDate");
  }
  if (![signal.entry, signal.target, signal.structuralStop].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error("Swing v2.1 calibration signal requires positive finite entry/target/stop");
  }
  if (!(signal.target > signal.entry && signal.structuralStop < signal.entry)) {
    throw new Error("Swing v2.1 calibration signal requires target above entry and stop below entry");
  }
  if (!Number.isFinite(signal.timeStopSessions) || signal.timeStopSessions < 1) {
    throw new Error("Swing v2.1 calibration signal requires a positive time stop");
  }
}

function rate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? round(numerator / denominator * 100, 2) : null;
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length, 4);
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
  return round(value, 4);
}

function isFiniteNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
