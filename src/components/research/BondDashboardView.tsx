import { ExternalLink, ShieldCheck } from "lucide-react";
import {
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { SectionHeader } from "@/components/layout/SectionHeader";
import { DashboardGrid, DashboardPanel } from "@/components/research/DashboardPanel";
import { InfoTip, ResearchNarrative, ZoneLegend } from "@/components/research/ResearchContext";
import { TrendChart } from "@/components/research/TrendChart";
import { Badge } from "@/components/ui/badge";
import type {
  BondDashboardPayload,
  BondMetric,
  YieldCurvePoint,
} from "@/lib/panels/bonds.functions";
import { cn } from "@/lib/utils";

export function BondDashboardView({ data }: { data: BondDashboardPayload }) {
  const tenYear = metric(data, "DGS10");
  const curve = metric(data, "T10Y2Y");
  const highYield = metric(data, "BAMLH0A0HYM2");

  return (
    <>
      <SectionHeader
        code="MA · US Bonds"
        title="What are rates, the yield curve and credit markets saying?"
        purpose="Treasury yields, real rates, inflation pricing and credit spreads—translated into financing pressure, curve signals, rate drivers and estimated duration effects."
        right={
          <div className="text-right font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
            <div>Source observation {dateLabel(data.asOf)}</div>
            <div>Page checked {dateTime(data.generatedAt)}</div>
          </div>
        }
      />

      <DashboardGrid columns={4} className="mb-3">
        <BondKpi metric={tenYear} label="10-year Treasury" tone={yieldTone(tenYear?.value)} />
        <BondKpi
          metric={curve}
          label="10Y minus 2Y curve"
          valueOverride={curve?.value == null ? "—" : `${curve.value.toFixed(2)}%`}
          tone={curveTone(curve?.value)}
        />
        <BondKpi metric={highYield} label="High-yield spread" tone={creditTone(highYield?.value)} />
        <ReliabilityKpi data={data} />
      </DashboardGrid>

      <div className="mb-3">
        <ResearchNarrative
          summary={data.narrative.summary}
          detail={data.narrative.detail}
          watch={data.narrative.watch}
          asOf={data.asOf}
          confidence={data.reliability}
        />
      </div>

      <DashboardGrid columns={2} className="mb-3">
        <DashboardPanel
          title="Treasury yield curve"
          eyebrow="Curve snapshot"
          description="Current yields compared with one week and one month earlier."
          expandedChildren={<YieldCurveChart curve={data.curve} height={430} />}
        >
          <YieldCurveChart curve={data.curve} />
        </DashboardPanel>
        <DashboardPanel
          title="What drove the 10-year move?"
          eyebrow="Rate decomposition"
          description="Nominal yield move split into real-rate and inflation-pricing contributions."
          expandedChildren={<RateDriver data={data} expanded />}
        >
          <RateDriver data={data} />
        </DashboardPanel>
      </DashboardGrid>

      <DashboardGrid columns={2} className="mb-3">
        <BondChartPanel
          title="2-year and 10-year Treasury yields"
          description="Short policy expectations versus the long-term benchmark."
          series={data.charts.treasury}
        />
        <BondChartPanel
          title="10-year minus 2-year curve"
          description="Negative is inverted; a positive curve is not automatically bullish—the cause of steepening matters."
          series={data.charts.curve}
        />
        <BondChartPanel
          title="10-year real yield"
          description="The inflation-adjusted discount rate faced by long-duration assets."
          series={data.charts.realYield}
        />
        <BondChartPanel
          title="10-year inflation pricing"
          description="Market inflation compensation, with a central anchored range and risks on both sides."
          series={data.charts.breakeven}
        />
        <BondChartPanel
          title="Corporate credit spreads"
          description="High-yield and investment-grade risk premiums over comparable Treasuries."
          series={data.charts.credit}
        />
        <DashboardPanel
          title="Estimated duration effect"
          eyebrow="Sensitivity"
          description="Approximate price effect of the latest weekly yield move."
          expandedChildren={<DurationTable data={data} expanded />}
        >
          <DurationTable data={data} />
        </DashboardPanel>
      </DashboardGrid>

      <DashboardPanel
        title="Coverage and source audit"
        eyebrow="FRED evidence"
        description="The exact series, latest source dates and stored history used above."
        expandedChildren={<SourceAudit data={data} expanded />}
      >
        <SourceAudit data={data} />
      </DashboardPanel>
    </>
  );
}

function BondKpi({
  metric,
  label,
  tone,
  valueOverride,
}: {
  metric: BondMetric | undefined;
  label: string;
  tone: "positive" | "warning" | "negative" | "neutral";
  valueOverride?: string;
}) {
  const value =
    valueOverride ??
    (metric?.value == null
      ? "—"
      : metric.unit === "bp"
        ? `${metric.value.toFixed(0)}bp`
        : `${metric.value.toFixed(2)}%`);
  return (
    <div className="h-full rounded-md border border-border/70 bg-card/70 p-3">
      <InfoTip label={label} explanation={metric?.explanation}>
        <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </InfoTip>
      <div
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          tone === "positive" && "text-[var(--positive)]",
          tone === "warning" && "text-[var(--warning)]",
          tone === "negative" && "text-[var(--negative)]",
        )}
      >
        {value}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-2 text-[10px] text-muted-foreground">
        <span>1d {signedChange(metric?.change1d, metric?.unit)}</span>
        <span>1w {signedChange(metric?.change1w, metric?.unit)}</span>
        <span>1m {signedChange(metric?.change1m, metric?.unit)}</span>
      </div>
    </div>
  );
}

function ReliabilityKpi({ data }: { data: BondDashboardPayload }) {
  return (
    <div className="h-full rounded-md border border-border/70 bg-card/70 p-3">
      <InfoTip
        label="Bonds reliability"
        explanation="70% series coverage and 30% source freshness. It falls when required series are missing or stale."
      >
        <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
          Bonds reliability
        </span>
      </InfoTip>
      <div
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          data.reliability >= 85
            ? "text-[var(--positive)]"
            : data.reliability >= 65
              ? "text-[var(--warning)]"
              : "text-[var(--negative)]",
        )}
      >
        {data.reliability}%
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">
        {data.coverage}% coverage · {data.freshness}% freshness
      </div>
    </div>
  );
}

function YieldCurveChart({ curve, height = 265 }: { curve: YieldCurvePoint[]; height?: number }) {
  const rows = curve.filter((point) => point.current !== null);
  if (rows.length < 2)
    return (
      <div
        className="flex items-center justify-center rounded border border-dashed border-border/60 text-xs text-muted-foreground"
        style={{ height }}
      >
        The fuller curve will populate after the next successful FRED refresh.
      </div>
    );
  const values = rows.flatMap((row) =>
    [row.current, row.oneWeekAgo, row.oneMonthAgo].filter(
      (value): value is number => value !== null,
    ),
  );
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max(0.25, (max - min) * 0.18);
  const domain: [number, number] = [Math.min(0, min - pad), max + pad];
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={rows} margin={{ top: 12, right: 10, bottom: 4, left: 0 }}>
          <ReferenceArea
            y1={domain[0]}
            y2={Math.min(3, domain[1])}
            fill="var(--positive)"
            fillOpacity={0.07}
          />
          {domain[1] > 3 && (
            <ReferenceArea
              y1={3}
              y2={Math.min(5, domain[1])}
              fill="var(--warning)"
              fillOpacity={0.07}
            />
          )}
          {domain[1] > 5 && (
            <ReferenceArea y1={5} y2={domain[1]} fill="var(--negative)" fillOpacity={0.07} />
          )}
          <XAxis
            dataKey="tenor"
            tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={domain}
            width={42}
            tickFormatter={(value) => `${Number(value).toFixed(1)}%`}
            tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CurveTooltip />} />
          <Line
            dataKey="oneMonthAgo"
            name="One month ago"
            type="linear"
            stroke="var(--muted-foreground)"
            strokeWidth={1}
            strokeDasharray="3 3"
            dot={false}
            connectNulls
          />
          <Line
            dataKey="oneWeekAgo"
            name="One week ago"
            type="linear"
            stroke="var(--warning)"
            strokeWidth={1.25}
            dot={false}
            connectNulls
          />
          <Line
            dataKey="current"
            name="Current"
            type="linear"
            stroke="var(--primary)"
            strokeWidth={2}
            dot={{ r: 2.5, fill: "var(--primary)" }}
            activeDot={{ r: 4 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[9px] text-muted-foreground">
        <span className="text-[var(--primary)]">● Current</span>
        <span className="text-[var(--warning)]">● One week ago</span>
        <span>┄ One month ago</span>
      </div>
      <ZoneLegend
        zones={[
          { to: 3, kind: "good", label: "Lower financing pressure" },
          { from: 3, to: 5, kind: "warn", label: "Restrictive range" },
          { from: 5, kind: "bad", label: "High financing pressure" },
        ]}
      />
    </div>
  );
}

function CurveTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: YieldCurvePoint }>;
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="rounded-md border border-border bg-popover p-2 text-[10px] shadow-xl">
      <div className="mb-1 font-medium">{row.tenor} Treasury</div>
      <div>Current: {percent(row.current)}</div>
      <div>One week ago: {percent(row.oneWeekAgo)}</div>
      <div>One month ago: {percent(row.oneMonthAgo)}</div>
    </div>
  );
}

function RateDriver({
  data,
  expanded = false,
}: {
  data: BondDashboardPayload;
  expanded?: boolean;
}) {
  const rows = [
    ["Nominal 10Y move", data.rateDriver.nominalMove1wBp],
    ["Real-yield contribution", data.rateDriver.realYieldMove1wBp],
    ["Inflation-pricing contribution", data.rateDriver.inflationMove1wBp],
    ["Timing / construction residual", data.rateDriver.residual1wBp],
  ] as const;
  const max = Math.max(1, ...rows.map(([, value]) => Math.abs(value ?? 0)));
  return (
    <div className={cn("space-y-3", expanded && "mx-auto max-w-3xl")}>
      <div className="rounded border border-border/60 bg-background/30 p-3">
        <div className="text-sm font-medium">{data.rateDriver.dominant}</div>
        <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
          {data.rateDriver.explanation}
        </p>
      </div>
      {rows.map(([label, value]) => (
        <div key={label}>
          <div className="mb-1 flex items-center justify-between gap-4 text-[10px]">
            <InfoTip label={label}>
              <span>{label}</span>
            </InfoTip>
            <span className="font-mono tabular-nums">{signedBp(value)}</span>
          </div>
          <div className="relative h-2 overflow-hidden rounded bg-muted/50">
            <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
            {value !== null && (
              <div
                className={cn(
                  "absolute inset-y-0",
                  value >= 0
                    ? "left-1/2 bg-[var(--negative)]/70"
                    : "right-1/2 bg-[var(--positive)]/70",
                )}
                style={{ width: `${Math.min(50, (Math.abs(value) / max) * 50)}%` }}
              />
            )}
          </div>
        </div>
      ))}
      <div className="font-mono text-[9px] text-muted-foreground">
        Nominal move ≈ real-yield move + inflation-pricing move + residual
      </div>
    </div>
  );
}

function BondChartPanel({
  title,
  description,
  series,
}: {
  title: string;
  description: string;
  series: BondDashboardPayload["charts"][keyof BondDashboardPayload["charts"]];
}) {
  return (
    <DashboardPanel
      title={title}
      eyebrow="Exact observations"
      description={description}
      expandedChildren={<TrendChart series={series} height={480} />}
    >
      <TrendChart series={series} height={265} />
    </DashboardPanel>
  );
}

function DurationTable({
  data,
  expanded = false,
}: {
  data: BondDashboardPayload;
  expanded?: boolean;
}) {
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[10px]">
          <thead className="font-mono uppercase tracking-wider text-muted-foreground">
            <tr className="border-b border-border/60">
              <th className="pb-2 pr-3">Tenor</th>
              <th className="pb-2 pr-3">Assumed duration</th>
              <th className="pb-2 pr-3">1w yield</th>
              <th className="pb-2 text-right">Est. price</th>
            </tr>
          </thead>
          <tbody>
            {data.duration.map((row) => (
              <tr key={row.tenor} className="border-b border-border/40 last:border-0">
                <td className="py-2 pr-3 font-medium">{row.tenor}</td>
                <td className="py-2 pr-3 font-mono">{row.assumedDuration.toFixed(1)}</td>
                <td className="py-2 pr-3 font-mono">{signedBp(row.weeklyYieldMoveBp)}</td>
                <td
                  className={cn(
                    "py-2 text-right font-mono",
                    (row.estimatedPriceMovePct ?? 0) > 0
                      ? "text-[var(--positive)]"
                      : (row.estimatedPriceMovePct ?? 0) < 0
                        ? "text-[var(--negative)]"
                        : "",
                  )}
                >
                  {signedPercent(row.estimatedPriceMovePct)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p
        className={cn(
          "mt-3 text-[10px] leading-relaxed text-muted-foreground",
          !expanded && "line-clamp-2",
        )}
      >
        Approximation: price change ≈ −modified duration × yield change. These are standard
        tenor-level duration assumptions, not prices for a specific bond. Coupon, maturity,
        convexity, credit and optionality can materially change the realised move.
      </p>
    </div>
  );
}

function SourceAudit({
  data,
  expanded = false,
}: {
  data: BondDashboardPayload;
  expanded?: boolean;
}) {
  const rows = expanded ? data.sourceSeries : data.sourceSeries.slice(0, 8);
  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {rows.map((source) => (
          <div key={source.code} className="rounded border border-border/55 bg-background/30 p-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-[10px] font-medium">{source.label}</div>
                <a
                  href={`https://fred.stlouisfed.org/series/${source.code}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-[9px] text-[var(--primary)] hover:underline"
                >
                  {source.code} <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "h-5 px-1.5 text-[9px]",
                  source.asOf
                    ? "border-[var(--positive)]/40 text-[var(--positive)]"
                    : "border-[var(--warning)]/40 text-[var(--warning)]",
                )}
              >
                {source.asOf ? "live" : "awaiting"}
              </Badge>
            </div>
            <div className="mt-1 text-[9px] text-muted-foreground">
              {dateLabel(source.asOf)} · {source.observations.toLocaleString()} points
            </div>
          </div>
        ))}
      </div>
      {!expanded && data.sourceSeries.length > rows.length && (
        <div className="mt-2 flex items-center gap-1.5 text-[9px] text-muted-foreground">
          <ShieldCheck className="h-3 w-3" />
          Expand to inspect all {data.sourceSeries.length} source series.
        </div>
      )}
    </div>
  );
}

function metric(data: BondDashboardPayload, code: string) {
  return data.metrics.find((item) => item.code === code);
}

function yieldTone(value: number | null | undefined) {
  if (value === null || value === undefined) return "neutral" as const;
  if (value < 3) return "positive" as const;
  if (value < 5) return "warning" as const;
  return "negative" as const;
}

function curveTone(value: number | null | undefined) {
  if (value === null || value === undefined) return "neutral" as const;
  if (value < 0) return "negative" as const;
  if (value < 0.5) return "warning" as const;
  return "positive" as const;
}

function creditTone(value: number | null | undefined) {
  if (value === null || value === undefined) return "neutral" as const;
  if (value < 350) return "positive" as const;
  if (value < 500) return "warning" as const;
  return "negative" as const;
}

function signedChange(value: number | null | undefined, unit: BondMetric["unit"] | undefined) {
  if (value === null || value === undefined) return "—";
  if (unit === "bp") return signedBp(value);
  return signedBp(value * 100);
}

function signedBp(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(0)}bp`;
}

function signedPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function percent(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : `${value.toFixed(2)}%`;
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "Awaiting data";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
