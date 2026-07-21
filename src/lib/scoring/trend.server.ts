import type { Bar } from "./series";
import { movingAverage, maxOver, clampToScore } from "./series";

export const TREND_CALC_VERSION = "score.trend.v0.1";

export interface TrendResult {
  value: number;
  inputs: Record<string, number | string | null>;
  positives: Array<{ id: string; label: string; detail?: string }>;
  deductions: Array<{ id: string; label: string; detail?: string }>;
  penalties: Array<{ code: string; points: number; reason: string }>;
}

export function computeTrend(bars: Bar[]): TrendResult {
  const positives = [], deductions = [];
  if (bars.length < 60) {
    return {
      value: 50, inputs: { bars: bars.length, needed: 200 },
      positives, deductions: [{ id: "trend-insufficient", label: `Only ${bars.length} bars` }],
      penalties: [{ code: "insufficient_history", points: 30, reason: `Only ${bars.length} bars.` }],
    };
  }
  const cur = bars[bars.length - 1].close;
  const ma50 = movingAverage(bars, 50);
  const ma200 = movingAverage(bars, 200);
  const hi52 = maxOver(bars, 252);

  let score = 50;
  if (ma50 !== null) {
    const up = cur > ma50;
    score += up ? 10 : -10;
    (up ? positives : deductions).push({
      id: up ? "above-ma50" : "below-ma50",
      label: `Price ${up ? "above" : "below"} 50-day MA`,
      detail: `${cur.toFixed(2)} vs ${ma50.toFixed(2)}`,
    });
  }
  if (ma200 !== null) {
    const up = cur > ma200;
    score += up ? 15 : -15;
    (up ? positives : deductions).push({
      id: up ? "above-ma200" : "below-ma200",
      label: `Price ${up ? "above" : "below"} 200-day MA`,
      detail: `${cur.toFixed(2)} vs ${ma200.toFixed(2)}`,
    });
  }
  if (ma50 !== null && ma200 !== null) {
    const golden = ma50 > ma200;
    score += golden ? 10 : -10;
    (golden ? positives : deductions).push({
      id: golden ? "golden" : "death",
      label: golden ? "50-day MA above 200-day MA" : "50-day MA below 200-day MA",
    });
  }
  if (hi52 !== null) {
    const dist = (cur / hi52 - 1) * 100;
    if (dist > -5) positives.push({ id: "near-52w", label: "Within 5% of 52-week high", detail: `${dist.toFixed(1)}%` });
    if (dist < -25) deductions.push({ id: "far-from-52w", label: "> 25% below 52-week high", detail: `${dist.toFixed(1)}%` });
  }

  return {
    value: clampToScore((score - 50) / 50),
    inputs: { cur, ma50, ma200, hi52, bars: bars.length },
    positives, deductions, penalties: [],
  };
}