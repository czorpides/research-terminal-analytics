/**
 * 22 deterministic transformations. Every function is pure. Kalman-based
 * transforms are placeholders here — they are populated from `model_outputs`
 * by the ingestion pipeline, not computed inline. Keeping them in the
 * catalog gives the UI a uniform contract regardless of who produced the
 * values.
 */
import type { Frequency, SeriesPoint, TransformName, TransformSpec } from "./types";

const PERIODS_PER_YEAR: Record<Frequency, number> = {
  daily: 252, weekly: 52, monthly: 12, quarterly: 4, annual: 1,
};

export const SPECS: Record<TransformName, TransformSpec> = {
  level:         { name: "level",         formula: "x_t",                                          unit: "level",           minHistory: 1 },
  mom:           { name: "mom",           formula: "(x_t / x_{t-1} - 1) * 100",                    unit: "pct",             minHistory: 2 },
  wow:           { name: "wow",           formula: "(x_t / x_{t-1} - 1) * 100",                    unit: "pct",             minHistory: 2 },
  qoq:           { name: "qoq",           formula: "(x_t / x_{t-1} - 1) * 100",                    unit: "pct",             minHistory: 2 },
  yoy:           { name: "yoy",           formula: "(x_t / x_{t-P} - 1) * 100  where P = periods/year", unit: "pct",       minHistory: 13, needsFrequency: true },
  chg3m:         { name: "chg3m",         formula: "x_t - x_{t-3}",                                unit: "abs",             minHistory: 4 },
  chg6m:         { name: "chg6m",         formula: "x_t - x_{t-6}",                                unit: "abs",             minHistory: 7 },
  chg3mAnn:      { name: "chg3mAnn",      formula: "((x_t / x_{t-3})^(P/3) - 1) * 100",            unit: "pct_annualised",  minHistory: 4,  needsFrequency: true },
  chg6mAnn:      { name: "chg6mAnn",      formula: "((x_t / x_{t-6})^(P/6) - 1) * 100",            unit: "pct_annualised",  minHistory: 7,  needsFrequency: true },
  chg12m:        { name: "chg12m",        formula: "x_t - x_{t-12}",                               unit: "abs",             minHistory: 13 },
  diffAbs:       { name: "diffAbs",       formula: "x_t - x_{t-1}",                                unit: "abs",             minHistory: 2 },
  diffPct:       { name: "diffPct",       formula: "(x_t - x_{t-1}) / |x_{t-1}| * 100",            unit: "pct",             minHistory: 2 },
  momentum:      { name: "momentum",      formula: "mean(x_{t-2..t})",                             unit: "level",           minHistory: 3 },
  momentum6:     { name: "momentum6",     formula: "mean(x_{t-5..t})",                             unit: "level",           minHistory: 6 },
  acceleration: { name: "acceleration",  formula: "d/dt (mom_t)",                                 unit: "pct",             minHistory: 3 },
  ewma:          { name: "ewma",          formula: "alpha·x_t + (1-alpha)·ewma_{t-1}, alpha=2/(n+1), n=12", unit: "level",  minHistory: 3 },
  rollingStd:    { name: "rollingStd",    formula: "std(x_{t-11..t})",                             unit: "abs",             minHistory: 12 },
  zscoreHistorical:     { name: "zscoreHistorical",     formula: "(x_t - mean(x)) / std(x)",       unit: "zscore",     minHistory: 12 },
  percentileHistorical: { name: "percentileHistorical", formula: "empirical CDF of x over full history", unit: "percentile", minHistory: 12 },
  kalmanLevel:   { name: "kalmanLevel",   formula: "Kalman(local-linear-trend) smoothed level",    unit: "level",           minHistory: 24, computedByKalman: true },
  kalmanSlope:   { name: "kalmanSlope",   formula: "Kalman(local-linear-trend) slope",             unit: "abs",             minHistory: 24, computedByKalman: true },
  kalmanCI:      { name: "kalmanCI",      formula: "±1σ interval around Kalman level",             unit: "abs",             minHistory: 24, computedByKalman: true },
};

function pctChange(y: SeriesPoint[], k: number): SeriesPoint[] {
  return y.map((p, i) => {
    if (i < k) return { date: p.date, value: null };
    const prev = y[i - k].value;
    const cur = p.value;
    if (prev == null || cur == null || prev === 0) return { date: p.date, value: null };
    return { date: p.date, value: (cur / prev - 1) * 100 };
  });
}

function absDiff(y: SeriesPoint[], k: number): SeriesPoint[] {
  return y.map((p, i) => {
    if (i < k) return { date: p.date, value: null };
    const prev = y[i - k].value;
    const cur = p.value;
    if (prev == null || cur == null) return { date: p.date, value: null };
    return { date: p.date, value: cur - prev };
  });
}

function rolling(y: SeriesPoint[], win: number, fn: (xs: number[]) => number): SeriesPoint[] {
  return y.map((p, i) => {
    if (i + 1 < win) return { date: p.date, value: null };
    const window = y.slice(i - win + 1, i + 1).map((q) => q.value);
    if (window.some((v) => v == null)) return { date: p.date, value: null };
    return { date: p.date, value: fn(window as number[]) };
  });
}

function mean(xs: number[]): number { return xs.reduce((s, x) => s + x, 0) / xs.length; }
function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

export function computeOne(
  name: TransformName,
  series: SeriesPoint[],
  frequency: Frequency,
): SeriesPoint[] {
  const spec = SPECS[name];
  if (!spec) return [];
  if (spec.computedByKalman) return []; // populated separately by the analytics service
  if (series.length === 0) return [];
  const P = PERIODS_PER_YEAR[frequency];

  switch (name) {
    case "level":     return series.map((p) => ({ date: p.date, value: p.value }));
    case "mom":
    case "wow":
    case "qoq":
    case "diffPct":   return pctChange(series, 1);
    case "yoy":       return pctChange(series, P);
    case "chg12m":    return absDiff(series, 12);
    case "chg3m":     return absDiff(series, 3);
    case "chg6m":     return absDiff(series, 6);
    case "diffAbs":   return absDiff(series, 1);
    case "chg3mAnn":  return series.map((p, i) => {
      if (i < 3) return { date: p.date, value: null };
      const a = series[i - 3].value, b = p.value;
      if (a == null || b == null || a <= 0) return { date: p.date, value: null };
      return { date: p.date, value: (Math.pow(b / a, P / 3) - 1) * 100 };
    });
    case "chg6mAnn":  return series.map((p, i) => {
      if (i < 6) return { date: p.date, value: null };
      const a = series[i - 6].value, b = p.value;
      if (a == null || b == null || a <= 0) return { date: p.date, value: null };
      return { date: p.date, value: (Math.pow(b / a, P / 6) - 1) * 100 };
    });
    case "momentum":  return rolling(series, 3, mean);
    case "momentum6": return rolling(series, 6, mean);
    case "rollingStd":return rolling(series, 12, std);
    case "acceleration": {
      const mom = pctChange(series, 1);
      return mom.map((p, i) => {
        if (i === 0) return { date: p.date, value: null };
        const cur = p.value, prev = mom[i - 1].value;
        if (cur == null || prev == null) return { date: p.date, value: null };
        return { date: p.date, value: cur - prev };
      });
    }
    case "ewma": {
      const alpha = 2 / (12 + 1);
      let s: number | null = null;
      return series.map((p) => {
        if (p.value == null) return { date: p.date, value: s };
        s = s == null ? p.value : alpha * p.value + (1 - alpha) * s;
        return { date: p.date, value: s };
      });
    }
    case "zscoreHistorical": {
      const vals = series.map((p) => p.value).filter((v): v is number => v != null);
      if (vals.length < 2) return series.map((p) => ({ date: p.date, value: null }));
      const m = mean(vals), s = std(vals);
      return series.map((p) => ({
        date: p.date,
        value: p.value == null || s === 0 ? null : (p.value - m) / s,
      }));
    }
    case "percentileHistorical": {
      const vals = series.map((p) => p.value).filter((v): v is number => v != null).slice().sort((a, b) => a - b);
      if (vals.length === 0) return series.map((p) => ({ date: p.date, value: null }));
      return series.map((p) => {
        if (p.value == null) return { date: p.date, value: null };
        let lo = 0, hi = vals.length;
        while (lo < hi) { const mid = (lo + hi) >>> 1; if (vals[mid] <= p.value!) lo = mid + 1; else hi = mid; }
        return { date: p.date, value: (lo / vals.length) * 100 };
      });
    }
  }
  return [];
}