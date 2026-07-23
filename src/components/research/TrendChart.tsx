import { useEffect, useId, useMemo, useState } from "react";
import {
  Area,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ChartFormat, ChartPoint, ChartZone, TrendSeries } from "@/lib/panels/contract";
import { cn } from "@/lib/utils";

import { ZoneLegend } from "./ResearchContext";
import { ZoneEditor, loadZoneOverride } from "./ZoneEditor";

function fmt(value: number | null | undefined, format?: ChartFormat) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  switch (format) {
    case "percent":
      return `${value.toFixed(2)}%`;
    case "bp":
      return `${value.toFixed(0)}bp`;
    case "index":
      return value.toFixed(1);
    default:
      return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
}

const ZONE_FILL: Record<ChartZone["kind"], string> = {
  good: "var(--positive)",
  warn: "var(--warning)",
  bad: "var(--negative)",
};

interface ChartRow {
  x: number;
  iso: string;
  actual?: number;
  stale?: number;
  projection?: number;
  comparison?: number;
  band?: [number, number];
}

function timestamp(value: string): number | null {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Sorts and de-duplicates a point series by date. When the database contains
 * more than one vintage for the same date, the last point supplied wins.
 */
export function normaliseChartPoints(points: ChartPoint[] | undefined): ChartPoint[] {
  const byTime = new Map<number, ChartPoint>();
  for (const point of points ?? []) {
    const x = timestamp(point.t);
    if (x === null || !Number.isFinite(point.v)) continue;
    byTime.set(x, { ...point, t: new Date(x).toISOString() });
  }
  return [...byTime.entries()]
    .sort(([first], [second]) => first - second)
    .map(([, point]) => point);
}

function alignSeries(series: TrendSeries): ChartRow[] {
  const actual = normaliseChartPoints(series.points).filter((point) => !point.stale);
  const stale = normaliseChartPoints(series.points).filter((point) => point.stale);
  const projection = normaliseChartPoints(series.projection);
  const comparison = normaliseChartPoints(series.compare?.points);
  const upper = normaliseChartPoints(series.projectionBand?.upper);
  const lower = normaliseChartPoints(series.projectionBand?.lower);

  const rows = new Map<number, ChartRow>();
  const rowFor = (point: ChartPoint) => {
    const x = timestamp(point.t)!;
    const existing = rows.get(x) ?? { x, iso: new Date(x).toISOString() };
    rows.set(x, existing);
    return existing;
  };

  for (const point of actual) rowFor(point).actual = point.v;

  const lastActual = actual.at(-1);
  if (lastActual && stale.length) rowFor(lastActual).stale = lastActual.v;
  for (const point of stale) rowFor(point).stale = point.v;

  const projectionAnchor = stale.at(-1) ?? lastActual;
  if (projectionAnchor && projection.length && projection[0]?.t !== projectionAnchor.t) {
    rowFor(projectionAnchor).projection = projectionAnchor.v;
  }
  for (const point of projection) rowFor(point).projection = point.v;
  for (const point of comparison) rowFor(point).comparison = point.v;

  const lowerByTime = new Map(
    lower
      .map((point) => [timestamp(point.t), point.v] as const)
      .filter((item): item is readonly [number, number] => item[0] !== null),
  );
  for (const point of upper) {
    const x = timestamp(point.t)!;
    const low = lowerByTime.get(x);
    if (low !== undefined) rowFor(point).band = [Math.min(low, point.v), Math.max(low, point.v)];
  }

  return [...rows.values()].sort((first, second) => first.x - second.x);
}

function finiteValues(rows: ChartRow[]): number[] {
  return rows.flatMap((row) => [
    ...(row.actual === undefined ? [] : [row.actual]),
    ...(row.stale === undefined ? [] : [row.stale]),
    ...(row.projection === undefined ? [] : [row.projection]),
    ...(row.comparison === undefined ? [] : [row.comparison]),
    ...(row.band ?? []),
  ]);
}

function domainFor(values: number[]): [number, number] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const pad = span > 0 ? span * 0.12 : Math.max(Math.abs(max) * 0.05, 0.5);
  return [min - pad, max + pad];
}

function zoneFor(value: number, zones?: ChartZone[]): ChartZone | undefined {
  return zones?.find(
    (zone) =>
      (zone.from === undefined || value >= zone.from) &&
      (zone.to === undefined || value <= zone.to),
  );
}

function ChartTooltip({
  active,
  payload,
  series,
  zones,
}: {
  active?: boolean;
  payload?: Array<{ payload?: ChartRow }>;
  series: TrendSeries;
  zones?: ChartZone[];
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;

  const entries = [
    row.actual === undefined ? null : { label: series.yLabel ?? "Actual", value: row.actual },
    row.stale === undefined ? null : { label: "Carried forward, no new release", value: row.stale },
    row.projection === undefined ? null : { label: "Projection", value: row.projection },
    row.comparison === undefined
      ? null
      : { label: series.compare?.label ?? "Comparison", value: row.comparison },
  ].filter((entry): entry is { label: string; value: number } => entry !== null);

  return (
    <div className="min-w-48 rounded-md border border-border bg-popover px-2.5 py-2 text-[11px] shadow-xl">
      <div className="mb-1.5 font-mono text-[9px] text-muted-foreground">
        {new Date(row.x).toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}
      </div>
      <div className="space-y-1">
        {entries.map((entry) => {
          const zone = zoneFor(entry.value, zones);
          return (
            <div key={entry.label} className="flex items-start justify-between gap-4">
              <div>
                <div>{entry.label}</div>
                {zone?.label && (
                  <div className="text-[9px] text-muted-foreground">{zone.label}</div>
                )}
              </div>
              <div className="font-mono font-medium tabular-nums">
                {fmt(entry.value, series.format)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Time-aligned research chart.
 *
 * Every visual layer uses the same numeric time axis and the same aligned row
 * that feeds the tooltip. Linear segments are intentional: smoothed curves can
 * overshoot real observations and make the plotted path appear inconsistent
 * with the displayed value.
 */
export function TrendChart({
  series,
  height = 140,
  compact = false,
  className,
}: {
  series: TrendSeries;
  height?: number;
  compact?: boolean;
  className?: string;
}) {
  const [zones, setZones] = useState<ChartZone[] | undefined>(series.zones);
  const gradientId = `trend-fill-${useId().replaceAll(":", "")}`;

  useEffect(() => {
    let cancelled = false;
    if (series.overrideKey) {
      loadZoneOverride(series.overrideKey)
        .then((override) => {
          if (!cancelled) setZones(override?.length ? override : series.zones);
        })
        .catch(() => {
          if (!cancelled) setZones(series.zones);
        });
    } else {
      setZones(series.zones);
    }
    return () => {
      cancelled = true;
    };
  }, [series.overrideKey, series.zones]);

  const rows = useMemo(() => alignSeries(series), [series]);
  const values = finiteValues(rows);

  if (rows.length < 2 || values.length < 2) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-md border border-dashed border-border/60 bg-background/20 px-4 text-center text-[11px] text-muted-foreground",
          className,
        )}
        style={{ height }}
      >
        No valid time series is available yet. The panel will populate after the next successful
        source refresh.
      </div>
    );
  }

  const yDomain = domainFor(values);
  const visibleZones = (zones ?? [])
    .map((zone) => ({
      ...zone,
      visibleFrom: Math.max(zone.from ?? yDomain[0], yDomain[0]),
      visibleTo: Math.min(zone.to ?? yDomain[1], yDomain[1]),
    }))
    .filter((zone) => zone.visibleFrom < zone.visibleTo);

  return (
    <div className={cn("relative min-w-0", className)} style={{ height }}>
      <div className="absolute left-1 top-0 z-10 rounded bg-background/80 px-1.5 py-1 backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-2">
          <ZoneLegend zones={zones} compact={compact} />
          {series.compare && (
            <span className="inline-flex items-center gap-1 text-[8px] text-muted-foreground">
              <span className="w-3 border-t border-dashed border-muted-foreground" />
              {series.compare.label}
            </span>
          )}
        </div>
      </div>
      {series.overrideKey && !compact && (
        <div className="absolute right-0 top-0 z-10">
          <ZoneEditor overrideKey={series.overrideKey} defaults={zones ?? []} onChange={setZones} />
        </div>
      )}
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={rows}
          margin={{ top: compact ? 22 : 24, right: 8, bottom: compact ? 0 : 14, left: 0 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
            </linearGradient>
          </defs>

          {visibleZones.map((zone, index) => (
            <ReferenceArea
              key={`${zone.kind}-${zone.visibleFrom}-${zone.visibleTo}-${index}`}
              y1={zone.visibleFrom}
              y2={zone.visibleTo}
              fill={ZONE_FILL[zone.kind]}
              fillOpacity={0.1}
              stroke="none"
            />
          ))}

          <XAxis
            type="number"
            dataKey="x"
            domain={["dataMin", "dataMax"]}
            scale="time"
            hide={compact}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            tickFormatter={(value) =>
              new Date(Number(value)).toLocaleDateString(undefined, {
                month: "short",
                year: "2-digit",
              })
            }
            minTickGap={44}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            hide={compact}
            domain={yDomain}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            tickFormatter={(value) => fmt(Number(value), series.format)}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <Tooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
            content={(props) => (
              <ChartTooltip
                active={props.active}
                payload={props.payload as Array<{ payload?: ChartRow }> | undefined}
                series={series}
                zones={zones}
              />
            )}
          />

          <Area
            type="linear"
            dataKey="band"
            stroke="none"
            fill="var(--primary)"
            fillOpacity={0.1}
            isAnimationActive={false}
            connectNulls={false}
            tooltipType="none"
          />
          <Area
            type="linear"
            dataKey="actual"
            stroke="var(--primary)"
            strokeWidth={1.8}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
            connectNulls={false}
            dot={false}
            activeDot={{ r: 3, fill: "var(--primary)", stroke: "var(--background)" }}
          />
          <Line
            type="linear"
            dataKey="stale"
            stroke="var(--muted-foreground)"
            strokeWidth={1.35}
            strokeDasharray="2 3"
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="projection"
            stroke="var(--primary)"
            strokeWidth={1.5}
            strokeDasharray="5 3"
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="comparison"
            stroke="var(--muted-foreground)"
            strokeWidth={1.2}
            strokeDasharray="4 3"
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Exact-time replacement for the old evenly-spaced SVG sparkline. Statistical
 * zones are calculated from the displayed observations, while the numeric
 * time axis and tooltip remain the same as every other research chart.
 */
export function StatisticalTrendChart({
  points,
  title = "Recent trend",
  height = 140,
  format = "number",
}: {
  points: Array<{ date: string; value: number }>;
  title?: string;
  height?: number;
  format?: ChartFormat;
}) {
  const chartPoints = normaliseChartPoints(
    points.map((point) => ({ t: point.date, v: point.value })),
  );
  const values = chartPoints.map((point) => point.v);
  if (values.length < 2) {
    return (
      <TrendChart series={{ points: chartPoints, yLabel: title, format }} height={height} compact />
    );
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const deviation = Math.sqrt(variance) || Math.max(Math.abs(mean) * 0.01, 0.01);
  return (
    <TrendChart
      series={{
        points: chartPoints,
        yLabel: title,
        format,
        zones: [
          { to: mean - 1.5 * deviation, kind: "bad", label: "Exceptionally low" },
          {
            from: mean - 1.5 * deviation,
            to: mean - 0.6 * deviation,
            kind: "warn",
            label: "Unusually low",
          },
          {
            from: mean - 0.6 * deviation,
            to: mean + 0.6 * deviation,
            kind: "good",
            label: "Near its recent norm",
          },
          {
            from: mean + 0.6 * deviation,
            to: mean + 1.5 * deviation,
            kind: "warn",
            label: "Unusually high",
          },
          { from: mean + 1.5 * deviation, kind: "bad", label: "Exceptionally high" },
        ],
      }}
      height={height}
      compact
    />
  );
}

/**
 * Linear-regression projection helper. Extends a point series `steps` months
 * forward using an OLS slope fit on the latest `window` observations.
 */
export function linearProjection(
  points: { t: string; v: number }[],
  steps: number,
  window = 12,
  stepMs = 30 * 86_400_000,
): { t: string; v: number }[] {
  if (points.length < 3 || steps <= 0) return [];
  const tail = points.slice(-window);
  const n = tail.length;
  const xs = tail.map((_, index) => index);
  const ys = tail.map((point) => point.v);
  const meanX = xs.reduce((sum, value) => sum + value, 0) / n;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / n;
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < n; index += 1) {
    numerator += (xs[index] - meanX) * (ys[index] - meanY);
    denominator += (xs[index] - meanX) ** 2;
  }
  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = meanY - slope * meanX;
  const lastTime = new Date(tail.at(-1)!.t).getTime();
  const output: { t: string; v: number }[] = [
    { t: new Date(lastTime).toISOString(), v: tail.at(-1)!.v },
  ];
  for (let step = 1; step <= steps; step += 1) {
    const x = n - 1 + step;
    output.push({
      t: new Date(lastTime + step * stepMs).toISOString(),
      v: intercept + slope * x,
    });
  }
  return output;
}
