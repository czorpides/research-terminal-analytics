/**
 * Deterministic ensemble nowcaster for macro / price series.
 *
 * Three transparent models — no ML, no external deps:
 *  1. AR(1)         — first-order autoregression fit by OLS on Δy_t.
 *  2. Holt-Winters  — additive double exponential smoothing (level + trend);
 *                     we skip the seasonal term because most macro series here
 *                     arrive seasonally-adjusted from the source.
 *  3. Drift         — random-walk-with-drift baseline (Hyndman's naïve² model).
 *
 * The forecast for each future step is the *mean* of the three model outputs.
 * The confidence band is anchored by inter-model disagreement (standard
 * deviation of the three predictions) widened by √h, so uncertainty grows
 * with the horizon like every reasonable stochastic forecast.
 */

import type { ChartPoint } from "@/lib/panels/contract";

export interface EnsembleForecast {
  projection: ChartPoint[];
  upper: ChartPoint[];
  lower: ChartPoint[];
}

function fitAR1(y: number[]): { phi: number; c: number } {
  const n = y.length - 1;
  if (n < 2) return { phi: 1, c: 0 };
  const x = y.slice(0, -1);
  const z = y.slice(1);
  const mx = mean(x), mz = mean(z);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (x[i] - mx) * (z[i] - mz); den += (x[i] - mx) ** 2; }
  const phi = den === 0 ? 1 : Math.max(-1.5, Math.min(1.5, num / den));
  const c = mz - phi * mx;
  return { phi, c };
}

function forecastAR1(y: number[], h: number): number[] {
  const { phi, c } = fitAR1(y);
  const out: number[] = [];
  let last = y[y.length - 1];
  for (let i = 0; i < h; i++) { last = c + phi * last; out.push(last); }
  return out;
}

/**
 * Additive Holt double exponential smoothing. Grid-searches α and β on the
 * training set to minimise in-sample SSE — good enough for short-horizon
 * nowcasts on monthly macro data.
 */
function forecastHolt(y: number[], h: number): number[] {
  if (y.length < 3) return Array(h).fill(y[y.length - 1] ?? 0);
  const alphas = [0.2, 0.4, 0.6, 0.8];
  const betas  = [0.1, 0.2, 0.4];
  let best = { sse: Infinity, alpha: 0.4, beta: 0.2 };
  for (const alpha of alphas) for (const beta of betas) {
    const sse = holtSSE(y, alpha, beta);
    if (sse < best.sse) best = { sse, alpha, beta };
  }
  const { level, trend } = holtFit(y, best.alpha, best.beta);
  const out: number[] = [];
  for (let i = 1; i <= h; i++) out.push(level + i * trend);
  return out;
}

function holtFit(y: number[], alpha: number, beta: number): { level: number; trend: number } {
  let level = y[0];
  let trend = y[1] - y[0];
  for (let t = 1; t < y.length; t++) {
    const prevLevel = level;
    level = alpha * y[t] + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
  }
  return { level, trend };
}

function holtSSE(y: number[], alpha: number, beta: number): number {
  let level = y[0];
  let trend = y[1] - y[0];
  let sse = 0;
  for (let t = 1; t < y.length; t++) {
    const fc = level + trend;
    sse += (y[t] - fc) ** 2;
    const prevLevel = level;
    level = alpha * y[t] + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
  }
  return sse;
}

/** Random-walk-with-drift: yₜ₊ₕ = yₜ + h · mean(Δy). */
function forecastDrift(y: number[], h: number): number[] {
  if (y.length < 2) return Array(h).fill(y[y.length - 1] ?? 0);
  const diffs: number[] = [];
  for (let i = 1; i < y.length; i++) diffs.push(y[i] - y[i - 1]);
  const drift = mean(diffs);
  const last = y[y.length - 1];
  const out: number[] = [];
  for (let i = 1; i <= h; i++) out.push(last + i * drift);
  return out;
}

function mean(a: number[]): number {
  return a.length === 0 ? 0 : a.reduce((s, v) => s + v, 0) / a.length;
}
function std(a: number[]): number {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
}

/**
 * Ensemble nowcast. `points` must be chronologically ascending. `steps` is the
 * forecast horizon expressed in the same cadence as the input (months for a
 * monthly series, days for a daily one). `stepMs` defines the calendar spacing
 * of the output stamps (defaults to 30 days — matches the historical
 * `linearProjection` behaviour so existing charts keep the same x-axis).
 *
 * Returns three synchronised arrays: the ensemble mean projection plus its
 * upper / lower confidence band (~±1σ where σ scales with disagreement and
 * horizon depth).
 */
export function ensembleForecast(
  points: ChartPoint[],
  steps: number,
  opts: { stepMs?: number; window?: number } = {},
): EnsembleForecast {
  if (points.length < 4 || steps <= 0) return { projection: [], upper: [], lower: [] };
  const window = opts.window ?? Math.min(48, points.length);
  const stepMs = opts.stepMs ?? 30 * 86400_000;
  const tail = points.slice(-window);
  const y = tail.map((p) => p.v);

  const ar   = forecastAR1(y, steps);
  const holt = forecastHolt(y, steps);
  const drift = forecastDrift(y, steps);

  const lastT = new Date(tail[tail.length - 1].t).getTime();
  const projection: ChartPoint[] = [];
  const upper: ChartPoint[] = [];
  const lower: ChartPoint[] = [];

  // Anchor with the last historical value so the projection line is continuous.
  projection.push({ t: new Date(lastT).toISOString(), v: y[y.length - 1] });
  upper.push({ t: new Date(lastT).toISOString(), v: y[y.length - 1] });
  lower.push({ t: new Date(lastT).toISOString(), v: y[y.length - 1] });

  for (let i = 0; i < steps; i++) {
    const preds = [ar[i], holt[i], drift[i]].filter(Number.isFinite);
    const m = mean(preds);
    // Widen with √h — matches classical prediction-interval growth.
    const sigma = std(preds) * Math.sqrt(i + 1);
    const t = new Date(lastT + (i + 1) * stepMs).toISOString();
    projection.push({ t, v: m });
    upper.push({ t, v: m + sigma });
    lower.push({ t, v: m - sigma });
  }

  return { projection, upper, lower };
}