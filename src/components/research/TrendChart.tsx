import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrendSeries, ChartFormat, ChartZone } from "@/lib/panels/contract";
import { ZoneEditor, loadZoneOverride } from "./ZoneEditor";

function fmt(v: number | null | undefined, f?: ChartFormat) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  switch (f) {
    case "percent": return `${v.toFixed(2)}%`;
    case "bp":      return `${v.toFixed(0)}bp`;
    case "index":   return v.toFixed(1);
    default:        return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
}

const ZONE_FILL: Record<string, string> = {
  good: "var(--positive)",
  warn: "var(--warning)",
  bad:  "var(--negative)",
};
const ZONE_OPACITY = 0.12;

/**
 * Compact trend chart with optional coloured "goldilocks / warn / danger"
 * zones and a dotted projection tail. Rendered inline in research panels.
 */
export function TrendChart({
  series,
  height = 120,
  compact = false,
}: {
  series: TrendSeries;
  height?: number;
  compact?: boolean;
}) {
  const [zones, setZones] = useState<ChartZone[] | undefined>(series.zones);
  useEffect(() => {
    let cancelled = false;
    if (series.overrideKey) {
      loadZoneOverride(series.overrideKey).then((z) => {
        if (!cancelled && z && z.length > 0) setZones(z);
      }).catch(() => {});
    } else {
      setZones(series.zones);
    }
    return () => { cancelled = true; };
  }, [series.overrideKey, series.zones]);

  const historical = series.points.map((p) => ({ t: p.t, v: p.v, kind: "hist" as const }));
  const projection = (series.projection ?? []).map((p) => ({ t: p.t, v: p.v, kind: "proj" as const }));
  const band = series.projectionBand;
  const bandData = band
    ? band.upper.map((u, i) => ({
        t: u.t,
        upper: u.v,
        lower: band.lower[i]?.v ?? u.v,
        span: [band.lower[i]?.v ?? u.v, u.v] as [number, number],
      }))
    : [];
  const data = [...historical, ...projection];
  if (data.length === 0) return null;

  const values = [
    ...data.map((d) => d.v),
    ...bandData.flatMap((d) => [d.upper, d.lower]),
  ].filter((v) => Number.isFinite(v));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.15 || Math.abs(max) * 0.05 || 1;
  const yDomain: [number, number] = [min - pad, max + pad];

  return (
    <div className="w-full relative" style={{ height }}>
      {series.overrideKey && !compact && (
        <div className="absolute right-0 top-0 z-10">
          <ZoneEditor
            overrideKey={series.overrideKey}
            defaults={zones ?? []}
            onChange={setZones}
          />
        </div>
      )}
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: compact ? 0 : 14, left: 0 }}>
          <defs>
            <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="var(--primary)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0}    />
            </linearGradient>
          </defs>

          {zones?.map((z, i) => (
            <ReferenceArea
              key={`z-${i}`}
              y1={z.from ?? yDomain[0]}
              y2={z.to   ?? yDomain[1]}
              fill={ZONE_FILL[z.kind]}
              fillOpacity={ZONE_OPACITY}
              stroke="none"
              ifOverflow="extendDomain"
            />
          ))}

          <XAxis
            dataKey="t"
            hide={compact}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            tickFormatter={(v) => {
              const d = new Date(v);
              return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
            }}
            minTickGap={40}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            hide={compact}
            domain={yDomain}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            tickFormatter={(v) => fmt(Number(v), series.format)}
            axisLine={false}
            tickLine={false}
            width={44}
          />
          <Tooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 11,
              padding: "6px 8px",
            }}
            labelFormatter={(l) => {
              const d = new Date(l as string);
              return isNaN(d.getTime()) ? String(l) : d.toLocaleDateString();
            }}
            formatter={(val: unknown) => [fmt(Number(val), series.format), series.yLabel ?? "value"]}
          />

          {bandData.length > 0 && (
            <Area
              type="monotone"
              dataKey="span"
              data={bandData}
              stroke="none"
              fill="var(--primary)"
              fillOpacity={0.1}
              isAnimationActive={false}
            />
          )}

          <Area
            type="monotone"
            dataKey="v"
            stroke="var(--primary)"
            strokeWidth={1.5}
            fill="url(#trend-fill)"
            isAnimationActive={false}
            data={historical}
          />
          {projection.length > 0 && (
            <Line
              type="monotone"
              dataKey="v"
              data={projection}
              stroke="var(--primary)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              isAnimationActive={false}
            />
          )}
          {series.compare && (
            <Line
              type="monotone"
              dataKey="v"
              data={series.compare.points}
              stroke="var(--muted-foreground)"
              strokeWidth={1}
              strokeDasharray="2 2"
              dot={false}
              isAnimationActive={false}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Linear-regression projection helper — deterministic, no ML. Extends a
 * point series `steps` months forward using an OLS slope fit on the last
 * `window` observations.
 */
export function linearProjection(
  points: { t: string; v: number }[],
  steps: number,
  window = 12,
  stepMs = 30 * 86400_000,
): { t: string; v: number }[] {
  if (points.length < 3 || steps <= 0) return [];
  const tail = points.slice(-window);
  const n = tail.length;
  const xs = tail.map((_, i) => i);
  const ys = tail.map((p) => p.v);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - meanX) * (ys[i] - meanY); den += (xs[i] - meanX) ** 2; }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;
  const lastT = new Date(tail[tail.length - 1].t).getTime();
  const out: { t: string; v: number }[] = [];
  // include last historical point as the anchor so line is contiguous
  out.push({ t: new Date(lastT).toISOString(), v: tail[tail.length - 1].v });
  for (let s = 1; s <= steps; s++) {
    const x = n - 1 + s;
    out.push({ t: new Date(lastT + s * stepMs).toISOString(), v: intercept + slope * x });
  }
  return out;
}