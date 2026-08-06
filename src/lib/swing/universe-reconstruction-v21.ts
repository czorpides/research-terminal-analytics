import type { SwingBar } from "./model.ts";
import type { SwingV2EntryState } from "./model-v21.ts";
import type { SwingV21BacktestCase } from "./calibration-v21.ts";
import {
  reconstructSwingV21History,
  type SwingV21ContextResolver,
  type SwingV21HistoricalAssetSeries,
  type SwingV21MissingContextPolicy,
  type SwingV21ReconstructedSignal,
  type SwingV21ReplayEmission,
} from "./reconstruction-v21.ts";

export interface SwingV21HistoricalUniverseAsset extends SwingV21HistoricalAssetSeries {
  /** Inclusive first date on which the security belonged to the testable universe. */
  activeFrom: string;
  /** Inclusive final date; null means still active at the end of the supplied sample. */
  activeTo: string | null;
}

export interface SwingV21HistoricalBroadScore {
  availableAt: string;
  momentum: number | null;
  trend: number | null;
}

export type SwingV21BroadScoreResolver = (
  assetId: string,
  asOfDate: string,
) => SwingV21HistoricalBroadScore | null;

export interface SwingV21HistoricalScreenRow {
  assetId: string;
  symbol: string;
  asOf: string;
  bars: number;
  current: number | null;
  return5: number | null;
  return20: number | null;
  relativeVolume: number | null;
  drawdown90: number | null;
  rangeLocation90: number | null;
  distanceMa20: number | null;
  distanceMa50: number | null;
  distanceMa200: number | null;
  oldMomentum: number | null;
  oldTrend: number | null;
}

export interface SwingV21NominationDay {
  asOf: string;
  /** All historically active supplied instruments on this date. */
  activeMembers: number;
  activeEquities: number;
  activeCommodities: number;
  /** Equity rows with enough history to enter the live-style broad screen. */
  screenEligible: number;
  selectedEquities: string[];
  selectedCommodities: string[];
  /** Equity deep-scan selections followed by separately selected XAU/XAG assets. */
  selected: string[];
  scoreContextResolved: number;
  scoreContextUnknown: number;
}

export interface SwingV21NominationCalendar {
  startDate: string;
  endDate: string;
  /** Applies to equities only, matching the live workspace. */
  deepScanCap: number;
  dates: SwingV21NominationDay[];
  warnings: string[];
}

export interface SwingV21UniverseReplayOptions {
  startDate: string;
  endDate: string;
  deepScanCap?: number;
  minimumHistoryBars?: number;
  lookbackBars?: number;
  minimumRawRankingScore?: number;
  emitStates?: SwingV2EntryState[];
  emission?: SwingV21ReplayEmission;
  missingContext?: SwingV21MissingContextPolicy;
  allowSameDayContext?: boolean;
  allowSameDayBroadScores?: boolean;
}

export interface SwingV21UniverseReplayReport {
  startDate: string;
  endDate: string;
  assetsSupplied: number;
  nominationCalendar: SwingV21NominationCalendar;
  nominatedAssetSessions: number;
  modelEvaluatedAssetSessions: number;
  emittedSignals: number;
  signals: SwingV21ReconstructedSignal[];
  backtestCases: SwingV21BacktestCase[];
  warnings: string[];
}

const LIVE_DEEP_SCAN_CAP = 220;
const MIN_MODEL_HISTORY = 45;
const LIVE_METAL_SYMBOLS = new Set(["XAUUSD", "XAGUSD"]);

/**
 * Rebuild the live broad-screen nomination step from historical bars.
 *
 * The formula intentionally mirrors `refresh_equity_technical_screen()` and
 * `selectDeepScanV2()`:
 * - 5/20-session returns use the close 5/20 sessions ago;
 * - MA20/MA50 and 90-session high/low include the current bar;
 * - relative volume is latest volume divided by the prior 20 sessions;
 * - nomination buckets preserve the live symbol-order tie behaviour before the
 *   220-equity cap;
 * - XAUUSD/XAGUSD are selected separately and do not consume equity slots.
 *
 * Optional momentum/trend scores must carry their own `availableAt`; future
 * scores are rejected rather than silently used.
 */
export function buildSwingV21HistoricalNominationCalendar(
  universe: SwingV21HistoricalUniverseAsset[],
  broadScoreResolver: SwingV21BroadScoreResolver | undefined,
  options: Pick<
    SwingV21UniverseReplayOptions,
    "startDate" | "endDate" | "deepScanCap" | "minimumHistoryBars" | "allowSameDayBroadScores"
  >,
): SwingV21NominationCalendar {
  validateDate(options.startDate, "startDate");
  validateDate(options.endDate, "endDate");
  if (options.endDate < options.startDate) {
    throw new Error("Swing v2.1 universe replay endDate precedes startDate");
  }

  const deepScanCap = clampInt(options.deepScanCap ?? LIVE_DEEP_SCAN_CAP, 1, LIVE_DEEP_SCAN_CAP);
  const minimumHistoryBars = clampInt(
    options.minimumHistoryBars ?? MIN_MODEL_HISTORY,
    MIN_MODEL_HISTORY,
    500,
  );
  const allowSameDayScores = options.allowSameDayBroadScores ?? false;
  // The live active-equity loader orders by symbol before selectDeepScanV2.
  // Keep the same ordering so stable-sort ties are historically reproducible.
  const prepared = universe
    .map(prepareUniverseAsset)
    .sort((left, right) => left.symbol.localeCompare(right.symbol) || left.assetId.localeCompare(right.assetId));
  const dates = unionDates(prepared, options.startDate, options.endDate);
  const output: SwingV21NominationDay[] = [];

  for (const asOf of dates) {
    const rows: SwingV21HistoricalScreenRow[] = [];
    const selectedCommodities: string[] = [];
    let activeMembers = 0;
    let activeEquities = 0;
    let activeCommodities = 0;
    let scoreContextResolved = 0;
    let scoreContextUnknown = 0;

    for (const asset of prepared) {
      if (!isActiveMember(asset, asOf)) continue;
      activeMembers += 1;

      if (asset.instrumentType === "commodity") {
        activeCommodities += 1;
        if (LIVE_METAL_SYMBOLS.has(asset.symbol.toUpperCase())) {
          selectedCommodities.push(asset.assetId);
        }
        continue;
      }

      activeEquities += 1;
      const visible = barsThroughDate(asset.bars, asOf);
      if (visible.length < minimumHistoryBars) continue;
      const score = broadScoreResolver?.(asset.assetId, asOf) ?? null;
      if (score) {
        enforceHistoricalScore(score, asOf, allowSameDayScores);
        scoreContextResolved += 1;
      } else {
        scoreContextUnknown += 1;
      }
      rows.push(screenRow(asset.assetId, asset.symbol, visible, score));
    }

    const selectedEquitySet = selectHistoricalDeepScan(rows, deepScanCap);
    const selectedEquities = [...selectedEquitySet];
    output.push({
      asOf,
      activeMembers,
      activeEquities,
      activeCommodities,
      screenEligible: rows.length,
      selectedEquities,
      selectedCommodities,
      selected: [...selectedEquities, ...selectedCommodities],
      scoreContextResolved,
      scoreContextUnknown,
    });
  }

  const warnings: string[] = [];
  if (!broadScoreResolver) {
    warnings.push(
      "Historical nomination used bar-derived broad-screen evidence only. Stored momentum/trend score context was not supplied; the small legacy trend-score tie-break contribution is therefore absent.",
    );
  }
  if (prepared.some((asset) => asset.instrumentType === "commodity" && !LIVE_METAL_SYMBOLS.has(asset.symbol.toUpperCase()))) {
    warnings.push(
      "Only XAUUSD/XAGUSD commodities are admitted outside the 220-equity cap, matching the live Swing v2.1 workspace; other supplied commodities are ignored by nomination.",
    );
  }
  warnings.push(
    "Universe membership is taken only from explicit activeFrom/activeTo ranges supplied by the caller; do not substitute the current active-asset list for historical membership.",
  );

  return {
    startDate: options.startDate,
    endDate: options.endDate,
    deepScanCap,
    dates: output,
    warnings,
  };
}

/**
 * Reconstruct signals only on asset/date pairs that passed the historical
 * broad-screen nomination. This keeps calibration from retrospectively deep
 * scanning every stock on every date.
 *
 * The 140-card UI surface cap is intentionally NOT applied here: this layer is
 * the research/deep-scan population, not a presentation cap. Portfolio-level
 * walk-forward selection can impose a separate rank/position limit later.
 */
export function reconstructSwingV21NominatedUniverse(
  universe: SwingV21HistoricalUniverseAsset[],
  contextResolver: SwingV21ContextResolver | undefined,
  broadScoreResolver: SwingV21BroadScoreResolver | undefined,
  options: SwingV21UniverseReplayOptions,
): SwingV21UniverseReplayReport {
  const nominationCalendar = buildSwingV21HistoricalNominationCalendar(
    universe,
    broadScoreResolver,
    options,
  );
  const byId = new Map(universe.map((asset) => [asset.assetId, asset]));
  const signals: SwingV21ReconstructedSignal[] = [];
  const previousEpisode = new Map<string, string>();
  let nominatedAssetSessions = 0;
  let modelEvaluatedAssetSessions = 0;

  for (const day of nominationCalendar.dates) {
    const selected = new Set(day.selected);
    nominatedAssetSessions += day.selected.length;

    // A gap in nomination ends the prior episode. If the name later re-enters
    // the deep scan, the next qualifying state is a new opportunity.
    for (const assetId of [...previousEpisode.keys()]) {
      if (!selected.has(assetId)) previousEpisode.delete(assetId);
    }

    for (const assetId of day.selected) {
      const asset = byId.get(assetId);
      if (!asset) continue;
      const latestBar = latestBarOnOrBefore(asset.bars, day.asOf);
      // Do not manufacture a fresh signal on a market holiday/closed session.
      if (!latestBar || latestBar.date !== day.asOf) continue;
      modelEvaluatedAssetSessions += 1;

      const report = reconstructSwingV21History(
        asset,
        contextResolver,
        {
          startDate: day.asOf,
          endDate: day.asOf,
          minimumHistoryBars: options.minimumHistoryBars,
          lookbackBars: options.lookbackBars,
          minimumRawRankingScore: options.minimumRawRankingScore,
          emitStates: options.emitStates,
          emission: "daily_snapshot",
          missingContext: options.missingContext,
          allowSameDayContext: options.allowSameDayContext,
        },
      );
      const signal = report.signals[0] ?? null;
      if (!signal) {
        previousEpisode.delete(assetId);
        continue;
      }

      const episodeKey = `${signal.setup}:${signal.hardenedEntryState}`;
      const shouldEmit =
        (options.emission ?? "state_transition") === "daily_snapshot" ||
        previousEpisode.get(assetId) !== episodeKey;
      previousEpisode.set(assetId, episodeKey);
      if (shouldEmit) signals.push(signal);
    }
  }

  signals.sort((left, right) =>
    left.signalDate.localeCompare(right.signalDate) ||
    right.hardenedRankingScore - left.hardenedRankingScore ||
    left.symbol.localeCompare(right.symbol),
  );
  const backtestCases = signals.map((signal) => ({
    signal: signal.calibrationSignal,
    bars: signal.futureBars,
  }));
  const warnings = [
    ...nominationCalendar.warnings,
    "The historical 220-name equity deep-scan cap is reproduced while XAUUSD/XAGUSD remain separate, matching live nomination. The live 140-card display cap is deliberately excluded from calibration and should not be treated as a portfolio-construction rule.",
    "A survivorship-safe run requires historically correct activeFrom/activeTo membership for every supplied security, including delisted names.",
  ];

  return {
    startDate: options.startDate,
    endDate: options.endDate,
    assetsSupplied: universe.length,
    nominationCalendar,
    nominatedAssetSessions,
    modelEvaluatedAssetSessions,
    emittedSignals: signals.length,
    signals,
    backtestCases,
    warnings: unique(warnings),
  };
}

/** Exact historical counterpart of the live `selectDeepScanV2` bucket logic. */
export function selectHistoricalDeepScan(
  rows: SwingV21HistoricalScreenRow[],
  cap = LIVE_DEEP_SCAN_CAP,
): Set<string> {
  // Live input is symbol-sorted; enforce the same order here before stable sorts.
  const orderedRows = [...rows].sort(
    (left, right) => left.symbol.localeCompare(right.symbol) || left.assetId.localeCompare(right.assetId),
  );
  const selected = new Set<string>();

  // Depression / location buckets dominate v2.1 nomination.
  addTop(selected, orderedRows, (row) => row.rangeLocation90 ?? 2, 42, false);
  addTop(selected, orderedRows, (row) => row.drawdown90 ?? 1, 42, false);
  addTop(selected, orderedRows, (row) => row.return20 ?? 999, 34, false);
  addTop(
    selected,
    orderedRows.filter((row) => (row.return20 ?? 0) < -2 && (row.return5 ?? -999) > 0),
    (row) => row.return5 ?? -999,
    34,
    true,
  );

  // 200SMA and shorter moving-average mean reversion.
  addTop(
    selected,
    orderedRows.filter(
      (row) => row.distanceMa200 !== null && row.distanceMa200 >= -0.18 && row.distanceMa200 <= 0.05,
    ),
    (row) => Math.abs(row.distanceMa200 ?? 99),
    34,
    false,
  );
  addTop(
    selected,
    orderedRows.filter((row) =>
      [row.distanceMa20, row.distanceMa50].some(
        (distance) => distance !== null && distance <= 0.02 && distance >= -0.1,
      ),
    ),
    (row) => Math.min(Math.abs(row.distanceMa20 ?? 99), Math.abs(row.distanceMa50 ?? 99)),
    28,
    false,
  );

  // Damaged/stabilising names and volume-driven reversals.
  addTop(
    selected,
    orderedRows.filter((row) =>
      (row.drawdown90 ?? 0) <= -0.08 &&
      ((row.return5 ?? -999) > -3 || (row.relativeVolume ?? 0) >= 1.15),
    ),
    (row) =>
      (row.return5 ?? -10) +
      Math.min(row.relativeVolume ?? 0, 3) * 5 -
      (row.drawdown90 ?? 0) * 20,
    38,
    true,
  );
  addTop(
    selected,
    orderedRows.filter((row) => (row.drawdown90 ?? 0) <= -0.05),
    (row) => row.relativeVolume ?? -1,
    24,
    true,
  );

  // Small clean-trend/base-breakout discovery lane.
  addTop(
    selected,
    orderedRows.filter((row) =>
      (row.rangeLocation90 ?? 0) >= 0.72 &&
      (row.rangeLocation90 ?? 1) <= 1.02 &&
      (row.return20 ?? 0) <= 12 &&
      (row.distanceMa20 ?? 0) <= 0.07,
    ),
    (row) => (row.relativeVolume ?? 0) + (row.oldTrend ?? 50) / 100,
    24,
    true,
  );

  return new Set([...selected].slice(0, clampInt(cap, 1, LIVE_DEEP_SCAN_CAP)));
}

interface PreparedUniverseAsset extends SwingV21HistoricalUniverseAsset {
  bars: SwingBar[];
}

function prepareUniverseAsset(asset: SwingV21HistoricalUniverseAsset): PreparedUniverseAsset {
  validateDate(asset.activeFrom, `${asset.symbol}.activeFrom`);
  if (asset.activeTo !== null) {
    validateDate(asset.activeTo, `${asset.symbol}.activeTo`);
    if (asset.activeTo < asset.activeFrom) {
      throw new Error(`Swing v2.1 universe membership for ${asset.symbol} ends before it starts`);
    }
  }
  return {
    ...asset,
    bars: normalizeBars(asset.bars),
  };
}

function screenRow(
  assetId: string,
  symbol: string,
  visibleBars: SwingBar[],
  score: SwingV21HistoricalBroadScore | null,
): SwingV21HistoricalScreenRow {
  const latest = visibleBars.at(-1)!;
  const closes = visibleBars.map((bar) => bar.close);
  const high90 = max(visibleBars.slice(-90).map((bar) => bar.high));
  const low90 = min(visibleBars.slice(-90).map((bar) => bar.low));
  const ma20 = average(closes.slice(-20));
  const ma50 = closes.length >= 50 ? average(closes.slice(-50)) : null;
  // Historical replay derives MA200 directly from the same adjusted-price bars.
  // Live nomination usually reads the equivalent value from trend-score inputs.
  const ma200 = closes.length >= 200 ? average(closes.slice(-200)) : null;
  const close5 = closes.length >= 6 ? closes.at(-6)! : null;
  const close20 = closes.length >= 21 ? closes.at(-21)! : null;
  const priorVolumes = visibleBars
    .slice(-21, -1)
    .map((bar) => finite(bar.volume))
    .filter((value): value is number => value !== null);
  const avgVolume20 = average(priorVolumes);
  const latestVolume = finite(latest.volume);
  const relativeVolume = latestVolume !== null && avgVolume20 !== null && avgVolume20 > 0
    ? latestVolume / avgVolume20
    : null;
  const current = latest.close;

  return {
    assetId,
    symbol,
    asOf: latest.date,
    bars: visibleBars.length,
    current,
    return5: close5 !== null && close5 > 0 ? (current / close5 - 1) * 100 : null,
    return20: close20 !== null && close20 > 0 ? (current / close20 - 1) * 100 : null,
    relativeVolume,
    drawdown90: high90 !== null && high90 > 0 ? current / high90 - 1 : null,
    rangeLocation90:
      high90 !== null && low90 !== null && high90 > low90
        ? (current - low90) / (high90 - low90)
        : null,
    distanceMa20: ma20 !== null && ma20 > 0 ? current / ma20 - 1 : null,
    distanceMa50: ma50 !== null && ma50 > 0 ? current / ma50 - 1 : null,
    distanceMa200: ma200 !== null && ma200 > 0 ? current / ma200 - 1 : null,
    oldMomentum: finite(score?.momentum),
    oldTrend: finite(score?.trend),
  };
}

function addTop(
  selected: Set<string>,
  rows: SwingV21HistoricalScreenRow[],
  score: (row: SwingV21HistoricalScreenRow) => number,
  count: number,
  descending: boolean,
): void {
  // Modern JS sort is stable. Because rows arrive symbol-sorted, exact ties keep
  // the same order as the live workspace rather than using UUID order.
  const ordered = [...rows].sort((left, right) => {
    const delta = score(left) - score(right);
    return delta === 0 ? 0 : descending ? -delta : delta;
  });
  for (const row of ordered.slice(0, count)) selected.add(row.assetId);
}

function enforceHistoricalScore(
  score: SwingV21HistoricalBroadScore,
  asOf: string,
  allowSameDay: boolean,
): void {
  const available = Date.parse(score.availableAt);
  if (!Number.isFinite(available)) {
    throw new Error(`Swing v2.1 historical broad score has invalid availableAt: ${score.availableAt}`);
  }
  const cutoff = Date.parse(`${asOf}${allowSameDay ? "T23:59:59.999Z" : "T00:00:00.000Z"}`);
  if (available > cutoff) {
    throw new Error(
      `Swing v2.1 point-in-time violation: broad score available at ${score.availableAt} is after the ${asOf} replay cutoff`,
    );
  }
}

function unionDates(
  universe: PreparedUniverseAsset[],
  startDate: string,
  endDate: string,
): string[] {
  const dates = new Set<string>();
  for (const asset of universe) {
    for (const bar of asset.bars) {
      if (bar.date >= startDate && bar.date <= endDate) dates.add(bar.date);
    }
  }
  return [...dates].sort();
}

function isActiveMember(asset: PreparedUniverseAsset, asOf: string): boolean {
  return asOf >= asset.activeFrom && (asset.activeTo === null || asOf <= asset.activeTo);
}

function barsThroughDate(bars: SwingBar[], asOf: string): SwingBar[] {
  let low = 0;
  let high = bars.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (bars[middle].date <= asOf) low = middle + 1;
    else high = middle;
  }
  return bars.slice(0, low);
}

function latestBarOnOrBefore(barsInput: SwingBar[], asOf: string): SwingBar | null {
  const bars = normalizeBars(barsInput);
  const visible = barsThroughDate(bars, asOf);
  return visible.at(-1) ?? null;
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

function validateDate(value: string, label: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`Swing v2.1 universe replay ${label} must be YYYY-MM-DD`);
  }
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function max(values: number[]): number | null {
  return values.length ? Math.max(...values) : null;
}

function min(values: number[]): number | null {
  return values.length ? Math.min(...values) : null;
}

function finite(value: number | null | undefined): number | null {
  return value !== null && value !== undefined && Number.isFinite(value) ? value : null;
}

function clampInt(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, Math.floor(value)));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
