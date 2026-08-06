import type { SwingBar } from "./model.ts";
import {
  computeSwingTradeV2 as computeBaseSwingTradeV2,
  type SwingV2Candidate as BaseSwingV2Candidate,
  type SwingV2Context,
  type SwingV2EntryState,
  type SwingV2SetupType,
} from "./model-v2.ts";

export type {
  SwingV2CatalystContext,
  SwingV2Context,
  SwingV2EntryState,
  SwingV2MacroContext,
  SwingV2SetupType,
} from "./model-v2.ts";

export const SWING_V2_MODEL_VERSION = "swing.setup.v2.1-shadow";

export type DisciplineState = "pass" | "warn" | "fail" | "unavailable";
export type WeeklyTrendState = "up" | "down" | "mixed" | "unavailable";

export interface SwingV21RiskPlan {
  hardStop: number | null;
  thesisInvalidation: number | null;
  thesisInvalidationRule: string;
  target: number | null;
  rewardRisk: number | null;
  minimumActionableRewardRisk: number;
  riskPerShare: number | null;
  expectedHoldingSessions: [number, number];
  timeStopSessions: number;
}

export interface SwingV21Discipline {
  averageVolume20: number | null;
  averageNotional20: number | null;
  liquidityState: DisciplineState;
  atrPct: number | null;
  volatilityState: DisciplineState;
  tradeable: boolean;
  weeklyTrend: WeeklyTrendState;
  weeklyMa10: number | null;
  weeklyMa20: number | null;
  weeklyMa40: number | null;
  weeklySupportConfluence: boolean;
  adx14: number | null;
  adxPrior5: number | null;
  adxState: "strong" | "moderate" | "weak" | "unavailable";
  bullishRsiDivergence: boolean;
  bullishMacdDivergence: boolean;
  pullbackVolumeRatio: number | null;
  reversalVolumeExpansion: number | null;
  volumeContraction: boolean;
  volumeExpansion: boolean;
  volumeTurnConfirmed: boolean;
  hammer: boolean;
  bullishEngulfing: boolean;
  liquiditySweep: boolean;
  rejectionTrigger: boolean;
  firstBreakoutRetest: boolean;
  breakoutLevel: number | null;
  breakoutDaysAgo: number | null;
  breakoutVolumeRatio: number | null;
  middleOfRange: boolean;
  confirmationCount: number;
  riskPlan: SwingV21RiskPlan;
}

export interface SwingV2Candidate extends BaseSwingV2Candidate {
  modelVersion: string;
  discipline: SwingV21Discipline;
}

interface WeeklyBar {
  week: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
}

interface BreakoutRetestEvidence {
  firstRetest: boolean;
  breakoutLevel: number | null;
  daysAgo: number | null;
  breakoutVolumeRatio: number | null;
}

export function computeSwingTradeV2(
  barsInput: SwingBar[],
  context: SwingV2Context,
): SwingV2Candidate | null {
  const bars = [...barsInput].filter(validBar).sort((a, b) => a.date.localeCompare(b.date));
  if (bars.length < 45) return null;

  // Long-term quality/valuation are deliberately neutralised for Swing v2.1.
  // Short-horizon repricing can still use changes in expectations through catalyst context.
  const base = computeBaseSwingTradeV2(bars, {
    ...context,
    quality: 0,
    valuation: 0,
  });
  if (!base) return null;

  const discipline = computeDiscipline(bars, base, context.instrumentType ?? "equity");
  const setup = applyDiscipline(base, discipline, context);
  return setup;
}

function computeDiscipline(
  bars: SwingBar[],
  candidate: BaseSwingV2Candidate,
  instrumentType: "equity" | "commodity",
): SwingV21Discipline {
  const latest = bars.at(-1)!;
  const recent20 = bars.slice(-20);
  const volumes20 = recent20
    .map((bar) => finite(bar.volume))
    .filter((value): value is number => value !== null && value > 0);
  const averageVolume20 = average(volumes20);
  const notionals20 = recent20
    .map((bar) => {
      const volume = finite(bar.volume);
      return volume !== null && volume > 0 ? bar.close * volume : null;
    })
    .filter((value): value is number => value !== null && Number.isFinite(value) && value > 0);
  const averageNotional20 = average(notionals20);
  const liquidityState = instrumentType === "commodity"
    ? "unavailable"
    : classifyLiquidity(averageVolume20, averageNotional20);
  const atrPct = candidate.metrics.atrPct;
  const volatilityState = classifyVolatility(atrPct, instrumentType);
  const tradeable = instrumentType === "commodity"
    ? volatilityState !== "fail"
    : liquidityState !== "fail" && liquidityState !== "unavailable" && volatilityState !== "fail";

  const weeklyBars = toWeeklyBars(bars);
  const weeklyCloses = weeklyBars.map((bar) => bar.close);
  const weeklyMa10 = weeklyCloses.length >= 10 ? average(weeklyCloses.slice(-10)) : null;
  const weeklyMa20 = weeklyCloses.length >= 20 ? average(weeklyCloses.slice(-20)) : null;
  const weeklyMa40 = weeklyCloses.length >= 40 ? average(weeklyCloses.slice(-40)) : null;
  const weeklyTrend = classifyWeeklyTrend(latest.close, weeklyMa20, weeklyMa40);
  const weeklySupportConfluence = [weeklyMa20, weeklyMa40]
    .filter((value): value is number => value !== null && value > 0)
    .some((value) => Math.abs(latest.close / value - 1) <= 0.03);

  const adxSeries = computeAdxSeries(bars, 14);
  const adx14 = adxSeries.at(-1) ?? null;
  const adxPrior5 = adxSeries.length > 5 ? adxSeries.at(-6) ?? null : null;
  const adxState = adx14 === null
    ? "unavailable"
    : adx14 >= 25
      ? "strong"
      : adx14 >= 18
        ? "moderate"
        : "weak";

  const bullishRsiDivergence = detectBullishRsiDivergence(bars);
  const bullishMacdDivergence = detectBullishMacdDivergence(bars);
  const volumeSequence = computeVolumeSequence(bars);
  const candle = computeCandleTriggers(bars);
  const breakout = detectFirstBreakoutRetest(bars);

  const nearDynamicSupport = [candidate.metrics.distanceMa20Pct, candidate.metrics.distanceMa50Pct, candidate.metrics.distanceMa200Pct]
    .filter((value): value is number => value !== null)
    .some((distance) => Math.abs(distance) <= 3.5);
  const range63 = candidate.metrics.range63Location;
  const middleOfRange = range63 !== null && range63 >= 0.35 && range63 <= 0.65 && !nearDynamicSupport && !weeklySupportConfluence;

  const confirmationCount = countTrue(
    bullishRsiDivergence,
    bullishMacdDivergence,
    volumeSequence.volumeTurnConfirmed,
    candle.rejectionTrigger,
    breakout.firstRetest,
    weeklySupportConfluence,
  );

  return {
    averageVolume20,
    averageNotional20,
    liquidityState,
    atrPct,
    volatilityState,
    tradeable,
    weeklyTrend,
    weeklyMa10,
    weeklyMa20,
    weeklyMa40,
    weeklySupportConfluence,
    adx14,
    adxPrior5,
    adxState,
    bullishRsiDivergence,
    bullishMacdDivergence,
    pullbackVolumeRatio: volumeSequence.pullbackVolumeRatio,
    reversalVolumeExpansion: volumeSequence.reversalVolumeExpansion,
    volumeContraction: volumeSequence.volumeContraction,
    volumeExpansion: volumeSequence.volumeExpansion,
    volumeTurnConfirmed: volumeSequence.volumeTurnConfirmed,
    hammer: candle.hammer,
    bullishEngulfing: candle.bullishEngulfing,
    liquiditySweep: candle.liquiditySweep,
    rejectionTrigger: candle.rejectionTrigger,
    firstBreakoutRetest: breakout.firstRetest,
    breakoutLevel: breakout.breakoutLevel,
    breakoutDaysAgo: breakout.daysAgo,
    breakoutVolumeRatio: breakout.breakoutVolumeRatio,
    middleOfRange,
    confirmationCount,
    riskPlan: buildRiskPlan(candidate.setup, candidate, breakout),
  };
}

function applyDiscipline(
  base: BaseSwingV2Candidate,
  discipline: SwingV21Discipline,
  context: SwingV2Context,
): SwingV2Candidate {
  let entryQuality = base.entryQuality;
  let rankingScore = base.rankingScore;
  let entryState: SwingV2EntryState = base.entryState;
  const confirmations = [...base.confirmations];
  const reasons = [...base.reasons];
  const risks = [...base.risks];

  const trendStrategy = base.setup === "trend_pullback" || base.setup === "base_breakout_retest";
  const reversalStrategy = ["deep_mean_reversion", "sma200_bounce", "catalyst_repricing", "commodity_macro"].includes(base.setup);

  if (discipline.weeklySupportConfluence) {
    confirmations.push("Daily/weekly support confluence");
    entryQuality += 5;
    rankingScore += 3;
  }
  if (discipline.weeklyTrend === "up" && trendStrategy) {
    confirmations.push("Weekly trend aligned");
    rankingScore += 4;
  }
  if (discipline.weeklyTrend === "down" && trendStrategy) {
    risks.push("Weekly structure is still bearish and conflicts with a long trend/breakout setup.");
    entryQuality -= 8;
    rankingScore -= 7;
  }

  if (discipline.adxState === "strong" && trendStrategy) {
    confirmations.push(`ADX ${fmt(discipline.adx14, 1)} confirms a strong trend regime`);
    rankingScore += 3;
  } else if (discipline.adxState === "weak" && trendStrategy) {
    risks.push("ADX shows weak trend strength; pullback/breakout follow-through may be limited.");
    rankingScore -= 4;
  }
  if (discipline.adxState === "strong" && discipline.weeklyTrend === "down" && reversalStrategy) {
    risks.push("ADX confirms a strong bearish trend, so this remains a higher-risk counter-trend reversal.");
    rankingScore -= 5;
  }

  if (discipline.bullishRsiDivergence) {
    confirmations.push("Bullish RSI divergence");
    entryQuality += 5;
    rankingScore += reversalStrategy ? 6 : 2;
  }
  if (discipline.bullishMacdDivergence) {
    confirmations.push("Bullish MACD divergence");
    entryQuality += 5;
    rankingScore += reversalStrategy ? 6 : 2;
  }
  if (discipline.volumeTurnConfirmed) {
    confirmations.push("Pullback volume dried up, then expanded on reversal");
    entryQuality += 7;
    rankingScore += 6;
  } else {
    if (discipline.volumeContraction) confirmations.push("Pullback volume contracting");
    if (discipline.volumeExpansion) confirmations.push("Reversal volume expanding");
  }
  if (discipline.hammer) confirmations.push("Hammer / lower-wick rejection");
  if (discipline.bullishEngulfing) confirmations.push("Bullish engulfing candle");
  if (discipline.liquiditySweep) confirmations.push("Liquidity sweep and rejection");
  if (discipline.rejectionTrigger) {
    entryQuality += 4;
    rankingScore += 4;
  }
  if (discipline.firstBreakoutRetest && base.setup === "base_breakout_retest") {
    confirmations.push("First retest of breakout level");
    entryQuality += 8;
    rankingScore += 7;
  }

  if (discipline.middleOfRange) {
    risks.push("Price is in the middle of its recent range rather than at a clear structural level.");
    entryQuality -= 12;
    rankingScore -= 9;
  }

  if (discipline.liquidityState === "fail") {
    risks.push("Average trading liquidity is too low for an Actionable swing setup.");
    entryQuality -= 18;
    rankingScore -= 14;
  } else if (discipline.liquidityState === "warn") {
    risks.push("Trading liquidity is only moderate; slippage and slower follow-through deserve caution.");
    entryQuality -= 6;
    rankingScore -= 4;
  }
  if (discipline.volatilityState === "fail") {
    risks.push("ATR is outside the preferred swing range: either too sleepy or too unstable for a clean days-to-weeks setup.");
    entryQuality -= 15;
    rankingScore -= 10;
  } else if (discipline.volatilityState === "warn") {
    risks.push("ATR is near the edge of the preferred swing-trading range.");
    entryQuality -= 4;
    rankingScore -= 2;
  }

  const rr = discipline.riskPlan.rewardRisk;
  if (rr !== null) {
    if (rr >= 3) {
      entryQuality += 5;
      rankingScore += 4;
      reasons.push(`Structural reward/risk is ${rr.toFixed(2)}x.`);
    } else if (rr >= 2) {
      reasons.push(`Structural reward/risk is ${rr.toFixed(2)}x, above the v2.1 Actionable floor.`);
    } else if (rr >= 1.5) {
      risks.push(`Structural reward/risk is only ${rr.toFixed(2)}x; the setup remains Developing until at least 2.0x.`);
      entryQuality -= 5;
      rankingScore -= 4;
    } else {
      risks.push(`Structural reward/risk is only ${rr.toFixed(2)}x and is not attractive enough for entry.`);
      entryQuality -= 14;
      rankingScore -= 10;
    }
  } else {
    risks.push("No clean structural target/stop pair is available, so the trade cannot be Actionable.");
  }

  const eventRisk = context.catalyst.daysToEarnings !== null && context.catalyst.daysToEarnings <= 3;
  const rrPass = rr !== null && rr >= discipline.riskPlan.minimumActionableRewardRisk;
  const disciplinePass = discipline.tradeable && !discipline.middleOfRange && rrPass;

  if (entryState === "actionable" && !disciplinePass) entryState = "developing";
  if (eventRisk && entryState !== "invalidated") entryState = "event_risk";

  return {
    ...base,
    modelVersion: SWING_V2_MODEL_VERSION,
    entryState,
    entryQuality: round(clamp(entryQuality), 1),
    rankingScore: round(clamp(rankingScore), 1),
    reasons: unique(reasons).slice(0, 10),
    confirmations: unique(confirmations).slice(0, 10),
    risks: unique(risks).slice(0, 10),
    discipline,
  };
}

function classifyLiquidity(volume: number | null, notional: number | null): DisciplineState {
  if (volume === null || notional === null) return "unavailable";
  if (volume < 150_000 || notional < 2_000_000) return "fail";
  if (volume < 300_000 || notional < 5_000_000) return "warn";
  return "pass";
}

function classifyVolatility(atrPct: number | null, instrumentType: "equity" | "commodity"): DisciplineState {
  if (atrPct === null) return "unavailable";
  const lowFail = instrumentType === "commodity" ? 0.45 : 0.8;
  const lowWarn = instrumentType === "commodity" ? 0.7 : 1.2;
  const highWarn = instrumentType === "commodity" ? 5.5 : 7;
  const highFail = instrumentType === "commodity" ? 8 : 10;
  if (atrPct < lowFail || atrPct > highFail) return "fail";
  if (atrPct < lowWarn || atrPct > highWarn) return "warn";
  return "pass";
}

function classifyWeeklyTrend(current: number, ma20: number | null, ma40: number | null): WeeklyTrendState {
  if (ma20 === null) return "unavailable";
  if (ma40 === null) return current >= ma20 ? "up" : "down";
  if (current >= ma20 && ma20 >= ma40 * 0.995) return "up";
  if (current <= ma20 && ma20 <= ma40 * 1.005) return "down";
  return "mixed";
}

function buildRiskPlan(
  setup: SwingV2SetupType,
  candidate: BaseSwingV2Candidate,
  breakout: BreakoutRetestEvidence,
): SwingV21RiskPlan {
  const geometry = candidate.geometry;
  const hardStop = geometry?.invalidation ?? null;
  const current = candidate.metrics.current;
  const supportCandidates: number[] = [];
  let rule = "Daily close below the named structural support level, especially on expanding volume.";

  if (setup === "trend_pullback") {
    addSupport(supportCandidates, candidate.metrics.ma20, current);
    addSupport(supportCandidates, candidate.metrics.ma50, current);
    addSupport(supportCandidates, candidate.metrics.low20, current);
    rule = "Daily close below pullback support / the relevant 20-50SMA zone, especially on expanding volume.";
  } else if (setup === "deep_mean_reversion" || setup === "commodity_macro") {
    addSupport(supportCandidates, candidate.metrics.low20, current);
    rule = "Daily close below the reversal low with renewed downside momentum invalidates the bounce thesis.";
  } else if (setup === "sma200_bounce") {
    addSupport(supportCandidates, candidate.metrics.ma200, current);
    addSupport(supportCandidates, candidate.metrics.low20, current);
    rule = "Failure to hold/reclaim the 200SMA area, followed by a daily close below nearby support, invalidates the bounce.";
  } else if (setup === "catalyst_repricing") {
    addSupport(supportCandidates, candidate.metrics.low20, current);
    addSupport(supportCandidates, candidate.metrics.ma20, current);
    rule = "Daily close below the post-catalyst/recovery support while expectations deteriorate invalidates the repricing thesis.";
  } else if (setup === "base_breakout_retest") {
    addSupport(supportCandidates, breakout.breakoutLevel, current);
    addSupport(supportCandidates, candidate.metrics.low20, current);
    rule = "Daily close back inside the old base below the breakout level invalidates the breakout/retest thesis.";
  }

  const thesisInvalidation = supportCandidates.sort((a, b) => b - a)[0] ?? hardStop;
  const riskPerShare = hardStop !== null && hardStop < current ? current - hardStop : null;
  const schedule = holdingSchedule(setup);
  return {
    hardStop,
    thesisInvalidation: thesisInvalidation ?? null,
    thesisInvalidationRule: rule,
    target: geometry?.target ?? null,
    rewardRisk: geometry?.rewardRisk ?? null,
    minimumActionableRewardRisk: 2,
    riskPerShare,
    expectedHoldingSessions: schedule.window,
    timeStopSessions: schedule.timeStop,
  };
}

function holdingSchedule(setup: SwingV2SetupType): { window: [number, number]; timeStop: number } {
  if (setup === "deep_mean_reversion" || setup === "commodity_macro") return { window: [3, 10], timeStop: 12 };
  if (setup === "sma200_bounce") return { window: [5, 15], timeStop: 18 };
  if (setup === "catalyst_repricing") return { window: [5, 20], timeStop: 22 };
  if (setup === "base_breakout_retest") return { window: [4, 15], timeStop: 18 };
  return { window: [5, 15], timeStop: 18 };
}

function computeVolumeSequence(bars: SwingBar[]): {
  pullbackVolumeRatio: number | null;
  reversalVolumeExpansion: number | null;
  volumeContraction: boolean;
  volumeExpansion: boolean;
  volumeTurnConfirmed: boolean;
} {
  if (bars.length < 27) {
    return {
      pullbackVolumeRatio: null,
      reversalVolumeExpansion: null,
      volumeContraction: false,
      volumeExpansion: false,
      volumeTurnConfirmed: false,
    };
  }
  const baseline = averageVolumes(bars.slice(-26, -6));
  const pullback = averageVolumes(bars.slice(-6, -1));
  const latest = finite(bars.at(-1)?.volume);
  const pullbackVolumeRatio = baseline !== null && baseline > 0 && pullback !== null ? pullback / baseline : null;
  const reversalVolumeExpansion = pullback !== null && pullback > 0 && latest !== null ? latest / pullback : null;
  const volumeContraction = pullbackVolumeRatio !== null && pullbackVolumeRatio <= 0.82;
  const volumeExpansion = reversalVolumeExpansion !== null && reversalVolumeExpansion >= 1.25;
  return {
    pullbackVolumeRatio,
    reversalVolumeExpansion,
    volumeContraction,
    volumeExpansion,
    volumeTurnConfirmed: volumeContraction && volumeExpansion,
  };
}

function computeCandleTriggers(bars: SwingBar[]): {
  hammer: boolean;
  bullishEngulfing: boolean;
  liquiditySweep: boolean;
  rejectionTrigger: boolean;
} {
  const latest = bars.at(-1)!;
  const previous = bars.at(-2) ?? latest;
  const body = Math.abs(latest.close - latest.open);
  const range = latest.high - latest.low;
  const lowerWick = Math.min(latest.open, latest.close) - latest.low;
  const upperWick = latest.high - Math.max(latest.open, latest.close);
  const hammer = range > 0 &&
    lowerWick >= Math.max(body * 2, range * 0.35) &&
    lowerWick > upperWick * 1.5 &&
    latest.close >= latest.low + range * 0.65;
  const bullishEngulfing = latest.close > latest.open && previous.close < previous.open &&
    latest.open <= previous.close && latest.close >= previous.open;
  const priorLows = bars.slice(-6, -1).map((bar) => bar.low);
  const priorLow = min(priorLows);
  const liquiditySweep = priorLow !== null && latest.low < priorLow * 0.998 &&
    latest.close > priorLow && range > 0 && latest.close >= latest.low + range * 0.65;
  return {
    hammer,
    bullishEngulfing,
    liquiditySweep,
    rejectionTrigger: hammer || bullishEngulfing || liquiditySweep,
  };
}

function detectFirstBreakoutRetest(bars: SwingBar[]): BreakoutRetestEvidence {
  if (bars.length < 45) return { firstRetest: false, breakoutLevel: null, daysAgo: null, breakoutVolumeRatio: null };
  const start = Math.max(20, bars.length - 35);
  let breakoutIndex = -1;
  let breakoutLevel: number | null = null;
  let breakoutVolumeRatio: number | null = null;
  for (let index = start; index < bars.length - 1; index += 1) {
    const prior = bars.slice(index - 20, index);
    const resistance = max(prior.map((bar) => bar.high));
    if (resistance === null || resistance <= 0) continue;
    const avgVolume = averageVolumes(prior);
    const currentVolume = finite(bars[index].volume);
    const relative = avgVolume !== null && avgVolume > 0 && currentVolume !== null ? currentVolume / avgVolume : null;
    if (bars[index].close > resistance * 1.003 && (relative === null || relative >= 1.15)) {
      breakoutIndex = index;
      breakoutLevel = resistance;
      breakoutVolumeRatio = relative;
    }
  }
  if (breakoutIndex < 0 || breakoutLevel === null) {
    return { firstRetest: false, breakoutLevel: null, daysAgo: null, breakoutVolumeRatio: null };
  }
  const since = bars.slice(breakoutIndex + 1);
  let touches = 0;
  for (const bar of since) {
    if (bar.low <= breakoutLevel * 1.015 && bar.close >= breakoutLevel * 0.99) touches += 1;
  }
  const latest = bars.at(-1)!;
  const currentTouch = latest.low <= breakoutLevel * 1.015 && latest.close >= breakoutLevel * 0.99 && latest.close <= breakoutLevel * 1.04;
  return {
    firstRetest: currentTouch && touches <= 1,
    breakoutLevel,
    daysAgo: bars.length - 1 - breakoutIndex,
    breakoutVolumeRatio,
  };
}

function detectBullishRsiDivergence(bars: SwingBar[]): boolean {
  const lows = divergenceLowPair(bars);
  if (!lows) return false;
  const closes = bars.map((bar) => bar.close);
  const priorRsi = trailingRsiAt(closes, lows.priorIndex, 14);
  const recentRsi = trailingRsiAt(closes, lows.recentIndex, 14);
  if (priorRsi === null || recentRsi === null) return false;
  return lows.recentLow < lows.priorLow * 0.998 && recentRsi >= priorRsi + 3;
}

function detectBullishMacdDivergence(bars: SwingBar[]): boolean {
  const lows = divergenceLowPair(bars);
  if (!lows) return false;
  const closes = bars.map((bar) => bar.close);
  const priorMacd = macdLineAt(closes, lows.priorIndex);
  const recentMacd = macdLineAt(closes, lows.recentIndex);
  if (priorMacd === null || recentMacd === null) return false;
  return lows.recentLow < lows.priorLow * 0.998 && recentMacd > priorMacd;
}

function divergenceLowPair(bars: SwingBar[]): {
  priorIndex: number;
  recentIndex: number;
  priorLow: number;
  recentLow: number;
} | null {
  if (bars.length < 35) return null;
  const priorStart = Math.max(0, bars.length - 32);
  const priorEnd = bars.length - 14;
  const recentStart = bars.length - 13;
  const recentEnd = bars.length - 1;
  const priorIndex = indexOfLowestLow(bars, priorStart, priorEnd);
  const recentIndex = indexOfLowestLow(bars, recentStart, recentEnd);
  if (priorIndex < 0 || recentIndex < 0) return null;
  return {
    priorIndex,
    recentIndex,
    priorLow: bars[priorIndex].low,
    recentLow: bars[recentIndex].low,
  };
}

function indexOfLowestLow(bars: SwingBar[], start: number, endExclusive: number): number {
  let index = -1;
  let low = Infinity;
  for (let cursor = Math.max(0, start); cursor < Math.min(endExclusive, bars.length); cursor += 1) {
    if (bars[cursor].low < low) {
      low = bars[cursor].low;
      index = cursor;
    }
  }
  return index;
}

function trailingRsiAt(closes: number[], index: number, period: number): number | null {
  if (index < period) return null;
  let gains = 0;
  let losses = 0;
  for (let cursor = index - period + 1; cursor <= index; cursor += 1) {
    const change = closes[cursor] - closes[cursor - 1];
    if (change >= 0) gains += change;
    else losses -= change;
  }
  if (losses === 0) return gains === 0 ? 50 : 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function macdLineAt(closes: number[], index: number): number | null {
  if (index < 25) return null;
  const slice = closes.slice(0, index + 1);
  const ema12 = emaLast(slice, 12);
  const ema26 = emaLast(slice, 26);
  return ema12 !== null && ema26 !== null ? ema12 - ema26 : null;
}

function emaLast(values: number[], period: number): number | null {
  if (values.length < period) return null;
  let current = average(values.slice(0, period));
  if (current === null) return null;
  const alpha = 2 / (period + 1);
  for (let index = period; index < values.length; index += 1) {
    current = values[index] * alpha + current * (1 - alpha);
  }
  return current;
}

function computeAdxSeries(bars: SwingBar[], period: number): Array<number | null> {
  const output: Array<number | null> = Array(bars.length).fill(null);
  if (bars.length < period * 2 + 1) return output;
  const tr: number[] = Array(bars.length).fill(0);
  const plusDm: number[] = Array(bars.length).fill(0);
  const minusDm: number[] = Array(bars.length).fill(0);
  for (let index = 1; index < bars.length; index += 1) {
    const upMove = bars[index].high - bars[index - 1].high;
    const downMove = bars[index - 1].low - bars[index].low;
    plusDm[index] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDm[index] = downMove > upMove && downMove > 0 ? downMove : 0;
    tr[index] = Math.max(
      bars[index].high - bars[index].low,
      Math.abs(bars[index].high - bars[index - 1].close),
      Math.abs(bars[index].low - bars[index - 1].close),
    );
  }

  let smoothedTr = sum(tr.slice(1, period + 1));
  let smoothedPlus = sum(plusDm.slice(1, period + 1));
  let smoothedMinus = sum(minusDm.slice(1, period + 1));
  const dx: Array<number | null> = Array(bars.length).fill(null);
  for (let index = period; index < bars.length; index += 1) {
    if (index > period) {
      smoothedTr = smoothedTr - smoothedTr / period + tr[index];
      smoothedPlus = smoothedPlus - smoothedPlus / period + plusDm[index];
      smoothedMinus = smoothedMinus - smoothedMinus / period + minusDm[index];
    }
    if (smoothedTr <= 0) continue;
    const plusDi = 100 * smoothedPlus / smoothedTr;
    const minusDi = 100 * smoothedMinus / smoothedTr;
    const denominator = plusDi + minusDi;
    dx[index] = denominator > 0 ? 100 * Math.abs(plusDi - minusDi) / denominator : 0;
  }

  const firstDx = dx.slice(period, period * 2).filter((value): value is number => value !== null);
  if (firstDx.length < period) return output;
  let adx = average(firstDx);
  if (adx === null) return output;
  output[period * 2 - 1] = adx;
  for (let index = period * 2; index < bars.length; index += 1) {
    const currentDx = dx[index];
    if (currentDx === null) continue;
    adx = (adx * (period - 1) + currentDx) / period;
    output[index] = adx;
  }
  return output;
}

function toWeeklyBars(bars: SwingBar[]): WeeklyBar[] {
  const weeks = new Map<string, WeeklyBar>();
  for (const bar of bars) {
    const week = weekKey(bar.date);
    const existing = weeks.get(week);
    if (!existing) {
      weeks.set(week, {
        week,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: finite(bar.volume),
      });
      continue;
    }
    existing.high = Math.max(existing.high, bar.high);
    existing.low = Math.min(existing.low, bar.low);
    existing.close = bar.close;
    const volume = finite(bar.volume);
    if (volume !== null) existing.volume = (existing.volume ?? 0) + volume;
  }
  return [...weeks.values()].sort((left, right) => left.week.localeCompare(right.week));
}

function weekKey(dateValue: string): string {
  const date = new Date(`${dateValue}T12:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function addSupport(target: number[], value: number | null, current: number): void {
  if (value !== null && Number.isFinite(value) && value > 0 && value < current * 1.005) target.push(value);
}

function averageVolumes(bars: SwingBar[]): number | null {
  return average(
    bars.map((bar) => finite(bar.volume)).filter((value): value is number => value !== null && value > 0),
  );
}

function validBar(bar: SwingBar): boolean {
  return [bar.open, bar.high, bar.low, bar.close].every((value) => Number.isFinite(value) && value > 0) &&
    bar.high >= Math.max(bar.open, bar.close, bar.low) &&
    bar.low <= Math.min(bar.open, bar.close, bar.high);
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function average(values: number[]): number | null {
  const finiteValues = values.filter(Number.isFinite);
  return finiteValues.length ? finiteValues.reduce((total, value) => total + value, 0) / finiteValues.length : null;
}

function min(values: number[]): number | null {
  const finiteValues = values.filter(Number.isFinite);
  return finiteValues.length ? Math.min(...finiteValues) : null;
}

function max(values: number[]): number | null {
  const finiteValues = values.filter(Number.isFinite);
  return finiteValues.length ? Math.max(...finiteValues) : null;
}

function sum(values: number[]): number {
  return values.filter(Number.isFinite).reduce((total, value) => total + value, 0);
}

function countTrue(...values: boolean[]): number {
  return values.filter(Boolean).length;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function clamp(value: number, low = 0, high = 100): number {
  return Math.max(low, Math.min(high, value));
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function fmt(value: number | null, digits: number): string {
  return value === null ? "n/a" : value.toFixed(digits);
}
