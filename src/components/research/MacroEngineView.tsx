import type { ReactNode } from "react";

import type { EngineTone } from "@/lib/panels/macro-view";
import { cn } from "@/lib/utils";
import { InfoTip } from "./ResearchContext";
import { Sparkles } from "lucide-react";
import { DashboardPanel } from "./DashboardPanel";
import { StatisticalTrendChart } from "./TrendChart";

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
  explanation,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: EngineTone;
  badge?: string;
  explanation?: string;
}) {
  return (
    <div className="relative h-full overflow-hidden rounded-md border border-border/70 bg-card/70 p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          <InfoTip label={label} explanation={explanation ?? sub} />
        </div>
        {badge && (
          <span className="rounded-sm border border-border/70 bg-background/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
            {badge}
          </span>
        )}
      </div>
      <InfoTip label={`${label}: ${value}`} explanation={explanation ?? sub}>
        <span
          className={cn("mt-1 text-2xl font-semibold capitalize tabular-nums", TONE_CLASS[tone])}
        >
          {value}
        </span>
      </InfoTip>
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
        <InfoTip
          label="Distance from the historical norm"
          explanation="Zero means close to the indicator's own historical norm. A move toward either end is more unusual; the direction labels explain whether that is supportive or risky here."
        />
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
    <DashboardPanel
      title={title}
      description={description}
      eyebrow="Research evidence"
      className={className}
      equalHeight={false}
    >
      {children}
    </DashboardPanel>
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
        <span className="text-right">
          <InfoTip label="Normal gap" />
        </span>
        <span className="text-right">
          <InfoTip label="Weight" />
        </span>
        <span>
          <InfoTip label="Effect on score" />
        </span>
        <span className="text-right">Effect</span>
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
    <div className="grid auto-rows-fr gap-3 md:grid-cols-2 xl:grid-cols-3">
      {rows.map((row) => {
        const change =
          row.latest != null && row.previous != null ? row.latest - row.previous : null;
        const content = (
          <>
            <div className="flex items-end justify-between gap-3">
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
            <StatisticalTrendChart
              points={row.history}
              title={`${row.label} recent trend`}
              height={150}
              format={row.unit?.toLowerCase().includes("percent") ? "percent" : "number"}
            />
            <div className="mt-auto flex items-center justify-between border-t border-border/40 pt-2 font-mono text-[9px] text-muted-foreground">
              <span>
                {(row.observationCount ?? row.history.length).toLocaleString()} observations
              </span>
              <InfoTip
                label={`Distance from usual ${row.zScore?.toFixed(2) ?? "—"}`}
                explanation="Shows how far this reading is from its own history. Around zero is normal; about +2 or −2 is unusually far away."
              />
            </div>
          </>
        );
        return (
          <DashboardPanel
            key={row.concept}
            eyebrow={`${row.series} · ${row.frequency}`}
            title={row.label}
            description={
              row.family
                ? `${row.family} indicator · ${row.unit ?? "transformed value"}`
                : `${row.unit ?? "transformed value"}`
            }
            className="min-h-[270px]"
            bodyClassName="flex flex-col"
          >
            {content}
          </DashboardPanel>
        );
      })}
    </div>
  );
}

export function ModelNote({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 rounded border border-[var(--primary)]/30 bg-[var(--primary)]/5 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
      <div className="mb-1 flex items-center gap-1.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-[var(--primary)]">
        <Sparkles className="h-3 w-3" /> AI research narrative
      </div>
      <div>{children}</div>
      <div className="mt-1 text-[9px] text-muted-foreground/75">
        Plain-English synthesis of the live model output. It explains the score and does not alter
        it.
      </div>
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
