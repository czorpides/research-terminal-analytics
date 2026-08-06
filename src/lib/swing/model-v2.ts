import type { SwingBar, SwingTradeGeometry } from "./model";

export type SwingV2SetupType =
  | "trend_pullback"
  | "deep_mean_reversion"
  | "sma200_bounce"
  | "catalyst_repricing"
  | "base_breakout_retest"
  | "commodity_macro";

export type SwingV2EntryState =
  | "detected"
  | "developing"
  | "actionable"
  | "event_risk"
  | "extended"
  | "invalidated";

export interface SwingV2CatalystContext {
  score: number | null;
  label: string | null;
  confidence: number;
  daysToEarnings: number | null;
  positiveRevision: boolean;
  negativeRevision: boolean;
  reasons: string[];
  risks: string[];
}

export interface SwingV2MacroContext {
  score: number;
  label: string;
  available: boolean;
  reasons: string[];
  risks: string[];
}

export interface SwingV2Context {
  existingMomentum: number | null;
  existingTrend: number | null;
  quality: number | null;
  valuation: number | null;
  catalyst: SwingV2CatalystContext;
  macro?: SwingV2MacroContext | null;
  instrumentType?: "equity" | "commodity";
}

export interface SwingV2Metrics {
  current: number;
  rsi14: number | null;
  rsiPrior5: number | null;
  rsiMin10: number | null;
  macdLine: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  macdHistogramPrior: number | null;
  macdHistogramDelta: number | null;
  ma20: number | null;
  ma50: number | null;
  ma200: number | null;
  distanceMa20Pct: number | null;
  distanceMa50Pct: number | null;
  distanceMa200Pct: number | null;
  return5dPct: number | null;
  return20dPct: number | null;
  high20: number | null;
  low20: number | null;
  high63: number | null;
  low63: number | null;
  high126: number | null;
  low126: number | null;
  high252: number | null;
  low252: number | null;
  drawdown63Pct: number | null;
  drawdown126Pct: number | null;
  drawdown252Pct: number | null;
  range63Location: number | null;
  range126Location: number | null;
  zScore20: number | null;
  zScore50: number | null;
  atr14: number | null;
  atrPct: number | null;
  atrDistanceMa200: number | null;
  relativeVolume20: number | null;
  gapPct: number | null;
  higherLow: boolean;
  bullishClose: boolean;
  ma20Reclaim: boolean;
  sma200Reclaim: boolean;
  breakout20: boolean;
  breakoutExtensionPct: number | null;
  baseRange40Pct: number | null;
  baseCompression: boolean;
  breakoutRetest: boolean;
  latestDayReturnPct: number | null;
}

export interface SwingV2Candidate {
  setup: SwingV2SetupType;
  setupLabel: string;
  entryState: SwingV2EntryState;
  modelVersion: string;
  technicalScore: number;
  catalystScore: number;
  contextScore: number;
  entryQuality: number;
  chaseRisk: number;
  compositeScore: number;
  rankingScore: number;
  evidenceCoverage: number;
  calibrated: false;
  geometry: SwingTradeGeometry | null;
  reasons: string[];
  confirmations: string[];
  risks: string[];
  metrics: SwingV2Metrics;
}

interface SetupDraft {
  setup: SwingV2SetupType;
  fitScore: number;
  technicalScore: number;
  baseEntryQuality: number;
  requiredEvidence: number;
  evidencePresent: number;
  triggerCount: number;
  eligible: boolean;
  invalidated: boolean;
  reasons: string[];
  confirmations: string[];
  risks: string[];
  geometry: SwingTradeGeometry | null;
}

export const SWING_V2_MODEL_VERSION = "swing.setup.v2.0-shadow";

const SETUP_LABELS: Record<SwingV2SetupType, string> = {
  trend_pullback: "Trend Pullback",
  deep_mean_reversion: "Deep Mean Reversion",
  sma200_bounce: "200SMA Bounce / Reclaim",
  catalyst_repricing: "Catalyst Repricing",
  base_breakout_retest: "Base Breakout / Retest",
  commodity_macro: "Commodity Macro Swing",
};

export function computeSwingTradeV2(
  barsInput: SwingBar[],
  context: SwingV2Context,
): SwingV2Candidate | null {
  const bars = [...barsInput].filter(validBar).sort((a, b) => a.date.localeCompare(b.date));
  if (bars.length < 45) return null;

  const metrics = computeMetrics(bars);
  const macro = context.macro ?? neutralMacro();
  const catalystScore = usableCatalystScore(context.catalyst);
  const contextScore = macro.available ? macro.score : 50;
  const chaseRisk = computeChaseRisk(metrics);

  const drafts: SetupDraft[] = context.instrumentType === "commodity"
    ? [buildCommodityMacro(metrics, context, macro)]
    : [
        buildTrendPullback(metrics, context),
        buildDeepMeanReversion(metrics, context),
        buildSma200Bounce(metrics, context),
        buildCatalystRepricing(metrics, context),
        buildBaseBreakout(metrics, context),
      ];

  const candidates = drafts
    .filter((draft) => draft.fitScore >= 35 || draft.eligible)
    .map((draft) => finalizeDraft(draft, metrics, context, macro, catalystScore, chaseRisk));

  candidates.sort((left, right) =>
    right.rankingScore - left.rankingScore ||
    right.entryQuality - left.entryQuality ||
    right.technicalScore - left.technicalScore,
  );
  return candidates[0] ?? null;
}

function computeMetrics(bars: SwingBar[]): SwingV2Metrics {
  const latest = bars.at(-1)!;
  const closes = bars.map((bar) => bar.close);
  const ma20 = average(closes.slice(-20));
  const ma50 = closes.length >= 50 ? average(closes.slice(-50)) : null;
  const ma200 = closes.length >= 200 ? average(closes.slice(-200)) : null;
  const high20 = max(bars.slice(-20).map((bar) => bar.high));
  const low20 = min(bars.slice(-20).map((bar) => bar.low));
  const high63 = max(bars.slice(-Math.min(63, bars.length)).map((bar) => bar.high));
  const low63 = min(bars.slice(-Math.min(63, bars.length)).map((bar) => bar.low));
  const high126 = bars.length >= 100 ? max(bars.slice(-Math.min(126, bars.length)).map((bar) => bar.high)) : null;
  const low126 = bars.length >= 100 ? min(bars.slice(-Math.min(126, bars.length)).map((bar) => bar.low)) : null;
  const high252 = bars.length >= 180 ? max(bars.slice(-Math.min(252, bars.length)).map((bar) => bar.high)) : null;
  const low252 = bars.length >= 180 ? min(bars.slice(-Math.min(252, bars.length)).map((bar) => bar.low)) : null;
  const rsi14 = rsi(closes, 14);
  const rsiPrior5 = closes.length > 20 ? rsi(closes.slice(0, -5), 14) : null;
  const rsiWindow = Array.from({ length: Math.min(10, Math.max(0, bars.length - 14)) }, (_, index) =>
    rsi(closes.slice(0, bars.length - index), 14),
  ).filter((value): value is number => value !== null);
  const rsiMin10 = min(rsiWindow);
  const macd = macdMetrics(closes);
  const atr14 = atr(bars, 14);
  const prior20 = bars.slice(-21, -1);
  const resistance20 = max(prior20.map((bar) => bar.high));
  const current = latest.close;
  const breakout20 = resistance20 !== null && current > resistance20 * 1.001;
  const breakoutExtensionPct = resistance20 && resistance20 > 0
    ? percent(current / resistance20 - 1)
    : null;
  const priorVolumes = prior20
    .map((bar) => finite(bar.volume))
    .filter((value): value is number => value !== null && value > 0);
  const latestVolume = finite(latest.volume);
  const avgVolume20 = average(priorVolumes);
  const relativeVolume20 = latestVolume !== null && avgVolume20 !== null && avgVolume20 > 0
    ? latestVolume / avgVolume20
    : null;
  const recentFive = bars.slice(-5);
  const priorFive = bars.slice(-10, -5);
  const higherLow = recentFive.length === 5 && priorFive.length === 5 &&
    (min(recentFive.map((bar) => bar.low)) ?? -Infinity) > (min(priorFive.map((bar) => bar.low)) ?? Infinity);
  const priorMa20 = closes.length >= 25 ? average(closes.slice(-25, -5)) : null;
  const ma20Reclaim = ma20 !== null && priorMa20 !== null && bars.length >= 6 &&
    current > ma20 && bars[bars.length - 6].close <= priorMa20;
  const priorMa200 = closes.length >= 205 ? average(closes.slice(-205, -5)) : null;
  const sma200Reclaim = ma200 !== null && priorMa200 !== null && bars.length >= 6 &&
    current > ma200 && bars[bars.length - 6].close <= priorMa200;
  const range = latest.high - latest.low;
  const bullishClose = latest.close > latest.open &&
    (range <= 0 || latest.close >= latest.low + range * 0.65);
  const previousClose = bars.length >= 2 ? bars[bars.length - 2].close : null;
  const gapPct = previousClose && previousClose > 0 ? percent(latest.open / previousClose - 1) : null;
  const latestDayReturnPct = previousClose && previousClose > 0 ? percent(current / previousClose - 1) : null;
  const baseBars = bars.slice(-41, -1);
  const baseHigh = max(baseBars.map((bar) => bar.high));
  const baseLow = min(baseBars.map((bar) => bar.low));
  const baseMid = baseHigh !== null && baseLow !== null ? (baseHigh + baseLow) / 2 : null;
  const baseRange40Pct = baseHigh !== null && baseLow !== null && baseMid && baseMid > 0
    ? percent((baseHigh - baseLow) / baseMid)
    : null;
  const baseCompression = baseRange40Pct !== null && baseRange40Pct <= 15;
  const breakoutRetest = resistance20 !== null &&
    current >= resistance20 * 0.992 && current <= resistance20 * 1.03 &&
    (higherLow || bullishClose || ma20Reclaim);

  return {
    current,
    rsi14,
    rsiPrior5,
    rsiMin10,
    macdLine: macd.line,
    macdSignal: macd.signal,
    macdHistogram: macd.histogram,
    macdHistogramPrior: macd.priorHistogram,
    macdHistogramDelta: macd.delta,
    ma20,
    ma50,
    ma200,
    distanceMa20Pct: distancePct(current, ma20),
    distanceMa50Pct: distancePct(current, ma50),
    distanceMa200Pct: distancePct(current, ma200),
    return5dPct: percent(trailingReturn(closes, 5)),
    return20dPct: percent(trailingReturn(closes, 20)),
    high20,
    low20,
    high63,
    low63,
    high126,
    low126,
    high252,
    low252,
    drawdown63Pct: drawdownPct(current, high63),
    drawdown126Pct: drawdownPct(current, high126),
    drawdown252Pct: drawdownPct(current, high252),
    range63Location: rangeLocation(current, low63, high63),
    range126Location: rangeLocation(current, low126, high126),
    zScore20: zScore(closes.slice(-20), current),
    zScore50: closes.length >= 50 ? zScore(closes.slice(-50), current) : null,
    atr14,
    atrPct: atr14 !== null && current > 0 ? percent(atr14 / current) : null,
    atrDistanceMa200: atr14 !== null && atr14 > 0 && ma200 !== null ? (current - ma200) / atr14 : null,
    relativeVolume20,
    gapPct,
    higherLow,
    bullishClose,
    ma20Reclaim,
    sma200Reclaim,
    breakout20,
    breakoutExtensionPct,
    baseRange40Pct,
    baseCompression,
    breakoutRetest,
    latestDayReturnPct,
  };
}

function buildTrendPullback(m: SwingV2Metrics, c: SwingV2Context): SetupDraft {
  const trendHealthy =
    (m.ma200 !== null && m.current > m.ma200 && (m.ma50 === null || m.ma50 >= m.ma200 * 0.99)) ||
    (c.existingTrend ?? 0) >= 62;
  const drawdown = m.drawdown63Pct;
  const controlledPullback = drawdown !== null && drawdown <= -4 && drawdown >= -18;
  const nearSupport = [m.distanceMa20Pct, m.distanceMa50Pct]
    .filter((value): value is number => value !== null)
    .some((value) => Math.abs(value) <= 4.5) ||
    (m.low20 !== null && Math.abs(m.current / m.low20 - 1) <= 0.055);
  const rsiHealthy = m.rsi14 !== null && m.rsi14 >= 36 && m.rsi14 <= 58;
  const momentumTurning = macdImproving(m) || risingRsi(m);
  const confirmationCount = countTrue(m.higherLow, m.ma20Reclaim, m.bullishClose, momentumTurning);
  const location = scoreLocationPullback(m);
  const technical = weighted([
    [trendHealthy ? 82 : 32, 0.25],
    [controlledPullback ? 85 : drawdown !== null && drawdown < -25 ? 25 : 48, 0.2],
    [nearSupport ? 84 : 42, 0.2],
    [rsiHealthy ? 78 : m.rsi14 !== null && m.rsi14 > 70 ? 28 : 52, 0.15],
    [momentumTurning ? 78 : 43, 0.2],
  ]);
  return {
    setup: "trend_pullback",
    fitScore: weighted([[technical, 0.7], [location, 0.3]]),
    technicalScore: technical,
    baseEntryQuality: location,
    requiredEvidence: 5,
    evidencePresent: countPresent(m.ma20, m.ma50, m.rsi14, m.atr14, m.drawdown63Pct),
    triggerCount: confirmationCount,
    eligible: trendHealthy && controlledPullback && nearSupport,
    invalidated: m.ma200 !== null && m.current < m.ma200 * 0.9,
    reasons: compact([
      trendHealthy ? "The broader trend remains constructive rather than broken." : null,
      controlledPullback ? `Price is ${fmtPct(drawdown)} below its 3-month high, inside a controlled pullback zone.` : null,
      nearSupport ? "Price is close to a 20/50-day average or recent support rather than chasing strength." : null,
      rsiHealthy ? `RSI has cooled to ${round(m.rsi14!, 1)} without becoming structurally weak.` : null,
    ]),
    confirmations: confirmationLabels(m),
    risks: compact([
      !trendHealthy ? "The primary trend is not strong enough for a clean trend-pullback trade." : null,
      m.rsi14 !== null && m.rsi14 > 68 ? "Momentum has not cooled enough to offer a favourable pullback entry." : null,
    ]),
    geometry: geometryFor("trend_pullback", m),
  };
}

function buildDeepMeanReversion(m: SwingV2Metrics, c: SwingV2Context): SetupDraft {
  const dislocated =
    (m.drawdown63Pct !== null && m.drawdown63Pct <= -12) ||
    (m.zScore20 !== null && m.zScore20 <= -1.8) ||
    (m.distanceMa50Pct !== null && m.distanceMa50Pct <= -9);
  const wasOversold = (m.rsiMin10 ?? 100) <= 32 || (m.rsi14 ?? 100) <= 30;
  const recoveringRsi = m.rsi14 !== null && m.rsiMin10 !== null && m.rsi14 >= m.rsiMin10 + 5;
  const momentumTurning = macdImproving(m) || recoveringRsi;
  const confirmationCount = countTrue(momentumTurning, m.higherLow, m.bullishClose, m.ma20Reclaim);
  const latestStillFalling = (m.latestDayReturnPct ?? 0) <= -4 && !m.bullishClose;
  const qualitySupport = (c.quality ?? 50) >= 45 || (c.valuation ?? 50) >= 55;
  const technical = weighted([
    [dislocated ? 88 : 38, 0.28],
    [wasOversold ? 90 : m.rsi14 !== null && m.rsi14 <= 38 ? 70 : 40, 0.22],
    [momentumTurning ? 82 : 38, 0.25],
    [confirmationCount >= 2 ? 82 : confirmationCount === 1 ? 62 : 35, 0.2],
    [qualitySupport ? 65 : 45, 0.05],
  ]);
  const location = scoreLocationMeanReversion(m);
  return {
    setup: "deep_mean_reversion",
    fitScore: weighted([[technical, 0.72], [location, 0.28]]),
    technicalScore: technical,
    baseEntryQuality: location,
    requiredEvidence: 5,
    evidencePresent: countPresent(m.rsi14, m.rsiMin10, m.drawdown63Pct, m.atr14, m.macdHistogram),
    triggerCount: confirmationCount,
    eligible: dislocated && wasOversold,
    invalidated: latestStillFalling && confirmationCount === 0,
    reasons: compact([
      dislocated ? `Price is materially dislocated (${fmtPct(m.drawdown63Pct)} from the 3-month high).` : null,
      wasOversold ? `RSI reached an oversold extreme near ${round(m.rsiMin10 ?? m.rsi14 ?? 0, 1)}.` : null,
      recoveringRsi ? `RSI has recovered to ${round(m.rsi14!, 1)}, indicating selling pressure may be exhausting.` : null,
      macdImproving(m) ? "MACD histogram is improving even if the MACD line remains negative." : null,
    ]),
    confirmations: confirmationLabels(m),
    risks: compact([
      latestStillFalling ? "The latest session still looks like a falling knife rather than a stabilising reversal." : null,
      (c.existingTrend ?? 50) < 35 ? "The longer-term trend is weak, so this remains a counter-trend trade." : null,
    ]),
    geometry: geometryFor("deep_mean_reversion", m),
  };
}

function buildSma200Bounce(m: SwingV2Metrics, c: SwingV2Context): SetupDraft {
  const hasSma = m.ma200 !== null && m.distanceMa200Pct !== null;
  const inBounceZone = hasSma && m.distanceMa200Pct! >= -15 && m.distanceMa200Pct! <= 3.5;
  const meaningfulDamage =
    (m.drawdown126Pct !== null && m.drawdown126Pct <= -7) ||
    (m.drawdown63Pct !== null && m.drawdown63Pct <= -7);
  const cooled = m.rsi14 !== null && m.rsi14 <= 48;
  const improving = macdImproving(m) || risingRsi(m);
  const confirmationCount = countTrue(m.sma200Reclaim, m.higherLow, m.bullishClose, improving, m.ma20Reclaim);
  const technical = weighted([
    [inBounceZone ? 88 : 30, 0.3],
    [meaningfulDamage ? 78 : 48, 0.15],
    [cooled ? 78 : 45, 0.15],
    [improving ? 82 : 40, 0.2],
    [confirmationCount >= 2 ? 82 : confirmationCount === 1 ? 60 : 34, 0.2],
  ]);
  const location = scoreLocationSma200(m);
  return {
    setup: "sma200_bounce",
    fitScore: weighted([[technical, 0.7], [location, 0.3]]),
    technicalScore: technical,
    baseEntryQuality: location,
    requiredEvidence: 6,
    evidencePresent: countPresent(m.ma200, m.distanceMa200Pct, m.rsi14, m.macdHistogram, m.atr14, m.drawdown126Pct),
    triggerCount: confirmationCount,
    eligible: Boolean(inBounceZone && meaningfulDamage),
    invalidated: hasSma && m.distanceMa200Pct! < -20 && confirmationCount === 0,
    reasons: compact([
      inBounceZone ? `Price is ${fmtPct(m.distanceMa200Pct)} versus its 200SMA, inside the mean-reversion/reclaim zone.` : null,
      meaningfulDamage ? `The stock has already absorbed a meaningful correction (${fmtPct(m.drawdown126Pct ?? m.drawdown63Pct)} from its recent high).` : null,
      m.sma200Reclaim ? "Price has reclaimed the 200SMA after trading below it." : null,
      improving ? "Momentum is improving rather than continuing to deteriorate." : null,
    ]),
    confirmations: confirmationLabels(m),
    risks: compact([
      !hasSma ? "A full 200-session history is not available yet, so the 200SMA setup cannot be trusted." : null,
      hasSma && m.distanceMa200Pct! < -15 ? "Price is too far below the 200SMA to treat this as a normal bounce setup." : null,
      (c.existingTrend ?? 50) < 30 ? "The primary trend is very weak and raises the risk of a failed bounce." : null,
    ]),
    geometry: geometryFor("sma200_bounce", m),
  };
}

function buildCatalystRepricing(m: SwingV2Metrics, c: SwingV2Context): SetupDraft {
  const catalyst = c.catalyst;
  const depressed =
    (m.drawdown126Pct !== null && m.drawdown126Pct <= -10) ||
    (m.range126Location !== null && m.range126Location <= 0.3) ||
    (m.drawdown63Pct !== null && m.drawdown63Pct <= -10);
  const catalystSupport =
    (catalyst.score ?? 0) >= 62 ||
    catalyst.positiveRevision;
  const improving = macdImproving(m) || risingRsi(m) || m.higherLow || m.ma20Reclaim;
  const confirmationCount = countTrue(macdImproving(m), risingRsi(m), m.higherLow, m.ma20Reclaim, m.bullishClose);
  const technical = weighted([
    [depressed ? 84 : 38, 0.3],
    [catalystSupport ? 88 : 32, 0.3],
    [improving ? 78 : 42, 0.2],
    [confirmationCount >= 2 ? 78 : confirmationCount === 1 ? 58 : 35, 0.2],
  ]);
  const location = scoreLocationCatalyst(m);
  return {
    setup: "catalyst_repricing",
    fitScore: weighted([[technical, 0.7], [location, 0.3]]),
    technicalScore: technical,
    baseEntryQuality: location,
    requiredEvidence: 5,
    evidencePresent: countPresent(m.drawdown126Pct ?? m.drawdown63Pct, m.rsi14, m.macdHistogram, m.atr14, catalyst.score),
    triggerCount: confirmationCount,
    eligible: depressed && catalystSupport,
    invalidated: catalyst.negativeRevision && !improving,
    reasons: compact([
      depressed ? `Price remains depressed (${fmtPct(m.drawdown126Pct ?? m.drawdown63Pct)} from its recent high).` : null,
      catalystSupport ? catalyst.label ?? "Forward expectations or a recent event provide a positive repricing catalyst." : null,
      catalyst.positiveRevision ? "Analyst EPS/revenue/price-target revisions are moving in a supportive direction." : null,
      improving ? "Price/momentum is beginning to stabilise while expectations improve." : null,
      ...catalyst.reasons.slice(0, 3),
    ]),
    confirmations: confirmationLabels(m),
    risks: compact([
      ...catalyst.risks.slice(0, 3),
      catalyst.negativeRevision ? "Forward expectations are deteriorating and work against the repricing thesis." : null,
    ]),
    geometry: geometryFor("catalyst_repricing", m),
  };
}

function buildBaseBreakout(m: SwingV2Metrics, c: SwingV2Context): SetupDraft {
  const trendHealthy =
    (m.ma50 !== null && m.ma200 !== null && m.ma50 >= m.ma200 * 0.98 && m.current >= m.ma50 * 0.98) ||
    (c.existingTrend ?? 0) >= 58;
  const closeToTrigger = m.breakoutExtensionPct !== null && m.breakoutExtensionPct >= -1.5 && m.breakoutExtensionPct <= 3;
  const participation = m.relativeVolume20 !== null && m.relativeVolume20 >= 1.2;
  const limitedGap = m.gapPct === null || Math.abs(m.gapPct) <= 5;
  const validBase = m.baseCompression && (m.baseRange40Pct ?? 99) >= 3;
  const trigger = (m.breakout20 && closeToTrigger && participation) || (m.breakoutRetest && validBase);
  const confirmationCount = countTrue(m.breakout20, m.breakoutRetest, participation, m.bullishClose, m.higherLow);
  const technical = weighted([
    [validBase ? 88 : 34, 0.28],
    [trendHealthy ? 78 : 42, 0.17],
    [closeToTrigger ? 85 : 35, 0.2],
    [participation ? 80 : m.relativeVolume20 === null ? 50 : 38, 0.15],
    [limitedGap ? 75 : 25, 0.1],
    [trigger ? 85 : 48, 0.1],
  ]);
  const location = scoreLocationBreakout(m);
  return {
    setup: "base_breakout_retest",
    fitScore: weighted([[technical, 0.75], [location, 0.25]]),
    technicalScore: technical,
    baseEntryQuality: location,
    requiredEvidence: 6,
    evidencePresent: countPresent(m.baseRange40Pct, m.breakoutExtensionPct, m.relativeVolume20, m.atr14, m.ma20, m.ma50),
    triggerCount: confirmationCount,
    eligible: validBase && trendHealthy && closeToTrigger,
    invalidated: !limitedGap || (m.breakoutExtensionPct ?? 0) > 6,
    reasons: compact([
      validBase ? `Price has spent roughly 40 sessions in a ${round(m.baseRange40Pct!, 1)}% range rather than rising vertically.` : null,
      m.breakout20 ? "Price has cleared recent resistance." : null,
      m.breakoutRetest ? "Price is holding close to the breakout level/retest zone." : null,
      participation ? `Relative volume is ${round(m.relativeVolume20!, 2)}x its 20-day baseline.` : null,
    ]),
    confirmations: confirmationLabels(m),
    risks: compact([
      !validBase ? "There is no sufficiently tight multi-week base; a simple new high is not enough for an actionable breakout." : null,
      !limitedGap ? `The latest gap is ${fmtPct(m.gapPct)}, which creates chase/slippage risk.` : null,
      (m.breakoutExtensionPct ?? 0) > 3 ? "Price has moved too far beyond the breakout level to offer a clean entry." : null,
    ]),
    geometry: geometryFor("base_breakout_retest", m),
  };
}

function buildCommodityMacro(
  m: SwingV2Metrics,
  c: SwingV2Context,
  macro: SwingV2MacroContext,
): SetupDraft {
  const trendSupport =
    (m.ma200 !== null && m.current >= m.ma200 * 0.97) ||
    (c.existingTrend ?? 50) >= 55;
  const pullbackOrOversold =
    (m.drawdown63Pct !== null && m.drawdown63Pct <= -3 && m.drawdown63Pct >= -18) ||
    (m.rsi14 !== null && m.rsi14 <= 43) ||
    (m.zScore20 !== null && m.zScore20 <= -1.25);
  const turning = macdImproving(m) || risingRsi(m) || m.higherLow || m.bullishClose;
  const macroSupport = macro.available && macro.score >= 58;
  const confirmationCount = countTrue(macdImproving(m), risingRsi(m), m.higherLow, m.bullishClose, m.ma20Reclaim);
  const technical = weighted([
    [trendSupport ? 72 : 45, 0.2],
    [pullbackOrOversold ? 84 : 48, 0.25],
    [turning ? 82 : 40, 0.25],
    [macroSupport ? 86 : macro.available ? 40 : 50, 0.3],
  ]);
  const location = scoreLocationMeanReversion(m);
  return {
    setup: "commodity_macro",
    fitScore: weighted([[technical, 0.72], [location, 0.28]]),
    technicalScore: technical,
    baseEntryQuality: location,
    requiredEvidence: 5,
    evidencePresent: countPresent(m.rsi14, m.macdHistogram, m.ma20, m.atr14, m.drawdown63Pct),
    triggerCount: confirmationCount,
    eligible: pullbackOrOversold && turning && (macroSupport || !macro.available),
    invalidated: macro.available && macro.score < 30 && !turning,
    reasons: compact([
      pullbackOrOversold ? "The commodity has pulled back or reached a statistically stretched location." : null,
      turning ? "Price momentum is beginning to turn rather than merely remaining oversold." : null,
      macroSupport ? macro.label : null,
      ...macro.reasons.slice(0, 3),
    ]),
    confirmations: confirmationLabels(m),
    risks: compact([...macro.risks.slice(0, 3)]),
    geometry: geometryFor("commodity_macro", m),
  };
}

function finalizeDraft(
  draft: SetupDraft,
  metrics: SwingV2Metrics,
  context: SwingV2Context,
  macro: SwingV2MacroContext,
  catalystScore: number,
  chaseRisk: number,
): SwingV2Candidate {
  const coverage = draft.requiredEvidence > 0
    ? clamp((draft.evidencePresent / draft.requiredEvidence) * 100)
    : 100;
  let entryQuality = clamp(draft.baseEntryQuality - chaseRisk * 0.45);
  if (draft.triggerCount >= 2) entryQuality = clamp(entryQuality + 8);
  if (draft.triggerCount >= 3) entryQuality = clamp(entryQuality + 5);
  const geometry = draft.geometry;
  if (geometry && geometry.rewardRisk >= 1.8) entryQuality = clamp(entryQuality + 8);
  else if (geometry && geometry.rewardRisk < 1.35) entryQuality = clamp(entryQuality - 18);
  else if (!geometry) entryQuality = clamp(entryQuality - 15);

  const catalystWeight = draft.setup === "catalyst_repricing" ? 0.25 : context.instrumentType === "commodity" ? 0 : 0.12;
  const contextWeight = context.instrumentType === "commodity" ? 0.25 : 0.08;
  const technicalWeight = context.instrumentType === "commodity" ? 0.45 : draft.setup === "catalyst_repricing" ? 0.37 : 0.45;
  const entryWeight = Math.max(0, 1 - catalystWeight - contextWeight - technicalWeight);
  const composite = weighted([
    [draft.technicalScore, technicalWeight],
    [entryQuality, entryWeight],
    [catalystScore, catalystWeight],
    [macro.available ? macro.score : 50, contextWeight],
  ]);

  const eventRisk = context.catalyst.daysToEarnings !== null && context.catalyst.daysToEarnings <= 3;
  const breakoutException = draft.setup === "base_breakout_retest" &&
    metrics.baseCompression &&
    (metrics.breakoutExtensionPct ?? 99) <= 2.5 &&
    (metrics.breakout20 || metrics.breakoutRetest);
  const extended = chaseRisk >= 62 && !breakoutException;
  const rrGood = geometry !== null && geometry.rewardRisk >= 1.5;
  const actionable =
    draft.eligible &&
    !draft.invalidated &&
    !eventRisk &&
    !extended &&
    draft.triggerCount >= 2 &&
    entryQuality >= 68 &&
    draft.technicalScore >= 66 &&
    rrGood &&
    coverage >= 70;
  let entryState: SwingV2EntryState = "detected";
  if (draft.invalidated) entryState = "invalidated";
  else if (eventRisk) entryState = "event_risk";
  else if (extended) entryState = "extended";
  else if (actionable) entryState = "actionable";
  else if (draft.eligible || draft.technicalScore >= 58) entryState = "developing";

  const stateAdjustment: Record<SwingV2EntryState, number> = {
    actionable: 8,
    developing: 2,
    detected: 0,
    event_risk: -8,
    extended: -16,
    invalidated: -30,
  };
  const rankingScore = clamp(composite + stateAdjustment[entryState]);

  const risks = [...draft.risks];
  if (eventRisk) risks.unshift(`Earnings are due in ${context.catalyst.daysToEarnings} day${context.catalyst.daysToEarnings === 1 ? "" : "s"}; the setup carries binary gap risk.`);
  if (extended) risks.unshift("Entry location is extended/chase-prone even if the directional trend remains strong.");
  if (!rrGood) risks.push("Current structural levels do not offer at least 1.5x modelled reward/risk, so the entry is not actionable.");
  if (coverage < 70) risks.push("The setup lacks enough quantitative history/evidence to be actionable.");

  return {
    setup: draft.setup,
    setupLabel: SETUP_LABELS[draft.setup],
    entryState,
    modelVersion: SWING_V2_MODEL_VERSION,
    technicalScore: round(draft.technicalScore, 1),
    catalystScore: round(catalystScore, 1),
    contextScore: round(macro.available ? macro.score : 50, 1),
    entryQuality: round(entryQuality, 1),
    chaseRisk: round(chaseRisk, 1),
    compositeScore: round(composite, 1),
    rankingScore: round(rankingScore, 1),
    evidenceCoverage: round(coverage, 0),
    calibrated: false,
    geometry,
    reasons: unique(draft.reasons).slice(0, 8),
    confirmations: unique(draft.confirmations).slice(0, 6),
    risks: unique(risks).slice(0, 8),
    metrics,
  };
}

function computeChaseRisk(m: SwingV2Metrics): number {
  let score = 5;
  const nearHigh = m.drawdown252Pct ?? m.drawdown126Pct ?? m.drawdown63Pct;
  if (nearHigh !== null) {
    if (nearHigh >= -1.5) score += 34;
    else if (nearHigh >= -3) score += 24;
    else if (nearHigh >= -5) score += 12;
  }
  if (m.distanceMa20Pct !== null) {
    if (m.distanceMa20Pct > 9) score += 32;
    else if (m.distanceMa20Pct > 6) score += 20;
    else if (m.distanceMa20Pct > 4) score += 10;
  }
  if (m.distanceMa50Pct !== null) {
    if (m.distanceMa50Pct > 12) score += 20;
    else if (m.distanceMa50Pct > 8) score += 12;
  }
  if (m.rsi14 !== null) {
    if (m.rsi14 > 76) score += 30;
    else if (m.rsi14 > 70) score += 18;
    else if (m.rsi14 > 66) score += 8;
  }
  if (m.gapPct !== null && m.gapPct > 5) score += 18;
  if (m.breakoutExtensionPct !== null && m.breakoutExtensionPct > 4) score += 18;
  if (m.baseCompression && m.breakoutRetest && (m.breakoutExtensionPct ?? 99) <= 2.5) score -= 18;
  return clamp(score);
}

function scoreLocationPullback(m: SwingV2Metrics): number {
  let score = 45;
  for (const distance of [m.distanceMa20Pct, m.distanceMa50Pct]) {
    if (distance === null) continue;
    const abs = Math.abs(distance);
    if (abs <= 2.5) score += 18;
    else if (abs <= 5) score += 9;
    else if (distance > 8) score -= 15;
  }
  if (m.drawdown63Pct !== null && m.drawdown63Pct <= -5 && m.drawdown63Pct >= -15) score += 15;
  if (m.higherLow) score += 8;
  return clamp(score);
}

function scoreLocationMeanReversion(m: SwingV2Metrics): number {
  let score = 42;
  if (m.range63Location !== null) {
    if (m.range63Location <= 0.15) score += 25;
    else if (m.range63Location <= 0.3) score += 16;
    else if (m.range63Location >= 0.8) score -= 18;
  }
  if (m.zScore20 !== null) {
    if (m.zScore20 <= -2) score += 20;
    else if (m.zScore20 <= -1.2) score += 10;
    else if (m.zScore20 > 1.5) score -= 15;
  }
  if (m.higherLow || m.ma20Reclaim) score += 10;
  return clamp(score);
}

function scoreLocationSma200(m: SwingV2Metrics): number {
  if (m.distanceMa200Pct === null) return 25;
  let score = 40;
  if (m.distanceMa200Pct >= -8 && m.distanceMa200Pct <= 1.5) score += 35;
  else if (m.distanceMa200Pct >= -15 && m.distanceMa200Pct <= 3.5) score += 20;
  else if (m.distanceMa200Pct > 8) score -= 20;
  if (m.sma200Reclaim) score += 12;
  if (m.higherLow) score += 8;
  return clamp(score);
}

function scoreLocationCatalyst(m: SwingV2Metrics): number {
  let score = 45;
  if (m.range126Location !== null && m.range126Location <= 0.35) score += 22;
  if (m.drawdown126Pct !== null && m.drawdown126Pct <= -10 && m.drawdown126Pct >= -40) score += 18;
  if (m.distanceMa20Pct !== null && Math.abs(m.distanceMa20Pct) <= 4) score += 10;
  if ((m.drawdown126Pct ?? 0) > -3) score -= 20;
  return clamp(score);
}

function scoreLocationBreakout(m: SwingV2Metrics): number {
  let score = 35;
  if (m.baseCompression) score += 25;
  if (m.breakoutExtensionPct !== null && m.breakoutExtensionPct >= -1 && m.breakoutExtensionPct <= 2.5) score += 28;
  else if ((m.breakoutExtensionPct ?? 0) > 4) score -= 25;
  if (m.breakoutRetest) score += 12;
  if (m.distanceMa20Pct !== null && m.distanceMa20Pct > 7) score -= 20;
  return clamp(score);
}

function geometryFor(setup: SwingV2SetupType, m: SwingV2Metrics): SwingTradeGeometry | null {
  if (m.atr14 === null || m.atr14 <= 0) return null;
  const entry = m.current;
  const atrValue = m.atr14;
  let stopCandidates: number[] = [];
  let targetCandidates: number[] = [];
  let targetBasis = "next structural level";

  if (setup === "trend_pullback") {
    stopCandidates = [m.low20 !== null ? m.low20 - 0.25 * atrValue : entry - 1.8 * atrValue];
    targetCandidates = [m.high20, m.high63, m.high126].filter(isPositiveNumber);
    targetBasis = "recent resistance / 3-month high";
  } else if (setup === "deep_mean_reversion" || setup === "commodity_macro") {
    stopCandidates = [m.low20 !== null ? m.low20 - 0.3 * atrValue : entry - 2 * atrValue];
    targetCandidates = [m.ma20, m.ma50, m.high20, m.ma200].filter(isPositiveNumber);
    targetBasis = "first mean-reversion / resistance level";
  } else if (setup === "sma200_bounce") {
    stopCandidates = [m.low20 !== null ? m.low20 - 0.35 * atrValue : entry - 2 * atrValue];
    targetCandidates = [m.ma20, m.ma50, m.high20, m.high63].filter(isPositiveNumber);
    targetBasis = "first reclaim level / recent resistance";
  } else if (setup === "catalyst_repricing") {
    stopCandidates = [m.low20 !== null ? m.low20 - 0.3 * atrValue : entry - 2 * atrValue];
    targetCandidates = [m.ma20, m.ma50, m.high20, m.high63, m.high126].filter(isPositiveNumber);
    targetBasis = "next recovery level";
  } else if (setup === "base_breakout_retest") {
    const baseRisk = m.low20 !== null ? Math.max(m.low20, entry - 2.2 * atrValue) : entry - 1.8 * atrValue;
    stopCandidates = [baseRisk];
    const range = m.high20 !== null && m.low20 !== null ? m.high20 - m.low20 : null;
    if (range !== null && range > 0) targetCandidates = [entry + range * 0.6];
    targetBasis = "60% measured move from the recent base";
  }

  const stop = stopCandidates.filter((value) => Number.isFinite(value) && value > 0 && value < entry)
    .sort((a, b) => b - a)[0] ?? null;
  const target = targetCandidates.filter((value) => Number.isFinite(value) && value > entry * 1.005)
    .sort((a, b) => a - b)[0] ?? null;
  if (stop === null || target === null || !(target > entry && stop < entry)) return null;
  const risk = entry - stop;
  const rewardRisk = risk > 0 ? (target - entry) / risk : 0;
  return {
    entryLow: Math.max(0.01, entry - 0.12 * atrValue),
    entryHigh: entry + 0.12 * atrValue,
    invalidation: round(stop, 6),
    target: round(target, 6),
    rewardRisk: round(Math.max(0, rewardRisk), 2),
    targetBasis,
  };
}

function confirmationLabels(m: SwingV2Metrics): string[] {
  return compact([
    m.higherLow ? "Higher low" : null,
    m.ma20Reclaim ? "20SMA reclaim" : null,
    m.sma200Reclaim ? "200SMA reclaim" : null,
    m.bullishClose ? "Bullish close" : null,
    risingRsi(m) ? "RSI recovering" : null,
    macdImproving(m) ? "MACD histogram improving" : null,
    m.relativeVolume20 !== null && m.relativeVolume20 >= 1.2 ? "Volume confirmation" : null,
  ]);
}

function macdImproving(m: Pick<SwingV2Metrics, "macdHistogram" | "macdHistogramPrior" | "macdHistogramDelta">): boolean {
  if (m.macdHistogram === null || m.macdHistogramPrior === null) return false;
  return (m.macdHistogramDelta ?? 0) > 0 && m.macdHistogram > m.macdHistogramPrior;
}

function risingRsi(m: Pick<SwingV2Metrics, "rsi14" | "rsiPrior5" | "rsiMin10">): boolean {
  if (m.rsi14 === null) return false;
  if (m.rsiPrior5 !== null && m.rsi14 >= m.rsiPrior5 + 2) return true;
  return m.rsiMin10 !== null && m.rsi14 >= m.rsiMin10 + 5;
}

function usableCatalystScore(catalyst: SwingV2CatalystContext): number {
  if (catalyst.score === null) return 50;
  if (catalyst.confidence < 35) return 50 + (catalyst.score - 50) * 0.35;
  if (catalyst.confidence < 60) return 50 + (catalyst.score - 50) * 0.65;
  return catalyst.score;
}

function neutralMacro(): SwingV2MacroContext {
  return { score: 50, label: "Macro context unavailable", available: false, reasons: [], risks: [] };
}

function macdMetrics(closes: number[]): {
  line: number | null;
  signal: number | null;
  histogram: number | null;
  priorHistogram: number | null;
  delta: number | null;
} {
  if (closes.length < 35) return { line: null, signal: null, histogram: null, priorHistogram: null, delta: null };
  const ema12 = emaSeries(closes, 12);
  const ema26 = emaSeries(closes, 26);
  const macdSeries: number[] = [];
  for (let index = 0; index < closes.length; index += 1) {
    const fast = ema12[index];
    const slow = ema26[index];
    if (fast !== null && slow !== null) macdSeries.push(fast - slow);
  }
  if (macdSeries.length < 10) return { line: null, signal: null, histogram: null, priorHistogram: null, delta: null };
  const signalSeries = emaSeries(macdSeries, 9);
  const line = macdSeries.at(-1) ?? null;
  const signal = signalSeries.at(-1) ?? null;
  const priorLine = macdSeries.at(-2) ?? null;
  const priorSignal = signalSeries.at(-2) ?? null;
  const histogram = line !== null && signal !== null ? line - signal : null;
  const priorHistogram = priorLine !== null && priorSignal !== null ? priorLine - priorSignal : null;
  return {
    line,
    signal,
    histogram,
    priorHistogram,
    delta: histogram !== null && priorHistogram !== null ? histogram - priorHistogram : null,
  };
}

function emaSeries(values: number[], period: number): Array<number | null> {
  const output: Array<number | null> = Array(values.length).fill(null);
  if (values.length < period) return output;
  const seed = average(values.slice(0, period));
  if (seed === null) return output;
  output[period - 1] = seed;
  const alpha = 2 / (period + 1);
  let current = seed;
  for (let index = period; index < values.length; index += 1) {
    current = values[index] * alpha + current * (1 - alpha);
    output[index] = current;
  }
  return output;
}

function rsi(closes: number[], period: number): number | null {
  if (closes.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  const start = closes.length - period;
  for (let index = start; index < closes.length; index += 1) {
    const change = closes[index] - closes[index - 1];
    if (change >= 0) gains += change;
    else losses -= change;
  }
  if (losses === 0) return gains === 0 ? 50 : 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function atr(bars: SwingBar[], period: number): number | null {
  if (bars.length < period + 1) return null;
  const ranges: number[] = [];
  for (let index = bars.length - period; index < bars.length; index += 1) {
    const previousClose = bars[index - 1].close;
    ranges.push(Math.max(
      bars[index].high - bars[index].low,
      Math.abs(bars[index].high - previousClose),
      Math.abs(bars[index].low - previousClose),
    ));
  }
  return average(ranges);
}

function zScore(values: number[], current: number): number | null {
  if (values.length < 10) return null;
  const mean = average(values);
  const sd = stdev(values);
  return mean !== null && sd !== null && sd > 0 ? (current - mean) / sd : null;
}

function trailingReturn(values: number[], days: number): number | null {
  if (values.length <= days) return null;
  const previous = values[values.length - 1 - days];
  return previous > 0 ? values.at(-1)! / previous - 1 : null;
}

function distancePct(current: number, averageValue: number | null): number | null {
  return averageValue !== null && averageValue > 0 ? percent(current / averageValue - 1) : null;
}

function drawdownPct(current: number, high: number | null): number | null {
  return high !== null && high > 0 ? percent(current / high - 1) : null;
}

function rangeLocation(current: number, low: number | null, high: number | null): number | null {
  return low !== null && high !== null && high > low ? clamp((current - low) / (high - low), 0, 1) : null;
}

function weighted(values: Array<[number, number]>): number {
  const totalWeight = values.reduce((sum, [, weight]) => sum + weight, 0);
  if (totalWeight <= 0) return 50;
  return values.reduce((sum, [value, weight]) => sum + value * weight, 0) / totalWeight;
}

function countTrue(...values: boolean[]): number {
  return values.filter(Boolean).length;
}

function countPresent(...values: unknown[]): number {
  return values.filter((value) => value !== null && value !== undefined && (typeof value !== "number" || Number.isFinite(value))).length;
}

function validBar(bar: SwingBar): boolean {
  return [bar.open, bar.high, bar.low, bar.close].every((value) => Number.isFinite(value) && value > 0) &&
    bar.high >= Math.max(bar.open, bar.close, bar.low) &&
    bar.low <= Math.min(bar.open, bar.close, bar.high);
}

function average(values: number[]): number | null {
  const finiteValues = values.filter(Number.isFinite);
  return finiteValues.length ? finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length : null;
}

function stdev(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = average(values);
  if (mean === null) return null;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(Math.max(0, variance));
}

function min(values: number[]): number | null {
  const finiteValues = values.filter(Number.isFinite);
  return finiteValues.length ? Math.min(...finiteValues) : null;
}

function max(values: number[]): number | null {
  const finiteValues = values.filter(Number.isFinite);
  return finiteValues.length ? Math.max(...finiteValues) : null;
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function percent(value: number | null): number | null {
  return value === null ? null : value * 100;
}

function isPositiveNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value > 0;
}

function clamp(value: number, low = 0, high = 100): number {
  return Math.max(low, Math.min(high, value));
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function fmtPct(value: number | null): string {
  if (value === null) return "n/a";
  return `${value >= 0 ? "+" : ""}${round(value, 1)}%`;
}

function compact(values: Array<string | null | undefined>): string[] {
  return values.filter((value): value is string => Boolean(value));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
