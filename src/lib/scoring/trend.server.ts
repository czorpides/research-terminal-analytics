import type { Bar } from "./series";
import { movingAverage, maxOver } from "./series";

export const TREND_CALC_VERSION = "score.trend.v0.2";

export interface TrendResult {
  value: number;
  inputs: Record<string, number | string | null>;
  positives: Array<{ id: string; label: string; detail?: string }>;
  deductions: Array<{ id: string; label: string; detail?: string }>;
  penalties: Array<{ code: string; points: number; reason: string }>;
}

type Point = { id: string; label: string; detail?: string };
type WeeklyBias = "rising" | "stalled" | "falling" | "unavailable";

/**
 * Recovery / Stage-1 confirmation score built from the daily close + volume
 * history already stored by the equity pipeline.
 *
 * It intentionally does not claim a full OHLC Wyckoff-style signal: an exact
 * liquidity sweep, intraday rejection and absolute base-low stop require
 * adjusted open/high/low persistence in the Opportunity timing record. The
 * close/volume evidence below is nevertheless materially stronger than the old
 * MA50/MA200 snapshot and is safe to use as a confirmation gate.
 */
export function computeTrend(bars: Bar[]): TrendResult {
  const positives: Point[] = [];
  const deductions: Point[] = [];
  if (bars.length < 120) {
    return {
      value: 50,
      inputs: { bars: bars.length, needed: 120 },
      positives,
      deductions: [{ id: "trend-insufficient", label: `Only ${bars.length} bars` }],
      penalties: [
        { code: "insufficient_history", points: 30, reason: `Only ${bars.length} bars.` },
      ],
    };
  }

  const cur = bars[bars.length - 1].close;
  const ma20 = movingAverage(bars, 20);
  const ma50 = movingAverage(bars, 50);
  const ma200 = movingAverage(bars, 200);
  const ma20Prior = movingAverage(bars.slice(0, -10), 20);
  const ma50Prior = movingAverage(bars.slice(0, -10), 50);
  const ma20Slope = slope(ma20, ma20Prior);
  const ma50Slope = slope(ma50, ma50Prior);
  const hi52 = maxOver(bars, 252);
  const weeklyBias = weeklyStructuralBias(bars);

  const priorStructure = bars.slice(-60, -10);
  const recentStructure = bars.slice(-10);
  const priorLowerHigh = priorStructure.length
    ? Math.max(...priorStructure.map((bar) => bar.close))
    : null;
  const recentImpulseHigh = recentStructure.length
    ? Math.max(...recentStructure.map((bar) => bar.close))
    : null;
  const baseLowClose = Math.min(...bars.slice(-60).map((bar) => bar.close));
  const recentPullbackLow = Math.min(...recentStructure.map((bar) => bar.close));
  const changeOfCharacter =
    priorLowerHigh !== null &&
    recentImpulseHigh !== null &&
    recentImpulseHigh > priorLowerHigh * 1.005;
  const firstHigherLow =
    changeOfCharacter &&
    recentPullbackLow > baseLowClose * 1.03 &&
    cur > baseLowClose * 1.08;

  const priceAboveMa50 = ma50 !== null && cur > ma50;
  const ma50Reclaimed = detectMa50Reclaim(bars);
  const ma50Retest = ma50 !== null && priceAboveMa50 && detectRetest(bars, ma50);
  const bullishDivergence = detectRsiBullishDivergence(bars);
  const volumeRatio = upDownVolumeRatio(bars);
  const institutionalFootprint = volumeRatio !== null && volumeRatio >= 1.15;

  let score = 0;
  if (weeklyBias === "rising") score += 15;
  else if (weeklyBias === "stalled") score += 10;
  if (changeOfCharacter) score += 20;
  if (firstHigherLow) score += 20;
  if ((ma20Slope ?? -1) > 0) score += 8;
  if ((ma50Slope ?? -1) >= -0.001) score += 10;
  if (priceAboveMa50) score += 8;
  if (ma50Reclaimed) score += 5;
  if (ma50Retest) score += 5;
  if (bullishDivergence) score += 5;
  if (institutionalFootprint) score += 4;
  score = Math.max(0, Math.min(100, score));

  if (weeklyBias === "rising") {
    positives.push({ id: "weekly-rising", label: "Weekly structural bias is rising" });
  } else if (weeklyBias === "stalled") {
    positives.push({ id: "weekly-stalled", label: "Weekly markdown has stalled" });
  } else if (weeklyBias === "falling") {
    deductions.push({ id: "weekly-falling", label: "Weekly markdown remains in force" });
  }

  if (changeOfCharacter) {
    positives.push({
      id: "change-of-character",
      label: "Daily close structure broke above the recent lower-high zone",
      detail: priorLowerHigh === null ? undefined : `prior structure ${priorLowerHigh.toFixed(2)}`,
    });
  } else {
    deductions.push({
      id: "no-change-of-character",
      label: "No daily close-based change of character yet",
    });
  }

  if (firstHigherLow) {
    positives.push({
      id: "first-higher-low",
      label: "Post-breakout pullback holds a higher low",
      detail: `${recentPullbackLow.toFixed(2)} vs base close ${baseLowClose.toFixed(2)}`,
    });
  }

  if ((ma20Slope ?? -1) > 0) {
    positives.push({ id: "ma20-rising", label: "20-day MA slope has turned positive" });
  } else {
    deductions.push({ id: "ma20-not-rising", label: "20-day MA slope has not turned positive" });
  }
  if ((ma50Slope ?? -1) >= -0.001) {
    positives.push({ id: "ma50-flat", label: "50-day MA is flat or rising" });
  } else {
    deductions.push({ id: "ma50-falling", label: "50-day MA is still falling" });
  }
  if (priceAboveMa50) positives.push({ id: "above-ma50", label: "Price is above the 50-day MA" });
  else deductions.push({ id: "below-ma50", label: "Price remains below the 50-day MA" });
  if (ma50Reclaimed) positives.push({ id: "ma50-reclaim", label: "50-day MA has been reclaimed" });
  if (ma50Retest) positives.push({ id: "ma50-retest", label: "Recent closes retested the 50-day area from above" });
  if (bullishDivergence) positives.push({ id: "rsi-divergence", label: "Daily RSI shows bullish price/momentum divergence" });
  if (institutionalFootprint) {
    positives.push({
      id: "volume-footprint",
      label: "Up-day volume exceeds down-day volume",
      detail: `${volumeRatio?.toFixed(2)}× over the recent window`,
    });
  }

  if (ma200 !== null && cur < ma200) {
    deductions.push({
      id: "below-ma200",
      label: "Price remains below the 200-day MA",
      detail: `${cur.toFixed(2)} vs ${ma200.toFixed(2)}`,
    });
  }
  if (hi52 !== null) {
    const dist = (cur / hi52 - 1) * 100;
    if (dist > -5) {
      deductions.push({
        id: "near-52w-extended",
        label: "Price is already within 5% of the 52-week high",
        detail: `${dist.toFixed(1)}%`,
      });
    }
  }

  return {
    value: Math.round(score),
    inputs: {
      cur,
      ma20,
      ma50,
      ma200,
      ma20_slope_10d: ma20Slope,
      ma50_slope_10d: ma50Slope,
      weekly_bias: weeklyBias,
      prior_lower_high_close: priorLowerHigh,
      recent_impulse_high_close: recentImpulseHigh,
      base_low_close_60d: baseLowClose,
      recent_pullback_low_close: recentPullbackLow,
      change_of_character_close: changeOfCharacter ? 1 : 0,
      first_higher_low_close: firstHigherLow ? 1 : 0,
      above_ma50: priceAboveMa50 ? 1 : 0,
      ma50_reclaimed: ma50Reclaimed ? 1 : 0,
      ma50_retest_close: ma50Retest ? 1 : 0,
      rsi_bullish_divergence: bullishDivergence ? 1 : 0,
      up_down_volume_ratio_20d: volumeRatio,
      hi52,
      bars: bars.length,
    },
    positives,
    deductions,
    penalties: [],
  };
}

function slope(current: number | null, prior: number | null): number | null {
  if (current === null || prior === null || prior === 0) return null;
  return current / prior - 1;
}

function weeklyStructuralBias(bars: Bar[]): WeeklyBias {
  const recent = bars.slice(-260);
  if (recent.length < 120) return "unavailable";
  const weekly: number[] = [];
  for (let start = 0; start < recent.length; start += 5) {
    const chunk = recent.slice(start, start + 5);
    if (chunk.length) weekly.push(chunk[chunk.length - 1].close);
  }
  if (weekly.length < 28) return "unavailable";
  const currentWindow = weekly.slice(-20);
  const priorWindow = weekly.slice(-24, -4);
  if (currentWindow.length < 20 || priorWindow.length < 20) return "unavailable";
  const current = average(currentWindow);
  const prior = average(priorWindow);
  if (prior <= 0) return "unavailable";
  const weeklySlope = current / prior - 1;
  if (weeklySlope > 0.01) return "rising";
  if (weeklySlope > -0.01) return "stalled";
  return "falling";
}

function detectMa50Reclaim(bars: Bar[]): boolean {
  if (bars.length < 70) return false;
  const currentMa = average(bars.slice(-50).map((bar) => bar.close));
  const current = bars[bars.length - 1].close;
  if (current <= currentMa) return false;
  for (let offset = 5; offset <= 20; offset += 1) {
    const end = bars.length - offset;
    if (end < 50) continue;
    const ma = average(bars.slice(end - 50, end).map((bar) => bar.close));
    const close = bars[end - 1].close;
    if (close < ma) return true;
  }
  return false;
}

function detectRetest(bars: Bar[], ma50: number): boolean {
  const recent = bars.slice(-10, -1);
  return recent.some((bar) => Math.abs(bar.close / ma50 - 1) <= 0.025);
}

function detectRsiBullishDivergence(bars: Bar[]): boolean {
  if (bars.length < 45) return false;
  const start = Math.max(14, bars.length - 90);
  const rsi = rsiSeries(bars.map((bar) => bar.close), 14);
  const pivots: number[] = [];
  for (let i = start + 2; i < bars.length - 2; i += 1) {
    const close = bars[i].close;
    if (
      close <= bars[i - 1].close &&
      close <= bars[i - 2].close &&
      close <= bars[i + 1].close &&
      close <= bars[i + 2].close &&
      rsi[i] !== null
    ) {
      pivots.push(i);
    }
  }
  if (pivots.length < 2) return false;
  const second = pivots[pivots.length - 1];
  const first = [...pivots].reverse().find((index) => second - index >= 5);
  if (first === undefined) return false;
  const firstRsi = rsi[first];
  const secondRsi = rsi[second];
  if (firstRsi === null || secondRsi === null) return false;
  return bars[second].close <= bars[first].close * 1.01 && secondRsi >= firstRsi + 4;
}

function rsiSeries(closes: number[], period: number): Array<number | null> {
  const out: Array<number | null> = Array(closes.length).fill(null);
  for (let i = period; i < closes.length; i += 1) {
    let gains = 0;
    let losses = 0;
    for (let j = i - period + 1; j <= i; j += 1) {
      const change = closes[j] - closes[j - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    if (losses === 0) out[i] = 100;
    else {
      const rs = gains / losses;
      out[i] = 100 - 100 / (1 + rs);
    }
  }
  return out;
}

function upDownVolumeRatio(bars: Bar[]): number | null {
  const recent = bars.slice(-21);
  const up: number[] = [];
  const down: number[] = [];
  for (let i = 1; i < recent.length; i += 1) {
    const volume = recent[i].volume;
    if (volume === null || volume <= 0) continue;
    if (recent[i].close > recent[i - 1].close) up.push(volume);
    else if (recent[i].close < recent[i - 1].close) down.push(volume);
  }
  if (!up.length || !down.length) return null;
  const downAverage = average(down);
  return downAverage > 0 ? average(up) / downAverage : null;
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}
