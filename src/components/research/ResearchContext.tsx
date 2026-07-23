import { Info, Sparkles } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { ReactNode } from "react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ChartZone, PanelData } from "@/lib/panels/contract";
import { getResearchNarrative } from "@/lib/narrative/research-narrative.functions";
import { cn } from "@/lib/utils";

const METRIC_HELP: Array<[RegExp, string]> = [
  [
    /confidence|coverage/i,
    "How much of the required data is present, current and reliable. Higher is better.",
  ],
  [
    /z[- ]?score|normal gap|distance from (normal|usual)/i,
    "How far the latest reading sits from its own historical norm. Around zero is normal; larger positive or negative values are more unusual.",
  ],
  [
    /percentile|pctl/i,
    "The share of historical readings that were below the current value. 80% means the current reading was higher than 80% of its history.",
  ],
  [
    /kalman|filtered trend|latent/i,
    "A noise-reduced estimate of the underlying direction. It helps avoid overreacting to one volatile release.",
  ],
  [
    /breadth/i,
    "How widely the signal is spread across the underlying indicators, rather than being driven by one item.",
  ],
  [/pressure/i, "A combined reading of how strong and widespread the current pressure is."],
  [
    /contribution|effect/i,
    "How much this item moves the combined score after its direction and importance are taken into account.",
  ],
  [/weight/i, "The maximum influence this item is allowed to have on the combined result."],
  [
    /regime|zone/i,
    "A plain-language classification of the current environment based on the displayed inputs.",
  ],
  [/fresh/i, "How recently the source released or refreshed this observation."],
  [/yoy|year.on.year/i, "Change compared with the same period one year earlier."],
  [/mom|month.on.month/i, "Change compared with the immediately preceding month."],
  [
    /annual/i,
    "The recent pace expressed as an equivalent yearly rate, which makes short periods easier to compare.",
  ],
  [/slope|direction/i, "The estimated direction and speed of the underlying trend."],
  [/acceleration/i, "Whether the trend is gaining speed or losing momentum."],
];

export function explanationFor(label: string, fallback?: string): string {
  return (
    fallback ??
    METRIC_HELP.find(([pattern]) => pattern.test(label))?.[1] ??
    "Hover help for this figure. Its source date, confidence and calculation are shown elsewhere on the page."
  );
}

export function InfoTip({
  label,
  explanation,
  children,
  side = "top",
}: {
  label: string;
  explanation?: string;
  children?: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-help items-center gap-1">
            {children ?? label}
            <Info className="h-3 w-3 shrink-0 text-muted-foreground/70" aria-hidden="true" />
          </span>
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-xs">
          <div className="text-xs font-medium">{label}</div>
          <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {explanationFor(label, explanation)}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function ResearchNarrative({
  summary,
  detail,
  watch,
  asOf,
  confidence,
  compact = false,
  enableAi = true,
}: {
  summary: string;
  detail?: string;
  watch?: string[];
  asOf?: string | null;
  confidence?: number | null;
  compact?: boolean;
  enableAi?: boolean;
}) {
  const generateNarrative = useServerFn(getResearchNarrative);
  const fallback = {
    summary,
    detail,
    watch: (watch ?? []).slice(0, 4),
    source: "fallback" as const,
  };
  const narrative = useQuery({
    queryKey: ["research-narrative", summary, detail ?? "", ...(watch ?? []).slice(0, 4)],
    queryFn: () => generateNarrative({ data: { summary, detail, watch } }),
    enabled: enableAi,
    staleTime: 30 * 60 * 1000,
    retry: false,
    placeholderData: fallback,
  });
  const content = narrative.data ?? fallback;
  return (
    <section
      className={cn(
        "rounded border border-[var(--primary)]/30 bg-[var(--primary)]/5",
        compact ? "p-2" : "p-3",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">
          <Sparkles className="h-3 w-3" />
          {enableAi
            ? content.source === "ai"
              ? "AI research narrative"
              : narrative.isFetching
                ? "AI narrative updating · live summary ready"
                : "Research narrative · AI fallback"
            : "Research narrative"}
        </div>
        <div className="font-mono text-[9px] text-muted-foreground">
          {confidence != null
            ? `${Math.round(confidence)}% evidence confidence`
            : "evidence-linked"}
          {asOf ? ` · through ${formatDate(asOf)}` : ""}
        </div>
      </div>
      <p className={cn("mt-1.5 leading-relaxed", compact ? "text-[11px]" : "text-sm")}>
        {content.summary}
      </p>
      {content.detail && (
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{content.detail}</p>
      )}
      {content.watch.length > 0 && (
        <ul className="mt-2 grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
          {content.watch.map((item) => (
            <li key={item} className="flex gap-1.5">
              <span className="text-[var(--primary)]">›</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 text-[9px] leading-relaxed text-muted-foreground/75">
        This explanation is rebuilt from the live facts on the page. The original evidence-linked
        summary remains visible while AI is loading or unavailable; neither version changes the
        underlying score.
      </div>
    </section>
  );
}

export function PanelNarrative({ data, compact = false }: { data: PanelData; compact?: boolean }) {
  const latest = data.evidence
    .map((item) => item.asOf)
    .filter(Boolean)
    .sort()
    .at(-1);
  return (
    <ResearchNarrative
      summary={data.narrative?.summary ?? `${data.whatChanged} ${data.whyItMatters}`}
      detail={data.narrative?.detail}
      watch={data.narrative?.watch ?? data.whyBullets}
      asOf={data.narrative?.asOf ?? latest}
      confidence={data.confidence.value}
      compact={compact}
      enableAi={!compact}
    />
  );
}

const ZONE_META = {
  good: { label: "Green · supportive / normal", className: "bg-[var(--positive)]" },
  warn: { label: "Yellow · watch", className: "bg-[var(--warning)]" },
  bad: { label: "Red · risk / unusual", className: "bg-[var(--negative)]" },
} as const;

export function ZoneLegend({ zones, compact = false }: { zones?: ChartZone[]; compact?: boolean }) {
  if (!zones?.length) return null;
  const kinds = (["good", "warn", "bad"] as const).filter((kind) =>
    zones.some((zone) => zone.kind === kind),
  );
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 text-muted-foreground",
        compact ? "text-[8px]" : "text-[9px]",
      )}
    >
      {kinds.map((kind) => (
        <span key={kind} className="inline-flex items-center gap-1">
          <span className={cn("h-1.5 w-1.5 rounded-full", ZONE_META[kind].className)} />
          {ZONE_META[kind].label}
        </span>
      ))}
    </div>
  );
}

export function BandBar({
  value,
  min = 0,
  max = 100,
  format = (item) => `${item.toFixed(0)}%`,
  explanation,
}: {
  value: number;
  min?: number;
  max?: number;
  format?: (value: number) => string;
  explanation?: string;
}) {
  const position =
    ((Math.max(min, Math.min(max, value)) - min) / Math.max(0.0001, max - min)) * 100;
  return (
    <div
      className="group"
      title={
        explanation ??
        `Current value ${format(value)}. Green is stronger, yellow is mixed, red is weaker.`
      }
    >
      <div className="relative h-2 rounded-full bg-gradient-to-r from-[var(--negative)]/70 via-[var(--warning)]/70 to-[var(--positive)]/70">
        <span
          className="absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded bg-foreground shadow"
          style={{ left: `${position}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[8px] text-muted-foreground">
        <span>{format(min)}</span>
        <span className="text-foreground">{format(value)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  );
}

export function StatisticalSparkline({
  points,
  height = 54,
  title = "Recent trend",
}: {
  points: Array<{ date: string; value: number }>;
  height?: number;
  title?: string;
}) {
  const data = points.slice(-48).filter((point) => Number.isFinite(point.value));
  if (data.length < 2)
    return <div className="mt-3 h-14 rounded-sm border border-dashed border-border/50" />;
  const width = 320;
  const values = data.map((point) => point.value);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const sd = Math.sqrt(variance) || 1;
  const min = Math.min(...values, mean - 2 * sd);
  const max = Math.max(...values, mean + 2 * sd);
  const range = max - min || 1;
  const y = (value: number) => height - ((value - min) / range) * (height - 4) - 2;
  const path = data
    .map((point, index) => {
      const x = (index / (data.length - 1)) * width;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y(point.value).toFixed(1)}`;
    })
    .join(" ");
  const band = (high: number, low: number, fill: string, opacity: number) => (
    <rect
      x="0"
      y={Math.min(y(high), y(low))}
      width={width}
      height={Math.abs(y(low) - y(high))}
      fill={fill}
      fillOpacity={opacity}
    />
  );
  return (
    <div
      className="mt-3"
      title={`${title}. Green is close to the recent norm, yellow is unusual, and red is exceptional. Colours describe unusualness, not automatically good or bad.`}
    >
      <svg viewBox={`0 0 ${width} ${height}`} className="h-14 w-full" role="img">
        <title>{title} with historical normality bands</title>
        {band(mean + 0.6 * sd, mean - 0.6 * sd, "var(--positive)", 0.12)}
        {band(mean + 1.5 * sd, mean + 0.6 * sd, "var(--warning)", 0.1)}
        {band(mean - 0.6 * sd, mean - 1.5 * sd, "var(--warning)", 0.1)}
        {band(max, mean + 1.5 * sd, "var(--negative)", 0.08)}
        {band(mean - 1.5 * sd, min, "var(--negative)", 0.08)}
        <path
          d={path}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <ZoneLegend
        zones={[
          { from: mean - 0.6 * sd, to: mean + 0.6 * sd, kind: "good" },
          { from: mean + 0.6 * sd, to: mean + 1.5 * sd, kind: "warn" },
          { from: mean + 1.5 * sd, to: max, kind: "bad" },
        ]}
        compact
      />
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : date.toLocaleDateString();
}
