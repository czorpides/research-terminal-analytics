import type { Bar } from "./series.ts";

export const STAGE1_CALC_VERSION = "score.stage1.v0.1";

export type Stage1State = "confirmed" | "basing" | "markdown" | "insufficient";

type Point = { id: string; label: string; detail?: string };

export interface Stage1Result {
  value: number;
  state: Stage1State;
  inputs: Record<string, number | string | null>;
  positives: Point[];
  deductions: Point[];
  penalties: Array<{ code: string; points: number; reason: string }>;
}

/**
 * Deterministic Stage-1 / accumulation structure tracker.
 *
 * Unlike the generic trend score this uses adjusted OHLC, so the structural
 * base low and invalidation reference can be persisted in `scores.inputs`.
 * The level is a thesis-invalidation reference, not an execution-specific
 * stop buffer.
 */
export function computeStage1(bars: Bar[]): Stage1Result {
  const positives: Point[] = [];
  const deductions: Point[] = [];
  if (bars.length < 120) {
    return {
      value: 25,
      state: "insufficient",
      inputs: { bars: bars.length, needed: 120 },
      positives,
      deductions: [{ id: "stage1-insufficient", label: `Only ${bars.length} adjusted OHLC bars` }],
      penalties: [
        {
          code: "insufficient_history",
          points: 30,
          reason: "At least 120 adjusted OHLC bars are required for Stage-1 structure.",
        },
      ],
    };
  }

  const lastIndex = bars.length - 1;
  const current = bars[lastIndex];
  const currentClose = current.close;
  const ma20 = average(bars.slice(-20).map((bar) => bar.close));
  const ma50 = average(bars.slice(-50).map((bar) => bar.close));
  const ma20Prior = average(bars.slice(-30, -10).map((bar) => bar.close));
  const ma50Prior = average(bars.slice(-60, -10).map((bar) => bar.close));
  const ma20Slope = slope(ma20, ma20Prior);
  const ma50Slope = slope(ma50, ma50Prior);
  const weeklyBias = weeklyStructuralBias(bars);

  const preSweepStart = Math.max(0, bars.length - 90);
  // Give a developing accumulation base roughly six trading weeks to retain
  // its capitulation/sweep event while the subsequent ChoC and higher-low form.
  const sweepWindowStart = Math.max(preSweepStart + 30, bars.length - 30);
  const preSweepBars = bars.slice(preSweepStart, sweepWindowStart);
  const priorBaseLow = preSweepBars.length
    ? Math.min(...preSweepBars.map(lowOf))
    : Math.min(...bars.slice(-90).map(lowOf));

  let sweepIndex: number | null = null;
  for (let index = sweepWindowStart; index < bars.length; index += 1) {
    const bar = bars[index];
    const low = lowOf(bar);
    const high = highOf(bar);
    const range = Math.max(high - low, Math.abs(bar.close) * 0.001);
    const closeLocation = (bar.close - low) / range;
    if (low < priorBaseLow * 0.995 && bar.close > priorBaseLow && closeLocation >= 0.55) {
      sweepIndex = index;
      break;
    }
  }

  const baseWindowStart = Math.max(0, bars.length - 65);
  const baseWindow = bars.slice(baseWindowStart);
  let baseIndex = baseWindowStart;
  let baseLow = lowOf(bars[baseIndex]);
  for (let index = baseWindowStart + 1; index < bars.length; index += 1) {
    const low = lowOf(bars[index]);
    if (low < baseLow) {
      baseLow = low;
      baseIndex = index;
    }
  }
  if (sweepIndex !== null) {
    baseIndex = sweepIndex;
    baseLow = lowOf(bars[sweepIndex]);
  }

  const structureEnd = sweepIndex ?? Math.max(baseIndex, bars.length - 12);
  const structureHigh = mostRecentSwingHigh(bars, structureEnd, 50);
  let chochIndex: number | null = null;
  if (structureHigh !== null) {
    for (let index = Math.max(structureEnd + 1, bars.length - 25); index < bars.length; index += 1) {
      if (bars[index].close > structureHigh * 1.005) {
        chochIndex = index;
        break;
      }
    }
  }

  let higherLow: number | null = null;
  let higherLowIndex: number | null = null;
  if (chochIndex !== null && chochIndex < lastIndex - 1) {
    for (let index = chochIndex + 1; index <= lastIndex; index += 1) {
      const low = lowOf(bars[index]);
      if (higherLow === null || low < higherLow) {
        higherLow = low;
        higherLowIndex = index;
      }
    }
  }
  const firstHigherLow =
    higherLow !== null &&
    higherLowIndex !== null &&
    higherLowIndex < lastIndex &&
    higherLow > baseLow * 1.02 &&
    currentClose > higherLow * 1.025;

  const priceAboveMa50 = currentClose > ma50;
  const ma50Reclaimed = detectMa50Reclaim(bars);
  const ma50Retest = priceAboveMa50 && detectMa50Retest(bars, ma50);
  const rsiDivergence = detectRsiBullishDivergence(bars);
  const volumeRatio = upDownVolumeRatio(bars);
  const institutionalVolume = volumeRatio !== null && volumeRatio >= 1.15;
  const sweep = sweepIndex !== null;
  const choch = chochIndex !== null;
  const ma50Constructive = ma50Slope >= -0.0015;

  let score = 0;
  if (weeklyBias === "rising") score += 10;
  else if (weeklyBias === "stalled") score += 6;
  if (sweep) score += 15;
  if (choch) score += 22;
  if (firstHigherLow) score += 20;
  if (ma20Slope > 0) score += 6;
  if (ma50Constructive) score += 8;
  if (ma50Reclaimed) score += 6;
  if (ma50Retest) score += 5;
  if (rsiDivergence) score += 4;
  if (institutionalVolume) score += 4;
  score = clamp(score);

  let state: Stage1State;
  if (choch && firstHigherLow && ma50Constructive && priceAboveMa50) state = "confirmed";
  else if (
    sweep ||
    choch ||
    rsiDivergence ||
    weeklyBias === "stalled" ||
    (ma20Slope > 0 && ma50Slope > -0.004)
  ) {
    state = "basing";
  } else {
    state = "markdown";
  }

  if (sweep) {
    positives.push({
      id: "liquidity-sweep",
      label: "Recent low swept the prior base and closed back above it",
      detail: bars[sweepIndex!].date,
    });
  } else {
    deductions.push({ id: "no-liquidity-sweep", label: "No close-confirmed liquidity sweep in the recent base window" });
  }
  if (choch) {
    positives.push({
      id: "stage1-choch",
      label: "Daily close broke above the most recent swing-high structure",
      detail: structureHigh === null ? undefined : `${structureHigh.toFixed(2)} on ${bars[chochIndex!].date}`,
    });
  } else {
    deductions.push({ id: "no-stage1-choch", label: "No Stage-1 change of character is confirmed" });
  }
  if (firstHigherLow) {
    positives.push({
      id: "stage1-higher-low",
      label: "Post-breakout pullback holds above the accumulation low",
      detail: `${higherLow?.toFixed(2)} on ${bars[higherLowIndex!].date}`,
    });
  } else if (choch) {
    deductions.push({ id: "no-stage1-higher-low", label: "Breakout has not yet produced a confirmed first higher low" });
  }
  if (ma50Reclaimed) positives.push({ id: "stage1-ma50-reclaim", label: "50-day MA has been reclaimed" });
  if (ma50Retest) positives.push({ id: "stage1-ma50-retest", label: "Price has retested the 50-day area from above" });
  if (rsiDivergence) positives.push({ id: "stage1-rsi-divergence", label: "Bullish RSI divergence is present around the base" });
  if (institutionalVolume) {
    positives.push({
      id: "stage1-volume",
      label: "Up-day volume exceeds down-day volume",
      detail: `${volumeRatio?.toFixed(2)}×`,
    });
  }
  if (weeklyBias === "falling") deductions.push({ id: "stage1-weekly-falling", label: "Weekly markdown remains in force" });

  const invalidation = state === "markdown" ? null : baseLow;

  return {
    value: Math.round(score),
    state,
    inputs: {
      bars: bars.length,
      state,
      weekly_bias: weeklyBias,
      prior_base_low: round4(priorBaseLow),
      base_low: round4(baseLow),
      base_low_date: bars[baseIndex].date,
      structural_invalidation: invalidation === null ? null : round4(invalidation),
      liquidity_sweep: sweep ? 1 : 0,
      liquidity_sweep_date: sweepIndex === null ? null : bars[sweepIndex].date,
      choch_level: structureHigh === null ? null : round4(structureHigh),
      choch_confirmed: choch ? 1 : 0,
      choch_date: chochIndex === null ? null : bars[chochIndex].date,
      first_higher_low: firstHigherLow ? 1 : 0,
      higher_low: higherLow === null ? null : round4(higherLow),
      higher_low_date: higherLowIndex === null ? null : bars[higherLowIndex].date,
      ma20: round4(ma20),
      ma50: round4(ma50),
      ma20_slope_10d: round6(ma20Slope),
      ma50_slope_10d: round6(ma50Slope),
      above_ma50: priceAboveMa50 ? 1 : 0,
      ma50_reclaimed: ma50Reclaimed ? 1 : 0,
      ma50_retest: ma50Retest ? 1 : 0,
      rsi_bullish_divergence: rsiDivergence ? 1 : 0,
      up_down_volume_ratio_20d: volumeRatio === null ? null : round4(volumeRatio),
    },
    positives,
    deductions,
    penalties: [],
  };
}

function lowOf(bar: Bar): number {
  return finite(bar.low) ?? bar.close;
}

function highOf(bar: Bar): number {
  return finite(bar.high) ?? bar.close;
}

function mostRecentSwingHigh(bars: Bar[], endExclusive: number, lookback: number): number | null {
  const start = Math.max(2, endExclusive - lookback);
  for (let index = endExclusive - 2; index >= start; index -= 1) {
    const high = highOf(bars[index]);
    if (
      high >= highOf(bars[index - 1]) &&
      high >= highOf(bars[index - 2]) &&
      high >= highOf(bars[index + 1]) &&
      high >= highOf(bars[index + 2])
    ) {
      return high;
    }
  }
  const fallback = bars.slice(Math.max(0, endExclusive - 20), endExclusive);
  return fallback.length ? Math.max(...fallback.map(highOf)) : null;
}

function detectMa50Reclaim(bars: Bar[]): boolean {
  const current = bars[bars.length - 1];
  const currentMa = average(bars.slice(-50).map((bar) => bar.close));
  if (current.close <= currentMa) return false;
  for (let offset = 4; offset <= 20; offset += 1) {
    const end = bars.length - offset;
    if (end < 50) continue;
    const ma = average(bars.slice(end - 50, end).map((bar) => bar.close));
    if (bars[end - 1].close < ma) return true;
  }
  return false;
}

function detectMa50Retest(bars: Bar[], ma50: number): boolean {
  return bars.slice(-12, -1).some((bar) => {
    const low = lowOf(bar);
    return low <= ma50 * 1.025 && bar.close >= ma50 * 0.99;
  });
}

function detectRsiBullishDivergence(bars: Bar[]): boolean {
  if (bars.length < 45) return false;
  const closes = bars.map((bar) => bar.close);
  const rsi = rsiSeries(closes, 14);
  const pivots: number[] = [];
  const start = Math.max(16, bars.length - 90);
  for (let index = start; index < bars.length - 2; index += 1) {
    const low = lowOf(bars[index]);
    if (
      low <= lowOf(bars[index - 1]) &&
      low <= lowOf(bars[index - 2]) &&
      low <= lowOf(bars[index + 1]) &&
      low <= lowOf(bars[index + 2]) &&
      rsi[index] !== null
    ) {
      pivots.push(index);
    }
  }
  if (pivots.length < 2) return false;
  const second = pivots[pivots.length - 1];
  const first = [...pivots].reverse().find((index) => second - index >= 5);
  if (first === undefined) return false;
  const firstRsi = rsi[first];
  const secondRsi = rsi[second];
  if (firstRsi === null || secondRsi === null) return false;
  return lowOf(bars[second]) <= lowOf(bars[first]) * 1.01 && secondRsi >= firstRsi + 4;
}

function rsiSeries(closes: number[], period: number): Array<number | null> {
  const result: Array<number | null> = Array(closes.length).fill(null);
  for (let index = period; index < closes.length; index += 1) {
    let gains = 0;
    let losses = 0;
    for (let cursor = index - period + 1; cursor <= index; cursor += 1) {
      const change = closes[cursor] - closes[cursor - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    result[index] = losses === 0 ? 100 : 100 - 100 / (1 + gains / losses);
  }
  return result;
}

function upDownVolumeRatio(bars: Bar[]): number | null {
  const recent = bars.slice(-21);
  const up: number[] = [];
  const down: number[] = [];
  for (let index = 1; index < recent.length; index += 1) {
    const volume = finite(recent[index].volume);
    if (volume === null || volume <= 0) continue;
    if (recent[index].close > recent[index - 1].close) up.push(volume);
    else if (recent[index].close < recent[index - 1].close) down.push(volume);
  }
  if (!up.length || !down.length) return null;
  const downAverage = average(down);
  return downAverage > 0 ? average(up) / downAverage : null;
}

function weeklyStructuralBias(bars: Bar[]): "rising" | "stalled" | "falling" {
  const weekly: number[] = [];
  for (let start = Math.max(0, bars.length - 260); start < bars.length; start += 5) {
    const chunk = bars.slice(start, Math.min(start + 5, bars.length));
    if (chunk.length) weekly.push(chunk[chunk.length - 1].close);
  }
  if (weekly.length < 24) return "falling";
  const current = average(weekly.slice(-20));
  const prior = average(weekly.slice(-24, -4));
  if (prior <= 0) return "falling";
  const change = current / prior - 1;
  if (change > 0.01) return "rising";
  if (change > -0.01) return "stalled";
  return "falling";
}

function slope(current: number, prior: number): number {
  return prior > 0 ? current / prior - 1 : 0;
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
