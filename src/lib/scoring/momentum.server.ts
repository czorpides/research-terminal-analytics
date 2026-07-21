import type { Bar } from "./series";
import { clampToScore } from "./series";

export const MOMENTUM_CALC_VERSION = "score.momentum.v0.1";

export interface MomentumResult {
  value: number;
  raw: number;
  inputs: Record<string, number | string | null>;
  positives: Array<{ id: string; label: string; detail?: string }>;
  deductions: Array<{ id: string; label: string; detail?: string }>;
  penalties: Array<{ code: string; points: number; reason: string }>;
}

/** 12-1 month momentum, risk-adjusted by trailing 3m realised vol. */
export function computeMomentum(bars: Bar[]): MomentumResult {
  if (bars.length < 252) {
    return {
      value: 50, raw: 0,
      inputs: { bars: bars.length, needed: 252 },
      positives: [],
      deductions: [{ id: "momo-insufficient", label: `Only ${bars.length} bars — need 252` }],
      penalties: [{ code: "insufficient_history", points: 30, reason: `Only ${bars.length} bars.` }],
    };
  }
  const cur = bars[bars.length - 1].close;
  const back12 = bars[bars.length - 252].close;
  const back1 = bars[bars.length - 21].close;
  const ret12m = cur / back12 - 1;
  const ret1m = cur / back1 - 1;
  const raw = ret12m - ret1m;

  const last63 = bars.slice(-64);
  const rets: number[] = [];
  for (let i = 1; i < last63.length; i++) rets.push(last63[i].close / last63[i - 1].close - 1);
  const mean = rets.reduce((s, x) => s + x, 0) / rets.length;
  const v = rets.reduce((s, x) => s + (x - mean) ** 2, 0) / (rets.length - 1);
  const vol = Math.sqrt(v) * Math.sqrt(252);
  const adj = vol > 0 ? raw / vol : raw;

  const positives = [], deductions = [];
  if (raw > 0.15) positives.push({ id: "momo-strong", label: "12-1 momentum > +15%", detail: `${(raw * 100).toFixed(1)}%` });
  if (raw < -0.15) deductions.push({ id: "momo-weak", label: "12-1 momentum < -15%", detail: `${(raw * 100).toFixed(1)}%` });
  if (vol > 0.6) deductions.push({ id: "momo-highvol", label: "Realised vol > 60%", detail: `${(vol * 100).toFixed(0)}%` });

  return {
    value: clampToScore(adj), raw,
    inputs: { bars: bars.length, cur, ret12m, ret1m, raw12_1: raw, vol_ann: vol, adjusted: adj },
    positives, deductions, penalties: [],
  };
}