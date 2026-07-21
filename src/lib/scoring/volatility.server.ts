import type { Bar } from "./series";
import { returns, stdev, maxOver, clampToScore } from "./series";

export const VOL_CALC_VERSION = "score.volatility.v0.1";

type Point = { id: string; label: string; detail?: string };

export interface VolResult {
  value: number;
  inputs: Record<string, number | string | null>;
  positives: Point[];
  deductions: Point[];
  penalties: Array<{ code: string; points: number; reason: string }>;
}

export function computeVolatility(bars: Bar[]): VolResult {
  const positives: Point[] = [];
  const deductions: Point[] = [];
  if (bars.length < 60) {
    return { value: 50, inputs: { bars: bars.length },
      positives, deductions: [{ id: "vol-insufficient", label: `Only ${bars.length} bars` }],
      penalties: [{ code: "insufficient_history", points: 25, reason: `Only ${bars.length} bars.` }] };
  }
  const r30 = returns(bars.slice(-31));
  const vol30 = stdev(r30) * Math.sqrt(252);
  const rolls: number[] = [];
  const w = 21;
  const year = bars.slice(-252);
  for (let i = w; i < year.length; i++) {
    const win = year.slice(i - w, i);
    const wr: number[] = [];
    for (let j = 1; j < win.length; j++) wr.push(win[j].close / win[j - 1].close - 1);
    rolls.push(stdev(wr) * Math.sqrt(252));
  }
  const sorted = [...rolls].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : vol30;
  const ratio = median > 0 ? vol30 / median : 1;
  const value = clampToScore(-(ratio - 1));

  if (ratio > 1.5) deductions.push({ id: "vol-spike", label: "Realised vol > 1.5× 1y median", detail: `${ratio.toFixed(2)}×` });
  if (ratio < 0.7) positives.push({ id: "vol-calm", label: "Realised vol < 0.7× 1y median", detail: `${ratio.toFixed(2)}×` });

  const hi = maxOver(bars, 252) ?? bars[bars.length - 1].close;
  const dd = bars[bars.length - 1].close / hi - 1;
  if (dd < -0.20) deductions.push({ id: "drawdown", label: "Drawdown > 20% from 52w high", detail: `${(dd * 100).toFixed(1)}%` });

  return {
    value,
    inputs: { vol30_ann: vol30, vol_median_1y: median, ratio, drawdown_from_hi: dd, bars: bars.length },
    positives, deductions, penalties: [],
  };
}