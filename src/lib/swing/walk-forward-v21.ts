import {
  evaluateSwingV21CalibrationSignal,
  summarizeSwingV21Calibration,
  type SwingV21BacktestCase,
  type SwingV21CalibrationResult,
  type SwingV21CalibrationSummary,
  type SwingV21StopFloorAtr,
} from "./calibration-v21.ts";
import type { SwingV2EntryState, SwingV2SetupType } from "./model-v2.ts";

export interface SwingV21WalkForwardHypothesis {
  id: string;
  label: string;
  stopFloorAtr: SwingV21StopFloorAtr;
  control?: boolean;
  selectable?: boolean;
  entryStates?: SwingV2EntryState[];
  setups?: SwingV2SetupType[];
  minimumPlannedRewardRisk?: number;
  minimumRankingScore?: number;
  minimumEntryQuality?: number;
  minimumConfirmations?: number;
  notes?: string[];
}

export interface SwingV21WalkForwardConfig {
  trainMonths: number;
  validationMonths: number;
  testMonths: number;
  stepMonths?: number;
  startDate?: string;
  /** Inclusive final signal date eligible for the walk-forward study. */
  endDate?: string;
  minimumTrainSample?: number;
  minimumValidationSample?: number;
  minimumTestSample?: number;
  requirePositiveTrain?: boolean;
  requirePositiveValidation?: boolean;
}

export interface SwingV21DateRange {
  startDate: string;
  /** Half-open boundary: cases on this date belong to the next segment. */
  endDateExclusive: string;
}

export interface SwingV21WalkForwardWindowDefinition {
  index: number;
  train: SwingV21DateRange;
  validation: SwingV21DateRange;
  test: SwingV21DateRange;
}

export interface SwingV21WalkForwardMetrics {
  range: SwingV21DateRange;
  signalsInRange: number;
  selectedSignals: number;
  calibrationEligible: number;
  unresolved: number;
  ambiguous: number;
  totalRealisedR: number | null;
  averageRealisedR: number | null;
  medianRealisedR: number | null;
  positiveRRate: number | null;
  targetHitRate: number | null;
  averageWinR: number | null;
  averageLossR: number | null;
  payoffRatio: number | null;
  maximumSignalSequenceDrawdownR: number | null;
  averageMaxFavourablePct: number | null;
  averageMaxAdversePct: number | null;
  validated: boolean;
  summary: SwingV21CalibrationSummary;
}

export interface SwingV21WalkForwardHypothesisWindowResult {
  hypothesisId: string;
  train: SwingV21WalkForwardMetrics;
  validation: SwingV21WalkForwardMetrics;
  test: SwingV21WalkForwardMetrics;
  selectionEligible: boolean;
  selectionReason: string;
}

export interface SwingV21WalkForwardWindowResult extends SwingV21WalkForwardWindowDefinition {
  hypotheses: SwingV21WalkForwardHypothesisWindowResult[];
  selectedHypothesisId: string | null;
  selectedTest: SwingV21WalkForwardMetrics | null;
}

export interface SwingV21WalkForwardStability {
  hypothesisId: string;
  testWindows: number;
  validatedTestWindows: number;
  positiveValidatedTestWindows: number;
  positiveValidatedTestWindowRate: number | null;
  totalEligibleTestSignals: number;
  totalTestRealisedR: number | null;
  weightedAverageTestR: number | null;
  medianWindowAverageTestR: number | null;
  worstWindowSignalSequenceDrawdownR: number | null;
  selectedWindows: number;
}

export interface SwingV21SelectedStrategyStability {
  selectedWindows: number;
  validatedSelectedWindows: number;
  positiveValidatedSelectedWindows: number;
  positiveValidatedSelectedWindowRate: number | null;
  totalEligibleTestSignals: number;
  totalTestRealisedR: number | null;
  weightedAverageTestR: number | null;
  medianWindowAverageTestR: number | null;
  worstWindowSignalSequenceDrawdownR: number | null;
}

export interface SwingV21WalkForwardReport {
  config: Required<Pick<
    SwingV21WalkForwardConfig,
    | "trainMonths"
    | "validationMonths"
    | "testMonths"
    | "stepMonths"
    | "minimumTrainSample"
    | "minimumValidationSample"
    | "minimumTestSample"
    | "requirePositiveTrain"
    | "requirePositiveValidation"
  >> & Pick<SwingV21WalkForwardConfig, "startDate" | "endDate">;
  hypotheses: SwingV21WalkForwardHypothesis[];
  controlHypothesisId: string | null;
  windows: SwingV21WalkForwardWindowResult[];
  stabilityByHypothesis: SwingV21WalkForwardStability[];
  selectedStrategy: SwingV21SelectedStrategyStability;
  warnings: string[];
}

const DEFAULT_MINIMUM_SAMPLE = 30;

/**
 * Conservative one-axis-at-a-time research suite around the current v2.1
 * execution policy. Looser 1.5R actionability is deliberately excluded: the
 * reconstructed `entryState` already embeds the production 2.0R gate, so a
 * lower threshold cannot honestly resurrect signals without rerunning the full
 * point-in-time model under that counterfactual rule.
 */
export function defaultSwingV21WalkForwardHypotheses(): SwingV21WalkForwardHypothesis[] {
  return [
    {
      id: "control",
      label: "Control: 0.75 ATR / 2.0R",
      stopFloorAtr: 0.75,
      control: true,
      entryStates: ["actionable"],
      minimumPlannedRewardRisk: 2,
    },
    {
      id: "stop_050",
      label: "Stop floor: 0.50 ATR",
      stopFloorAtr: 0.5,
      entryStates: ["actionable"],
      minimumPlannedRewardRisk: 2,
    },
    {
      id: "stop_100",
      label: "Stop floor: 1.00 ATR",
      stopFloorAtr: 1,
      entryStates: ["actionable"],
      minimumPlannedRewardRisk: 2,
    },
    {
      id: "rr_250",
      label: "Minimum planned R:R: 2.5x",
      stopFloorAtr: 0.75,
      entryStates: ["actionable"],
      minimumPlannedRewardRisk: 2.5,
    },
    {
      id: "confirmations_2",
      label: "At least 2 confirmations",
      stopFloorAtr: 0.75,
      entryStates: ["actionable"],
      minimumPlannedRewardRisk: 2,
      minimumConfirmations: 2,
    },
    {
      id: "rank_70",
      label: "Ranking score at least 70",
      stopFloorAtr: 0.75,
      entryStates: ["actionable"],
      minimumPlannedRewardRisk: 2,
      minimumRankingScore: 70,
    },
    {
      id: "entry_70",
      label: "Entry quality at least 70",
      stopFloorAtr: 0.75,
      entryStates: ["actionable"],
      minimumPlannedRewardRisk: 2,
      minimumEntryQuality: 70,
    },
  ];
}

/**
 * Build fixed-length chronological train -> validation -> test windows.
 * Test windows are non-overlapping when stepMonths === testMonths (the default).
 */
export function buildSwingV21WalkForwardWindows(
  cases: SwingV21BacktestCase[],
  config: SwingV21WalkForwardConfig,
): SwingV21WalkForwardWindowDefinition[] {
  const normalized = normalizeConfig(config);
  const dates = cases
    .map((row) => row.signal.signalDate)
    .filter(validDate)
    .sort();
  if (!dates.length) return [];

  const dataStart = normalized.startDate ?? dates[0];
  const dataEndExclusive = normalized.endDate
    ? addDays(normalized.endDate, 1)
    : addDays(dates.at(-1)!, 1);
  const windows: SwingV21WalkForwardWindowDefinition[] = [];

  let trainStart = dataStart;
  let index = 0;
  while (true) {
    const trainEnd = addMonths(trainStart, normalized.trainMonths);
    const validationEnd = addMonths(trainEnd, normalized.validationMonths);
    const testEnd = addMonths(validationEnd, normalized.testMonths);
    if (testEnd > dataEndExclusive) break;

    windows.push({
      index,
      train: { startDate: trainStart, endDateExclusive: trainEnd },
      validation: { startDate: trainEnd, endDateExclusive: validationEnd },
      test: { startDate: validationEnd, endDateExclusive: testEnd },
    });
    trainStart = addMonths(trainStart, normalized.stepMonths);
    index += 1;
  }
  return windows;
}

/**
 * Run a purged chronological walk-forward evaluation.
 *
 * Every segment clips future outcome bars at its own end boundary. A validation
 * signal that only resolves during the later test period therefore remains
 * unresolved for selection purposes and cannot leak future information into
 * the chosen hypothesis.
 *
 * Hypothesis selection uses train + validation only. Test metrics are read only
 * after selection and never participate in ranking the hypotheses.
 */
export function evaluateSwingV21WalkForward(
  cases: SwingV21BacktestCase[],
  hypotheses: SwingV21WalkForwardHypothesis[] = defaultSwingV21WalkForwardHypotheses(),
  config: SwingV21WalkForwardConfig,
): SwingV21WalkForwardReport {
  const normalized = normalizeConfig(config);
  validateHypotheses(hypotheses);
  const windows = buildSwingV21WalkForwardWindows(cases, normalized);
  const controlHypothesisId = hypotheses.find((row) => row.control)?.id ?? null;
  const results: SwingV21WalkForwardWindowResult[] = windows.map((window) => {
    const evaluated = hypotheses.map((hypothesis) => {
      const train = evaluateRange(cases, hypothesis, window.train, normalized.minimumTrainSample);
      const validation = evaluateRange(
        cases,
        hypothesis,
        window.validation,
        normalized.minimumValidationSample,
      );
      const test = evaluateRange(cases, hypothesis, window.test, normalized.minimumTestSample);
      const eligibility = selectionEligibility(hypothesis, train, validation, normalized);
      return {
        hypothesisId: hypothesis.id,
        train,
        validation,
        test,
        selectionEligible: eligibility.eligible,
        selectionReason: eligibility.reason,
      };
    });

    const selected = selectHypothesis(evaluated, hypotheses);
    return {
      ...window,
      hypotheses: evaluated,
      selectedHypothesisId: selected?.hypothesisId ?? null,
      selectedTest: selected?.test ?? null,
    };
  });

  const warnings = [
    "Walk-forward hypothesis selection uses train and validation metrics only; test results never participate in selection.",
    "Outcome bars are clipped at each segment boundary. Late unresolved signals are excluded from calibration rather than allowed to resolve using future segments.",
    "Hypotheses operate on the already reconstructed signal population. They can tighten filters or alter execution stop floors, but they cannot honestly resurrect signals that the production model did not emit as Actionable.",
    "Setup-family, ranking, entry-quality and confirmation diagnostics remain available inside each calibration summary; treat small buckets as exploratory until sample requirements are met.",
  ];
  if (normalized.stepMonths < normalized.testMonths) {
    warnings.push(
      "Test windows overlap because stepMonths is smaller than testMonths; stability aggregates may count the same signal in more than one test window.",
    );
  }
  if (windows.length === 0) {
    warnings.push("No complete train/validation/test window fits inside the supplied signal-date range.");
  }

  return {
    config: normalized,
    hypotheses: hypotheses.map((row) => ({ ...row })),
    controlHypothesisId,
    windows: results,
    stabilityByHypothesis: summarizeHypothesisStability(results, hypotheses, normalized.minimumTestSample),
    selectedStrategy: summarizeSelectedStrategy(results, normalized.minimumTestSample),
    warnings,
  };
}

function evaluateRange(
  cases: SwingV21BacktestCase[],
  hypothesis: SwingV21WalkForwardHypothesis,
  range: SwingV21DateRange,
  minimumSample: number,
): SwingV21WalkForwardMetrics {
  const inRange = cases
    .filter((row) => row.signal.signalDate >= range.startDate && row.signal.signalDate < range.endDateExclusive)
    .sort((left, right) =>
      left.signal.signalDate.localeCompare(right.signal.signalDate) ||
      (left.signal.signalId ?? "").localeCompare(right.signal.signalId ?? ""),
    );
  const evaluated = inRange.map((row) =>
    evaluateSwingV21CalibrationSignal(
      row.signal,
      row.bars.filter((bar) => bar.date < range.endDateExclusive),
      hypothesis.stopFloorAtr,
    ),
  );
  const selected = evaluated.filter((result) => hypothesisMatches(result, hypothesis));
  const summary = summarizeSwingV21Calibration(selected, minimumSample);
  const eligible = selected.filter(
    (result) => result.outcome.calibrationEligible && result.realisedR !== null,
  );
  const realised = eligible.map((result) => result.realisedR as number);

  return {
    range,
    signalsInRange: inRange.length,
    selectedSignals: selected.length,
    calibrationEligible: eligible.length,
    unresolved: selected.filter((result) => result.outcome.status === "active").length,
    ambiguous: selected.filter((result) => result.outcome.status === "ambiguous_same_bar").length,
    totalRealisedR: sumOrNull(realised),
    averageRealisedR: summary.overall.averageRealisedR,
    medianRealisedR: summary.overall.medianRealisedR,
    positiveRRate: summary.overall.positiveRRate,
    targetHitRate: summary.overall.targetHitRate,
    averageWinR: summary.overall.averageWinR,
    averageLossR: summary.overall.averageLossR,
    payoffRatio: summary.overall.payoffRatio,
    maximumSignalSequenceDrawdownR: maxSignalSequenceDrawdown(realised),
    averageMaxFavourablePct: summary.overall.averageMaxFavourablePct,
    averageMaxAdversePct: summary.overall.averageMaxAdversePct,
    validated: eligible.length >= minimumSample,
    summary,
  };
}

function hypothesisMatches(
  result: SwingV21CalibrationResult,
  hypothesis: SwingV21WalkForwardHypothesis,
): boolean {
  const signal = result.signal;
  if (hypothesis.entryStates?.length && !hypothesis.entryStates.includes(signal.entryState)) return false;
  if (hypothesis.setups?.length && !hypothesis.setups.includes(signal.setup)) return false;
  if (
    hypothesis.minimumPlannedRewardRisk !== undefined &&
    round(result.plannedRewardRisk, 2) < hypothesis.minimumPlannedRewardRisk
  ) return false;
  if (
    hypothesis.minimumRankingScore !== undefined &&
    signal.rankingScore < hypothesis.minimumRankingScore
  ) return false;
  if (
    hypothesis.minimumEntryQuality !== undefined &&
    signal.entryQuality < hypothesis.minimumEntryQuality
  ) return false;
  if (
    hypothesis.minimumConfirmations !== undefined &&
    signal.confirmationCount < hypothesis.minimumConfirmations
  ) return false;
  return true;
}

function selectionEligibility(
  hypothesis: SwingV21WalkForwardHypothesis,
  train: SwingV21WalkForwardMetrics,
  validation: SwingV21WalkForwardMetrics,
  config: ReturnType<typeof normalizeConfig>,
): { eligible: boolean; reason: string } {
  if (hypothesis.selectable === false) return { eligible: false, reason: "diagnostic_only" };
  if (train.calibrationEligible < config.minimumTrainSample) return { eligible: false, reason: "insufficient_train_sample" };
  if (validation.calibrationEligible < config.minimumValidationSample) return { eligible: false, reason: "insufficient_validation_sample" };
  if (train.averageRealisedR === null || validation.averageRealisedR === null) {
    return { eligible: false, reason: "missing_expectancy" };
  }
  if (config.requirePositiveTrain && train.averageRealisedR <= 0) {
    return { eligible: false, reason: "non_positive_train_expectancy" };
  }
  if (config.requirePositiveValidation && validation.averageRealisedR <= 0) {
    return { eligible: false, reason: "non_positive_validation_expectancy" };
  }
  return { eligible: true, reason: "eligible" };
}

function selectHypothesis(
  results: SwingV21WalkForwardHypothesisWindowResult[],
  hypotheses: SwingV21WalkForwardHypothesis[],
): SwingV21WalkForwardHypothesisWindowResult | null {
  const order = new Map(hypotheses.map((row, index) => [row.id, index]));
  const eligible = results.filter((row) => row.selectionEligible);
  eligible.sort((left, right) => {
    const validationDelta = (right.validation.averageRealisedR ?? Number.NEGATIVE_INFINITY) -
      (left.validation.averageRealisedR ?? Number.NEGATIVE_INFINITY);
    if (validationDelta !== 0) return validationDelta;
    const trainDelta = (right.train.averageRealisedR ?? Number.NEGATIVE_INFINITY) -
      (left.train.averageRealisedR ?? Number.NEGATIVE_INFINITY);
    if (trainDelta !== 0) return trainDelta;
    const medianDelta = (right.validation.medianRealisedR ?? Number.NEGATIVE_INFINITY) -
      (left.validation.medianRealisedR ?? Number.NEGATIVE_INFINITY);
    if (medianDelta !== 0) return medianDelta;
    const sampleDelta = right.validation.calibrationEligible - left.validation.calibrationEligible;
    if (sampleDelta !== 0) return sampleDelta;
    return (order.get(left.hypothesisId) ?? 999) - (order.get(right.hypothesisId) ?? 999);
  });
  return eligible[0] ?? null;
}

function summarizeHypothesisStability(
  windows: SwingV21WalkForwardWindowResult[],
  hypotheses: SwingV21WalkForwardHypothesis[],
  minimumTestSample: number,
): SwingV21WalkForwardStability[] {
  return hypotheses.map((hypothesis) => {
    const rows = windows
      .map((window) => window.hypotheses.find((row) => row.hypothesisId === hypothesis.id))
      .filter((row): row is SwingV21WalkForwardHypothesisWindowResult => row !== undefined);
    const validated = rows.filter((row) => row.test.calibrationEligible >= minimumTestSample);
    const positive = validated.filter((row) => (row.test.averageRealisedR ?? 0) > 0);
    const totalSignals = validated.reduce((sum, row) => sum + row.test.calibrationEligible, 0);
    const totalRValues = validated
      .map((row) => row.test.totalRealisedR)
      .filter((value): value is number => value !== null);
    const totalR = sumOrNull(totalRValues);
    const windowExpectancies = validated
      .map((row) => row.test.averageRealisedR)
      .filter((value): value is number => value !== null);
    const drawdowns = validated
      .map((row) => row.test.maximumSignalSequenceDrawdownR)
      .filter((value): value is number => value !== null);

    return {
      hypothesisId: hypothesis.id,
      testWindows: rows.length,
      validatedTestWindows: validated.length,
      positiveValidatedTestWindows: positive.length,
      positiveValidatedTestWindowRate: rate(positive.length, validated.length),
      totalEligibleTestSignals: totalSignals,
      totalTestRealisedR: totalR,
      weightedAverageTestR: totalR !== null && totalSignals > 0 ? round(totalR / totalSignals, 4) : null,
      medianWindowAverageTestR: median(windowExpectancies),
      worstWindowSignalSequenceDrawdownR: drawdowns.length ? round(Math.max(...drawdowns), 4) : null,
      selectedWindows: windows.filter((window) => window.selectedHypothesisId === hypothesis.id).length,
    };
  });
}

function summarizeSelectedStrategy(
  windows: SwingV21WalkForwardWindowResult[],
  minimumTestSample: number,
): SwingV21SelectedStrategyStability {
  const selected = windows
    .map((window) => window.selectedTest)
    .filter((row): row is SwingV21WalkForwardMetrics => row !== null);
  const validated = selected.filter((row) => row.calibrationEligible >= minimumTestSample);
  const positive = validated.filter((row) => (row.averageRealisedR ?? 0) > 0);
  const totalSignals = validated.reduce((sum, row) => sum + row.calibrationEligible, 0);
  const totalRValues = validated
    .map((row) => row.totalRealisedR)
    .filter((value): value is number => value !== null);
  const totalR = sumOrNull(totalRValues);
  const windowExpectancies = validated
    .map((row) => row.averageRealisedR)
    .filter((value): value is number => value !== null);
  const drawdowns = validated
    .map((row) => row.maximumSignalSequenceDrawdownR)
    .filter((value): value is number => value !== null);

  return {
    selectedWindows: selected.length,
    validatedSelectedWindows: validated.length,
    positiveValidatedSelectedWindows: positive.length,
    positiveValidatedSelectedWindowRate: rate(positive.length, validated.length),
    totalEligibleTestSignals: totalSignals,
    totalTestRealisedR: totalR,
    weightedAverageTestR: totalR !== null && totalSignals > 0 ? round(totalR / totalSignals, 4) : null,
    medianWindowAverageTestR: median(windowExpectancies),
    worstWindowSignalSequenceDrawdownR: drawdowns.length ? round(Math.max(...drawdowns), 4) : null,
  };
}

function normalizeConfig(config: SwingV21WalkForwardConfig) {
  const trainMonths = positiveInt(config.trainMonths, "trainMonths");
  const validationMonths = positiveInt(config.validationMonths, "validationMonths");
  const testMonths = positiveInt(config.testMonths, "testMonths");
  const stepMonths = positiveInt(config.stepMonths ?? testMonths, "stepMonths");
  const minimumTrainSample = positiveInt(config.minimumTrainSample ?? DEFAULT_MINIMUM_SAMPLE, "minimumTrainSample");
  const minimumValidationSample = positiveInt(
    config.minimumValidationSample ?? DEFAULT_MINIMUM_SAMPLE,
    "minimumValidationSample",
  );
  const minimumTestSample = positiveInt(config.minimumTestSample ?? DEFAULT_MINIMUM_SAMPLE, "minimumTestSample");
  if (config.startDate !== undefined && !validDate(config.startDate)) throw new Error("Walk-forward startDate must be YYYY-MM-DD");
  if (config.endDate !== undefined && !validDate(config.endDate)) throw new Error("Walk-forward endDate must be YYYY-MM-DD");
  if (config.startDate && config.endDate && config.endDate < config.startDate) {
    throw new Error("Walk-forward endDate precedes startDate");
  }
  return {
    trainMonths,
    validationMonths,
    testMonths,
    stepMonths,
    startDate: config.startDate,
    endDate: config.endDate,
    minimumTrainSample,
    minimumValidationSample,
    minimumTestSample,
    requirePositiveTrain: config.requirePositiveTrain ?? true,
    requirePositiveValidation: config.requirePositiveValidation ?? true,
  };
}

function validateHypotheses(hypotheses: SwingV21WalkForwardHypothesis[]): void {
  if (!hypotheses.length) throw new Error("Walk-forward requires at least one hypothesis");
  const ids = new Set<string>();
  let controls = 0;
  for (const row of hypotheses) {
    if (!row.id.trim()) throw new Error("Walk-forward hypothesis id cannot be empty");
    if (ids.has(row.id)) throw new Error(`Duplicate walk-forward hypothesis id: ${row.id}`);
    ids.add(row.id);
    if (row.control) controls += 1;
    if (row.minimumPlannedRewardRisk !== undefined && row.minimumPlannedRewardRisk <= 0) {
      throw new Error(`Invalid planned R:R threshold for hypothesis ${row.id}`);
    }
  }
  if (controls > 1) throw new Error("Walk-forward supports at most one control hypothesis");
}

function maxSignalSequenceDrawdown(values: number[]): number | null {
  if (!values.length) return null;
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const value of values) {
    equity += value;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
  }
  return round(maxDrawdown, 4);
}

function sumOrNull(values: number[]): number | null {
  return values.length ? round(values.reduce((sum, value) => sum + value, 0), 4) : null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
  return round(value, 4);
}

function rate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? round(numerator / denominator * 100, 2) : null;
}

function positiveInt(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 1 || Math.floor(value) !== value) {
    throw new Error(`Walk-forward ${label} must be a positive integer`);
  }
  return value;
}

function addMonths(date: string, months: number): string {
  const parsed = parseDate(date);
  const targetMonth = parsed.month - 1 + months;
  const year = parsed.year + Math.floor(targetMonth / 12);
  const monthIndex = ((targetMonth % 12) + 12) % 12;
  const month = monthIndex + 1;
  const day = Math.min(parsed.day, daysInMonth(year, month));
  return isoDate(year, month, day);
}

function addDays(date: string, days: number): string {
  const parsed = parseDate(date);
  const value = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days));
  return isoDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
}

function parseDate(date: string): { year: number; month: number; day: number } {
  if (!validDate(date)) throw new Error(`Invalid walk-forward date: ${date}`);
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() + 1 === month && parsed.getUTCDate() === day;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
