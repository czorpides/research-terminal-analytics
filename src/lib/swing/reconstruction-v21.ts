import type { SwingBar } from "./model";
import {
  computeSwingTradeV2,
  type SwingV2Candidate,
  type SwingV2Context,
  type SwingV2EntryState,
  type SwingV2SetupType,
} from "./model-v21";
import type { SwingOutcomeBar } from "./outcomes";
import type {
  SwingV21BacktestCase,
  SwingV21CalibrationSignal,
} from "./calibration-v21";

export type SwingV21ReplayEmission = "state_transition" | "daily_snapshot";
export type SwingV21MissingContextPolicy = "technical_only" | "skip";
export type SwingV21ContextMode = "point_in_time" | "technical_only";

export interface SwingV21HistoricalAssetSeries {
  assetId: string;
  symbol: string;
  instrumentType: "equity" | "commodity";
  /**
   * Split-adjusted daily OHLCV in the same basis used by the live Swing model.
   * The reconstructor sorts and deduplicates by date before replaying.
   */
  bars: SwingBar[];
}

export interface SwingV21ResolvedContext {
  /** ISO timestamp/date at which every field in `context` was knowable. */
  availableAt: string;
  context: SwingV2Context;
  source?: string;
}

export interface SwingV21ContextSnapshot extends SwingV21ResolvedContext {}

export type SwingV21ContextResolver = (
  assetId: string,
  signalDate: string,
) => SwingV21ResolvedContext | null;

export interface SwingV21ReconstructionOptions {
  startDate?: string;
  endDate?: string;
  minimumHistoryBars?: number;
  lookbackBars?: number;
  minimumRawRankingScore?: number;
  emitStates?: SwingV2EntryState[];
  emission?: SwingV21ReplayEmission;
  missingContext?: SwingV21MissingContextPolicy;
  /**
   * False by default. Without exchange-specific timestamps, same-day external
   * evidence is excluded to avoid accidentally admitting after-close data.
   */
  allowSameDayContext?: boolean;
}

export interface SwingV21HistoricalGuards {
  excludedExtremeDiscontinuity: boolean;
  stopWidened: boolean;
  rewardRiskDowngraded: boolean;
  reversalDowngraded: boolean;
  productionExecutionStop: number | null;
  productionRewardRisk: number | null;
}

export interface SwingV21ReconstructedSignal {
  assetId: string;
  symbol: string;
  instrumentType: "equity" | "commodity";
  signalDate: string;
  barsVisible: number;
  contextMode: SwingV21ContextMode;
  contextAvailableAt: string | null;
  contextSource: string | null;
  rawEntryState: SwingV2EntryState;
  hardenedEntryState: SwingV2EntryState;
  rawRankingScore: number;
  hardenedRankingScore: number;
  rawEntryQuality: number;
  hardenedEntryQuality: number;
  setup: SwingV2SetupType;
  guards: SwingV21HistoricalGuards;
  candidate: SwingV2Candidate;
  calibrationSignal: SwingV21CalibrationSignal;
  futureBars: SwingOutcomeBar[];
}

export interface SwingV21ReconstructionReport {
  assetId: string;
  symbol: string;
  instrumentType: "equity" | "commodity";
  barsInput: number;
  barsUsable: number;
  sessionsEvaluated: number;
  contextResolved: number;
  contextTechnicalOnly: number;
  contextSkipped: number;
  rawCandidates: number;
  extremeDiscontinuities: number;
  emittedSignals: number;
  signals: SwingV21ReconstructedSignal[];
  warnings: string[];
}

const DEFAULT_MIN_HISTORY = 45;
const DEFAULT_LOOKBACK = 280;
const DEFAULT_RANK_FLOOR = 42;
const PRODUCTION_STOP_FLOOR_ATR = 0.75;
const EXTREME_DRAWDOWN_63_PCT = -85;
const REVERSAL_SETUPS = new Set<SwingV2SetupType>([
  "deep_mean_reversion",
  "sma200_bounce",
  "catalyst_repricing",
]);

/**
 * Replay the v2.1 shadow model one historical session at a time.
 *
 * At each signal date the model receives only:
 *   - bars dated on or before that session; and
 *   - context whose `availableAt` passes the point-in-time cutoff.
 *
 * Future bars are attached only after signal construction for the separate
 * calibration/outcome layer. This module deliberately does not query a live
 * database, current analyst estimates, current calendars or current news.
 *
 * This is a per-asset reconstruction primitive. A portfolio/universe backtest
 * must additionally supply the point-in-time asset universe to avoid
 * survivorship bias.
 */
export function reconstructSwingV21History(
  series: SwingV21HistoricalAssetSeries,
  contextResolver?: SwingV21ContextResolver,
  options: SwingV21ReconstructionOptions = {},
): SwingV21ReconstructionReport {
  const bars = normalizeBars(series.bars);
  const minimumHistoryBars = clampInt(options.minimumHistoryBars ?? DEFAULT_MIN_HISTORY, 45, 500);
  const lookbackBars = clampInt(options.lookbackBars ?? DEFAULT_LOOKBACK, minimumHistoryBars, 800);
  const minimumRawRankingScore = finite(options.minimumRawRankingScore) ?? DEFAULT_RANK_FLOOR;
  const emitStates = new Set(options.emitStates ?? ["actionable", "developing"]);
  const emission = options.emission ?? "state_transition";
  const missingContext = options.missingContext ?? "technical_only";
  const allowSameDayContext = options.allowSameDayContext ?? false;
  validateDateBoundary(options.startDate, "startDate");
  validateDateBoundary(options.endDate, "endDate");

  let sessionsEvaluated = 0;
  let contextResolved = 0;
  let contextTechnicalOnly = 0;
  let contextSkipped = 0;
  let rawCandidates = 0;
  let extremeDiscontinuities = 0;
  let previousEpisodeKey: string | null = null;
  const signals: SwingV21ReconstructedSignal[] = [];
  const warnings: string[] = [];

  for (let index = minimumHistoryBars - 1; index < bars.length; index += 1) {
    const signalDate = bars[index].date;
    if (options.startDate && signalDate < options.startDate) continue;
    if (options.endDate && signalDate > options.endDate) break;
    sessionsEvaluated += 1;

    const resolved = contextResolver?.(series.assetId, signalDate) ?? null;
    let contextMode: SwingV21ContextMode;
    let contextAvailableAt: string | null = null;
    let contextSource: string | null = null;
    let context: SwingV2Context;

    if (resolved) {
      enforcePointInTimeContext(resolved, signalDate, allowSameDayContext);
      contextResolved += 1;
      contextMode = "point_in_time";
      contextAvailableAt = resolved.availableAt;
      contextSource = resolved.source ?? null;
      context = {
        ...resolved.context,
        instrumentType: series.instrumentType,
      };
    } else if (missingContext === "skip") {
      contextSkipped += 1;
      previousEpisodeKey = null;
      continue;
    } else {
      contextTechnicalOnly += 1;
      contextMode = "technical_only";
      context = technicalOnlyContext(series.instrumentType);
    }

    const visibleBars = bars.slice(Math.max(0, index - lookbackBars + 1), index + 1);
    assertNoFutureBars(visibleBars, signalDate);
    const candidate = computeSwingTradeV2(visibleBars, context);
    if (!candidate || candidate.rankingScore < minimumRawRankingScore || candidate.entryState === "invalidated") {
      previousEpisodeKey = null;
      continue;
    }
    rawCandidates += 1;

    const hardened = applyHistoricalPresentationGuards(candidate, series.instrumentType);
    if (hardened.guards.excludedExtremeDiscontinuity) {
      extremeDiscontinuities += 1;
      previousEpisodeKey = null;
      continue;
    }

    const state = hardened.entryState;
    if (!emitStates.has(state)) {
      previousEpisodeKey = null;
      continue;
    }

    const episodeKey = `${candidate.setup}:${state}`;
    const shouldEmit = emission === "daily_snapshot" || episodeKey !== previousEpisodeKey;
    previousEpisodeKey = episodeKey;
    if (!shouldEmit) continue;

    const calibrationSignal = calibrationSignalFromCandidate(
      series.assetId,
      signalDate,
      candidate,
      hardened,
    );
    if (!calibrationSignal) continue;

    const futureBars = bars.slice(index + 1).map(toOutcomeBar);
    if (futureBars.some((bar) => bar.date <= signalDate)) {
      throw new Error(`Swing v2.1 replay leaked a non-future outcome bar for ${series.symbol} on ${signalDate}`);
    }

    signals.push({
      assetId: series.assetId,
      symbol: series.symbol,
      instrumentType: series.instrumentType,
      signalDate,
      barsVisible: visibleBars.length,
      contextMode,
      contextAvailableAt,
      contextSource,
      rawEntryState: candidate.entryState,
      hardenedEntryState: state,
      rawRankingScore: candidate.rankingScore,
      hardenedRankingScore: hardened.rankingScore,
      rawEntryQuality: candidate.entryQuality,
      hardenedEntryQuality: hardened.entryQuality,
      setup: candidate.setup,
      guards: hardened.guards,
      candidate,
      calibrationSignal,
      futureBars,
    });
  }

  if (contextTechnicalOnly > 0) {
    warnings.push(
      `${contextTechnicalOnly} replay session${contextTechnicalOnly === 1 ? "" : "s"} used technical-only context because no point-in-time catalyst/macro snapshot was supplied; these sessions must not be interpreted as known-clear catalyst evidence.`,
    );
  }
  if (contextSkipped > 0) {
    warnings.push(
      `${contextSkipped} replay session${contextSkipped === 1 ? "" : "s"} skipped because point-in-time context was unavailable.`,
    );
  }
  if (extremeDiscontinuities > 0) {
    warnings.push(
      `${extremeDiscontinuities} historical candidate${extremeDiscontinuities === 1 ? " was" : "s were"} excluded by the live -85% 63-day discontinuity guard.`,
    );
  }
  warnings.push(
    "This replay is per asset. A full-universe backtest must reconstruct membership/delistings point-in-time to avoid survivorship bias.",
  );

  return {
    assetId: series.assetId,
    symbol: series.symbol,
    instrumentType: series.instrumentType,
    barsInput: series.bars.length,
    barsUsable: bars.length,
    sessionsEvaluated,
    contextResolved,
    contextTechnicalOnly,
    contextSkipped,
    rawCandidates,
    extremeDiscontinuities,
    emittedSignals: signals.length,
    signals,
    warnings,
  };
}

/** Convert reconstructed signals directly into the calibration-core case shape. */
export function reconstructedSwingV21BacktestCases(
  report: SwingV21ReconstructionReport,
): SwingV21BacktestCase[] {
  return report.signals.map((row) => ({
    signal: row.calibrationSignal,
    bars: row.futureBars,
  }));
}

/**
 * Build a resolver from append-only point-in-time context snapshots.
 * By default a snapshot observed on the signal date is NOT used because we do
 * not know whether it arrived before or after that market's close.
 */
export function createSwingV21SnapshotContextResolver(
  snapshotsByAsset: Record<string, SwingV21ContextSnapshot[]>,
  options: { allowSameDayContext?: boolean } = {},
): SwingV21ContextResolver {
  const allowSameDay = options.allowSameDayContext ?? false;
  const normalized = new Map<string, SwingV21ContextSnapshot[]>();
  for (const [assetId, snapshots] of Object.entries(snapshotsByAsset)) {
    const rows = [...snapshots]
      .filter((snapshot) => validTimestamp(snapshot.availableAt))
      .sort((left, right) => left.availableAt.localeCompare(right.availableAt));
    normalized.set(assetId, rows);
  }

  return (assetId, signalDate) => {
    const rows = normalized.get(assetId) ?? [];
    const cutoff = contextCutoff(signalDate, allowSameDay);
    let best: SwingV21ContextSnapshot | null = null;
    for (const snapshot of rows) {
      const available = timestamp(snapshot.availableAt);
      if (available <= cutoff) best = snapshot;
      else break;
    }
    return best;
  };
}

export function technicalOnlyContext(
  instrumentType: "equity" | "commodity",
): SwingV2Context {
  return {
    existingMomentum: null,
    existingTrend: null,
    quality: null,
    valuation: null,
    instrumentType,
    catalyst: {
      score: null,
      label: null,
      confidence: 0,
      daysToEarnings: null,
      positiveRevision: false,
      negativeRevision: false,
      reasons: [],
      risks: ["Point-in-time catalyst context unavailable; catalyst state is unknown, not neutral/clear."],
    },
    macro: instrumentType === "commodity"
      ? {
          score: 50,
          label: "Point-in-time macro context unavailable",
          available: false,
          reasons: [],
          risks: ["Point-in-time macro evidence was not supplied to the historical replay."],
        }
      : null,
  };
}

interface GuardedCandidate {
  entryState: SwingV2EntryState;
  rankingScore: number;
  entryQuality: number;
  guards: SwingV21HistoricalGuards;
}

/** Mirror the currently deployed v2.1 workspace presentation guards without mutating live code. */
function applyHistoricalPresentationGuards(
  candidate: SwingV2Candidate,
  instrumentType: "equity" | "commodity",
): GuardedCandidate {
  if (
    candidate.metrics.drawdown63Pct !== null &&
    candidate.metrics.drawdown63Pct <= EXTREME_DRAWDOWN_63_PCT
  ) {
    return {
      entryState: candidate.entryState,
      rankingScore: candidate.rankingScore,
      entryQuality: candidate.entryQuality,
      guards: {
        excludedExtremeDiscontinuity: true,
        stopWidened: false,
        rewardRiskDowngraded: false,
        reversalDowngraded: false,
        productionExecutionStop: null,
        productionRewardRisk: null,
      },
    };
  }

  const riskPlan = candidate.discipline.riskPlan;
  const current = candidate.metrics.current;
  const atr = candidate.metrics.atr14;
  const originalStop = riskPlan.hardStop;
  const target = riskPlan.target;
  let executionStop = originalStop;
  let stopWidened = false;

  if (
    atr !== null && atr > 0 &&
    originalStop !== null && originalStop > 0 && originalStop < current
  ) {
    const minimumNoiseStop = current - PRODUCTION_STOP_FLOOR_ATR * atr;
    if (minimumNoiseStop > 0 && originalStop > minimumNoiseStop) {
      executionStop = minimumNoiseStop;
      stopWidened = true;
    }
  }

  const productionRewardRisk =
    executionStop !== null && executionStop > 0 && executionStop < current &&
    target !== null && target > current
      ? (target - current) / (current - executionStop)
      : null;

  let entryState = candidate.entryState;
  let entryQuality = candidate.entryQuality;
  let rankingScore = candidate.rankingScore;
  const oldContribution = rewardRiskContribution(riskPlan.rewardRisk);
  const newContribution = rewardRiskContribution(productionRewardRisk);
  entryQuality += newContribution.entry - oldContribution.entry;
  rankingScore += newContribution.rank - oldContribution.rank;

  const rewardRiskDowngraded =
    entryState === "actionable" &&
    (productionRewardRisk === null || productionRewardRisk < riskPlan.minimumActionableRewardRisk);
  if (rewardRiskDowngraded) {
    entryState = "developing";
    entryQuality -= 6;
    rankingScore -= 6;
  }

  const reversalNeedsTurn = instrumentType === "equity" && REVERSAL_SETUPS.has(candidate.setup);
  const hasTurnConfirmation =
    candidate.metrics.higherLow ||
    candidate.metrics.ma20Reclaim ||
    candidate.metrics.sma200Reclaim ||
    candidate.discipline.bullishRsiDivergence ||
    candidate.discipline.bullishMacdDivergence ||
    candidate.discipline.volumeTurnConfirmed ||
    candidate.discipline.rejectionTrigger;
  const reversalDowngraded = entryState === "actionable" && reversalNeedsTurn && !hasTurnConfirmation;
  if (reversalDowngraded) {
    entryState = "developing";
    entryQuality -= 10;
    rankingScore -= 10;
  }

  return {
    entryState,
    rankingScore: round(clamp(rankingScore), 1),
    entryQuality: round(clamp(entryQuality), 1),
    guards: {
      excludedExtremeDiscontinuity: false,
      stopWidened,
      rewardRiskDowngraded,
      reversalDowngraded,
      productionExecutionStop: executionStop === null ? null : round(executionStop, 6),
      productionRewardRisk: productionRewardRisk === null ? null : round(productionRewardRisk, 4),
    },
  };
}

function calibrationSignalFromCandidate(
  assetId: string,
  signalDate: string,
  candidate: SwingV2Candidate,
  hardened: GuardedCandidate,
): SwingV21CalibrationSignal | null {
  const riskPlan = candidate.discipline.riskPlan;
  const entry = candidate.metrics.current;
  const target = riskPlan.target;
  const structuralStop = riskPlan.hardStop;
  if (
    target === null || structuralStop === null ||
    !(target > entry && structuralStop > 0 && structuralStop < entry)
  ) {
    return null;
  }

  return {
    signalId: `${assetId}:${signalDate}:${candidate.setup}:${hardened.entryState}`,
    setup: candidate.setup,
    entryState: hardened.entryState,
    signalDate,
    entry,
    target,
    structuralStop,
    atr14: candidate.metrics.atr14,
    rankingScore: hardened.rankingScore,
    entryQuality: hardened.entryQuality,
    confirmationCount: candidate.discipline.confirmationCount,
    timeStopSessions: riskPlan.timeStopSessions,
  };
}

function enforcePointInTimeContext(
  resolved: SwingV21ResolvedContext,
  signalDate: string,
  allowSameDay: boolean,
): void {
  if (!validTimestamp(resolved.availableAt)) {
    throw new Error(`Swing v2.1 context for ${signalDate} has invalid availableAt: ${resolved.availableAt}`);
  }
  const available = timestamp(resolved.availableAt);
  const cutoff = contextCutoff(signalDate, allowSameDay);
  if (available > cutoff) {
    throw new Error(
      `Swing v2.1 point-in-time violation: context available at ${resolved.availableAt} is after the ${signalDate} replay cutoff`,
    );
  }
}

function contextCutoff(signalDate: string, allowSameDay: boolean): number {
  validateDateBoundary(signalDate, "signalDate");
  return timestamp(
    `${signalDate}${allowSameDay ? "T23:59:59.999Z" : "T00:00:00.000Z"}`,
  );
}

function assertNoFutureBars(bars: SwingBar[], signalDate: string): void {
  if (bars.some((bar) => bar.date > signalDate)) {
    throw new Error(`Swing v2.1 replay leaked a future price bar beyond ${signalDate}`);
  }
}

function normalizeBars(input: SwingBar[]): SwingBar[] {
  const byDate = new Map<string, SwingBar>();
  for (const bar of input) {
    if (!validBar(bar)) continue;
    byDate.set(bar.date, { ...bar });
  }
  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function validBar(bar: SwingBar): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(bar.date) &&
    [bar.open, bar.high, bar.low, bar.close].every((value) => Number.isFinite(value) && value > 0) &&
    bar.high >= Math.max(bar.open, bar.close, bar.low) &&
    bar.low <= Math.min(bar.open, bar.close, bar.high) &&
    (bar.volume === null || (Number.isFinite(bar.volume) && bar.volume >= 0));
}

function toOutcomeBar(bar: SwingBar): SwingOutcomeBar {
  return {
    date: bar.date,
    high: bar.high,
    low: bar.low,
    close: bar.close,
  };
}

function rewardRiskContribution(rr: number | null): { entry: number; rank: number } {
  if (rr === null || !Number.isFinite(rr)) return { entry: 0, rank: 0 };
  if (rr >= 3) return { entry: 5, rank: 4 };
  if (rr >= 2) return { entry: 0, rank: 0 };
  if (rr >= 1.5) return { entry: -5, rank: -4 };
  return { entry: -14, rank: -10 };
}

function validateDateBoundary(value: string | undefined, label: string): void {
  if (value === undefined) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`Swing v2.1 replay ${label} must be YYYY-MM-DD`);
  }
}

function validTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid timestamp: ${value}`);
  return parsed;
}

function clampInt(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, Math.floor(value)));
}

function clamp(value: number, low = 0, high = 100): number {
  return Math.max(low, Math.min(high, value));
}

function finite(value: number | null | undefined): number | null {
  return value !== null && value !== undefined && Number.isFinite(value) ? value : null;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
