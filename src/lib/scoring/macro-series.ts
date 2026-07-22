import type { MacroPoint } from "@/lib/macro/engine-data.server";

export type SeriesTransform =
  "level" | "change" | "pct_change" | "yoy_pct" | "mean4" | "volatility21";

export function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length);
}

export function transformSeries(points: MacroPoint[], transform: SeriesTransform): MacroPoint[] {
  if (transform === "level") return points.slice();
  if (transform === "change")
    return points
      .slice(1)
      .map((point, index) => ({ date: point.date, value: point.value - points[index].value }));
  if (transform === "pct_change")
    return points
      .slice(1)
      .flatMap((point, index) =>
        points[index].value === 0
          ? []
          : [{ date: point.date, value: 100 * (point.value / points[index].value - 1) }],
      );
  if (transform === "yoy_pct")
    return points
      .slice(12)
      .flatMap((point, index) =>
        points[index].value === 0
          ? []
          : [{ date: point.date, value: 100 * (point.value / points[index].value - 1) }],
      );
  if (transform === "mean4")
    return points.slice(3).map((point, index) => ({
      date: point.date,
      value: mean(points.slice(index, index + 4).map((item) => item.value)),
    }));
  const returns = points
    .slice(1)
    .flatMap((point, index) =>
      points[index].value <= 0 || point.value <= 0
        ? []
        : [{ date: point.date, value: Math.log(point.value / points[index].value) }],
    );
  return returns.slice(20).map((point, index) => ({
    date: point.date,
    value:
      standardDeviation(returns.slice(index, index + 21).map((item) => item.value)) *
      Math.sqrt(252) *
      100,
  }));
}

export function latestZScore(points: MacroPoint[], minHistory = 24, window = 120): number | null {
  if (points.length < minHistory) return null;
  const values = points.slice(-window).map((point) => point.value);
  const deviation = standardDeviation(values);
  if (!Number.isFinite(deviation) || deviation === 0) return null;
  return Math.max(-3, Math.min(3, (values.at(-1)! - mean(values)) / deviation));
}

export function monthlyLast(points: MacroPoint[]): MacroPoint[] {
  const months = new Map<string, MacroPoint>();
  for (const point of points) months.set(point.date.slice(0, 7), point);
  return Array.from(months.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function rollingZSeries(points: MacroPoint[], minHistory = 24, window = 120): MacroPoint[] {
  return points.flatMap((point, index) => {
    const history = points.slice(Math.max(0, index - window + 1), index + 1);
    if (history.length < minHistory) return [];
    const values = history.map((item) => item.value);
    const deviation = standardDeviation(values);
    return deviation === 0
      ? []
      : [
          {
            date: point.date,
            value: Math.max(-3, Math.min(3, (point.value - mean(values)) / deviation)),
          },
        ];
  });
}
