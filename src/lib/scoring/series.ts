/**
 * Shared numeric helpers used by every deterministic scorer.
 * Pure, no I/O.
 */
export interface Bar { date: string; close: number; volume: number | null }

export function returns(bars: Bar[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1].close, cur = bars[i].close;
    if (prev > 0) r.push(cur / prev - 1);
  }
  return r;
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

export function movingAverage(bars: Bar[], window: number): number | null {
  if (bars.length < window) return null;
  const slice = bars.slice(-window);
  return mean(slice.map((b) => b.close));
}

export function maxOver(bars: Bar[], window: number): number | null {
  if (bars.length === 0) return null;
  const slice = bars.slice(-window);
  return Math.max(...slice.map((b) => b.close));
}

/** Clamp x into [-1,1] then map to 0..100 (50 = neutral). */
export function clampToScore(x: number): number {
  const c = Math.max(-1, Math.min(1, x));
  return Math.round(50 + c * 50);
}