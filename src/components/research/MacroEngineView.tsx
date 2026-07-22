import type { ReactNode } from "react";

import type { EngineTone } from "@/lib/panels/macro-view";
import { cn } from "@/lib/utils";

const TONE_CLASS: Record<EngineTone, string> = {
  positive: "text-[var(--positive)]",
  negative: "text-[var(--negative)]",
  warning: "text-[var(--warning)]",
  neutral: "text-foreground",
  primary: "text-[var(--primary)]",
};

export function EngineKpi({
  label,
  value,
  sub,
  tone = "neutral",
  badge,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: EngineTone;
  badge?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        {badge && (
          <span className="rounded-sm border border-border/70 bg-background/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
            {badge}
          </span>
        )}
      </div>
      <div className={cn("mt-1 text-2xl font-semibold capitalize tabular-nums", TONE_CLASS[tone])}>
        {value}
      </div>
      <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{sub}</div>
    </div>
  );
}

export function ScoreScale({
  value,
  lowLabel,
  highLabel,
}: {
  value: number | null;
  lowLabel: string;
  highLabel: string;
}) {
  const position = value == null ? 50 : Math.max(0, Math.min(100, ((value + 3) / 6) * 100));
  return (
    <div className="rounded border border-border bg-card p-3">
      <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
        <span>{lowLabel}</span>
        <span>Historical z-score range</span>
        <span>{highLabel}</span>
      </div>
      <div className="relative mt-3 h-2 rounded-full bg-gradient-to-r from-[var(--positive)]/70 via-muted to-[var(--negative)]/70">
        <div
          className="absolute top-1/2 h-4 w-px -translate-y-1/2 bg-foreground/40"
          style={{ left: "50%" }}
        />
        {value != null && (
          <div
            className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-[var(--primary)] shadow-[0_0_10px_var(--primary)]"
            style={{ left: `${position}%` }}
            title={`Score ${value.toFixed(2)}`}
          />
        )}
      </div>
      <div className="mt-2 flex justify-between font-mono text-[9px] text-muted-foreground">
        <span>-3</span>
        <span>0</span>
        <span>+3</span>
      </div>
    </div>
  );
}

export function EngineSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded border border-border bg-card p-3", className)}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2 border-b border-border/50 pb-2">
        <div>
          <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-[10px] text-muted-foreground">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export interface ContributionRow {
  key: string;
  label: string;
  family: string;
  zScore: number | null;
  weight: number;
  contribution: number | null;
}

export function ContributionLedger({ rows }: { rows: ContributionRow[] }) {
  const maxContribution = Math.max(0.01, ...rows.map((row) => Math.abs(row.contribution ?? 0)));

  return (
    <div className="space-y-0.5">
      <div className="hidden grid-cols-[minmax(150px,1fr)_70px_70px_minmax(120px,0.8fr)_64px] gap-3 border-b border-border/50 pb-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground md:grid">
        <span>Indicator</span>
        <span className="text-right">z-score</span>
        <span className="text-right">weight</span>
        <span>signed impact</span>
        <span className="text-right">contrib.</span>
      </div>
      {rows.map((row) => {
        const contribution = row.contribution ?? 0;
        const width = `${Math.max(2, (Math.abs(contribution) / maxContribution) * 50)}%`;
        return (
          <div
            key={row.key}
            className="grid gap-1 border-b border-border/40 py-2 text-xs last:border-0 md:grid-cols-[minmax(150px,1fr)_70px_70px_minmax(120px,0.8fr)_64px] md:items-center md:gap-3"
          >
            <div className="min-w-0">
              <div className="truncate">{row.label}</div>
              <div className="font-mono text-[9px] uppercase text-muted-foreground">
                {row.family}
              </div>
            </div>
            <div className="font-mono text-muted-foreground md:text-right">
              {row.zScore?.toFixed(2) ?? "—"}
            </div>
            <div className="font-mono text-muted-foreground md:text-right">
              {(row.weight * 100).toFixed(1)}%
            </div>
            <div className="relative hidden h-2 rounded-full bg-background/60 md:block">
              <div className="absolute left-1/2 top-[-2px] h-3 w-px bg-border" />
              <div
                className={cn(
                  "absolute top-0 h-2 rounded-full",
                  contribution >= 0
                    ? "left-1/2 bg-[var(--negative)]/75"
                    : "right-1/2 bg-[var(--positive)]/75",
                )}
                style={{ width }}
              />
            </div>
            <div
              className={cn(
                "font-mono tabular-nums md:text-right",
                contribution > 0.01
                  ? "text-[var(--negative)]"
                  : contribution < -0.01
                    ? "text-[var(--positive)]"
                    : "text-muted-foreground",
              )}
            >
              {row.contribution == null
                ? "—"
                : `${row.contribution > 0 ? "+" : ""}${row.contribution.toFixed(2)}`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export interface IndicatorViewRow {
  concept: string;
  label: string;
  series: string;
  frequency: string;
  unit?: string | null;
  latest: number | null;
  date: string | null;
  previous?: number | null;
  family?: string;
  zScore?: number | null;
  history: Array<{ date: string; value: number }>;
  observationCount?: number;
}

export function IndicatorGrid({ rows }: { rows: IndicatorViewRow[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {rows.map((row) => {
        const change =
          row.latest != null && row.previous != null ? row.latest - row.previous : null;
        return (
          <article
            key={row.concept}
            className="rounded border border-border/70 bg-background/20 p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                  {row.series} · {row.frequency}
                </div>
                <h3 className="truncate text-sm font-semibold">{row.label}</h3>
              </div>
              {row.family && (
                <span className="shrink-0 rounded-sm border border-border/60 px-1.5 py-0.5 font-mono text-[9px] uppercase text-muted-foreground">
                  {row.family}
                </span>
              )}
            </div>
            <div className="mt-3 flex items-end justify-between gap-3">
              <div>
                <div className="text-2xl font-semibold tabular-nums">
                  {formatNumber(row.latest)}
                </div>
                <div className="font-mono text-[9px] text-muted-foreground">
                  {row.unit ?? "transformed value"} · {row.date ?? "no observation"}
                </div>
              </div>
              <div className="text-right font-mono text-[10px]">
                <div className={changeTone(change)}>
                  {change == null ? "—" : `${change > 0 ? "+" : ""}${formatNumber(change)}`}
                </div>
                <div className="text-muted-foreground">latest change</div>
              </div>
            </div>
            <MiniTrend points={row.history} />
            <div className="mt-2 flex items-center justify-between border-t border-border/40 pt-2 font-mono text-[9px] text-muted-foreground">
              <span>
                {(row.observationCount ?? row.history.length).toLocaleString()} observations
              </span>
              <span>z {row.zScore?.toFixed(2) ?? "—"}</span>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function MiniTrend({ points }: { points: Array<{ date: string; value: number }> }) {
  const data = points.slice(-36).filter((point) => Number.isFinite(point.value));
  if (data.length < 2) {
    return <div className="mt-3 h-14 rounded-sm border border-dashed border-border/50" />;
  }
  const width = 320;
  const height = 54;
  const values = data.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const path = data
    .map((point, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - ((point.value - min) / range) * (height - 6) - 3;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 h-14 w-full" role="img">
      <title>Latest 36 transformed observations</title>
      <line
        x1="0"
        x2={width}
        y1={height - 1}
        y2={height - 1}
        stroke="currentColor"
        strokeOpacity="0.12"
      />
      <path
        d={path}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function ModelNote({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 rounded border border-border/60 bg-card/50 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
      {children}
    </div>
  );
}

function formatNumber(value: number | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function changeTone(change: number | null): string {
  if (change == null || Math.abs(change) < 0.0001) return "text-muted-foreground";
  return change > 0 ? "text-[var(--warning)]" : "text-[var(--primary)]";
}
