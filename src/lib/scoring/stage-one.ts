import type { Bar } from "./series.ts";

export const STAGE_ONE_CALC_VERSION = "score.stage-one.v0.1";

export interface StageOneStructure {
  ohlcAvailable: boolean;
  liquiditySweep: boolean;
  sweepVolumeConfirmed: boolean | null;
  sweepDate: string | null;
  priorSupport: number | null;
  baseLow: number | null;
  breakoutLevel: number | null;
  changeOfCharacter: boolean;
  breakoutDate: string | null;
  firstHigherLow: boolean;
  higherLow: number | null;
  invalidation: number | null;
}

/**
 * Deterministic daily Stage-1 structure detector.
 *
 * A liquidity sweep is only called when the adjusted low undercuts the prior
 * 30-bar support and the same bar rejects back into/near that range. A ChoC
 * then requires a daily close above the pre-sweep lower-high zone. The first
 * higher low must form after that breakout and stay materially above the base
 * low. The returned invalidation is the absolute adjusted base low; execution
 * code should place any stop strictly beneath that reference, not above it.
 */
export function detectStageOneStructure(bars: Bar[]): StageOneStructure {
  const empty: StageOneStructure = {
    ohlcAvailable: false,
    liquiditySweep: false,
    sweepVolumeConfirmed: null,
    sweepDate: null,
    priorSupport: null,
    baseLow: null,
    breakoutLevel: null,
    changeOfCharacter: false,
    breakoutDate: null,
    firstHigherLow: false,
    higherLow: null,
    invalidation: null,
  };
  if (bars.length < 80) return empty;

  const start = Math.max(0, bars.length - 120);
  const recent = bars.slice(start);
  const ohlcAvailable = recent.filter(hasOhlc).length >= Math.min(60, recent.length) * 0.9;
  if (!ohlcAvailable) return empty;

  let sweepIndex = -1;
  let priorSupport: number | null = null;
  let sweepVolumeConfirmed: boolean | null = null;
  const earliestSweep = Math.max(30, recent.length - 55);
  const latestSweep = recent.length - 6;
  for (let index = earliestSweep; index < latestSweep; index += 1) {
    const prior = recent.slice(Math.max(0, index - 30), index);
    const support = Math.min(...prior.map(low));
    const bar = recent[index];
    const barLow = low(bar);
    const barHigh = high(bar);
    const range = barHigh - barLow;
    const swept = barLow < support * 0.995;
    const rejected = range > 0 && bar.close >= barLow + range * 0.55 && bar.close >= support * 0.99;
    if (!swept || !rejected) continue;

    const priorVolumes = prior.flatMap((item) =>
      item.volume !== null && item.volume > 0 ? [item.volume] : [],
    );
    const medianVolume = median(priorVolumes);
    sweepVolumeConfirmed =
      bar.volume !== null && medianVolume !== null ? bar.volume >= medianVolume * 1.2 : null;
    sweepIndex = index;
    priorSupport = support;
  }

  if (sweepIndex < 0) {
    return { ...empty, ohlcAvailable: true };
  }

  const sweep = recent[sweepIndex];
  const preSweep = recent.slice(Math.max(0, sweepIndex - 20), sweepIndex);
  const breakoutLevel = preSweep.length ? Math.max(...preSweep.map(high)) : null;
  const baseWindow = recent.slice(Math.max(0, sweepIndex - 3));
  const baseLow = baseWindow.length ? Math.min(...baseWindow.map(low)) : low(sweep);

  let breakoutIndex = -1;
  if (breakoutLevel !== null) {
    for (let index = sweepIndex + 1; index < recent.length; index += 1) {
      if (recent[index].close > breakoutLevel * 1.005) {
        breakoutIndex = index;
        break;
      }
    }
  }
  const changeOfCharacter = breakoutIndex >= 0;

  let higherLow: number | null = null;
  let firstHigherLow = false;
  if (breakoutIndex >= 0 && recent.length - breakoutIndex >= 4) {
    const pullback = recent.slice(breakoutIndex + 1);
    if (pullback.length >= 3) {
      higherLow = Math.min(...pullback.map(low));
      const lastClose = recent.at(-1)?.close ?? 0;
      firstHigherLow =
        higherLow > baseLow * 1.02 &&
        breakoutLevel !== null &&
        lastClose >= breakoutLevel * 0.98;
    }
  }

  return {
    ohlcAvailable: true,
    liquiditySweep: true,
    sweepVolumeConfirmed,
    sweepDate: sweep.date,
    priorSupport,
    baseLow,
    breakoutLevel,
    changeOfCharacter,
    breakoutDate: breakoutIndex >= 0 ? recent[breakoutIndex].date : null,
    firstHigherLow,
    higherLow,
    invalidation: changeOfCharacter && firstHigherLow ? baseLow : null,
  };
}

function hasOhlc(bar: Bar): boolean {
  return finite(bar.open) !== null && finite(bar.high) !== null && finite(bar.low) !== null;
}

function low(bar: Bar): number {
  return finite(bar.low) ?? bar.close;
}

function high(bar: Bar): number {
  return finite(bar.high) ?? bar.close;
}

function finite(value: number | null | undefined): number | null {
  return value !== null && value !== undefined && Number.isFinite(value) ? value : null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
