import {
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  Minus,
  Plus,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Cpu,
  Cloud,
  Sparkles,
  User,
  CircleDashed,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SOURCE_TIER_META, type SourceTier } from "@/lib/reliability/tiers";
import { TrendChart } from "./TrendChart";
import { InfoTip, PanelNarrative } from "./ResearchContext";
import type {
  PanelData,
  Evidence,
  Metric,
  Point,
  VerifyCheck,
  Catalyst,
} from "@/lib/panels/contract";

function ToneClass(tone?: Metric["tone"]) {
  switch (tone) {
    case "positive":
      return "text-[var(--positive)]";
    case "negative":
      return "text-[var(--negative)]";
    case "warning":
      return "text-[var(--warning)]";
    default:
      return "text-foreground";
  }
}

function FreshnessDot({ state }: { state: Evidence["freshness"] }) {
  const color =
    state === "fresh"
      ? "bg-[var(--positive)]"
      : state === "warn"
        ? "bg-[var(--warning)]"
        : "bg-[var(--negative)]";
  return <span className={cn("inline-block h-1.5 w-1.5 rounded-full", color)} />;
}

function TierBadge({ tier }: { tier: SourceTier }) {
  const t = SOURCE_TIER_META[tier];
  const digit = tier[4]; // "1".."4"
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-wider">
            T{digit}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="font-medium">{t.label}</div>
          <div className="text-xs text-muted-foreground">{t.description}</div>
          <div className="mt-1 text-xs">Weight {t.weight.toFixed(2)}</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function ConfidenceMeter({ value, penalties }: PanelData["confidence"]) {
  const icon =
    value >= 75 ? (
      <ShieldCheck className="h-3.5 w-3.5" />
    ) : value >= 40 ? (
      <ShieldQuestion className="h-3.5 w-3.5" />
    ) : (
      <ShieldAlert className="h-3.5 w-3.5" />
    );
  const tone =
    value >= 75
      ? "text-[var(--positive)]"
      : value >= 40
        ? "text-[var(--warning)]"
        : "text-[var(--negative)]";
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn("flex items-center gap-1.5 font-mono text-xs cursor-help", tone)}>
            {icon}
            <span className="tabular-nums">{value}</span>
            <span className="text-muted-foreground">/ 100</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-sm">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Confidence breakdown
          </div>
          {penalties.length === 0 ? (
            <div className="text-xs">
              No deductions — all inputs are fresh, agreeing and Tier 1.
            </div>
          ) : (
            <ul className="space-y-1 text-xs">
              {penalties.map((p) => (
                <li key={p.code} className="flex gap-2">
                  <span className="font-mono text-[var(--negative)] tabular-nums">−{p.points}</span>
                  <span className="text-muted-foreground">{p.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function EvidenceRow({ e }: { e: Evidence }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/60 py-1.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <FreshnessDot state={e.freshness} />
          <span className="truncate text-xs">{e.label}</span>
          {e.url && (
            <a
              href={e.url}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowUpRight className="h-3 w-3" />
            </a>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <TierBadge tier={e.tier} />
          <span>{e.sourceName}</span>
          <span>·</span>
          <Clock className="h-2.5 w-2.5" />
          <span className="font-mono">{new Date(e.asOf).toLocaleString()}</span>
        </div>
      </div>
      <span
        className={cn(
          "mt-1 shrink-0 text-[10px] font-mono uppercase",
          e.agrees ? "text-[var(--positive)]" : "text-[var(--negative)]",
        )}
      >
        {e.agrees ? "agrees" : "disagrees"}
      </span>
    </div>
  );
}

function PointList({ points, kind }: { points: Point[]; kind: "positive" | "deduction" }) {
  const Icon = kind === "positive" ? Plus : Minus;
  const tone = kind === "positive" ? "text-[var(--positive)]" : "text-[var(--negative)]";
  if (points.length === 0) {
    return <div className="text-xs text-muted-foreground">— none —</div>;
  }
  return (
    <ul className="space-y-1.5">
      {points.map((p) => (
        <li key={p.id} className="flex items-start gap-1.5 text-xs">
          <Icon className={cn("mt-0.5 h-3 w-3 shrink-0", tone)} />
          <div className="min-w-0">
            <div className="leading-snug">{p.label}</div>
            {p.detail && <div className="mt-0.5 text-[11px] text-muted-foreground">{p.detail}</div>}
          </div>
        </li>
      ))}
    </ul>
  );
}

const VERIFIER_META: Record<VerifyCheck["verifier"], { label: string; icon: typeof Cpu }> = {
  algo: { label: "Algorithm", icon: Cpu },
  api: { label: "External API", icon: Cloud },
  ai: { label: "AI check", icon: Sparkles },
  manual: { label: "Manual", icon: User },
};

function StatusIcon({ status }: { status: VerifyCheck["status"] }) {
  const cls = "mt-0.5 h-3.5 w-3.5 shrink-0";
  switch (status) {
    case "pass":
      return <CheckCircle2 className={cn(cls, "text-[var(--positive)]")} />;
    case "fail":
      return <XCircle className={cn(cls, "text-[var(--negative)]")} />;
    case "stale":
      return <AlertTriangle className={cn(cls, "text-[var(--warning)]")} />;
    case "unavailable":
      return <CircleDashed className={cn(cls, "text-muted-foreground")} />;
    case "pending":
    default:
      return <CircleDashed className={cn(cls, "text-muted-foreground")} />;
  }
}

function VerifyRow({ v, dense = false }: { v: VerifyCheck; dense?: boolean }) {
  const meta = VERIFIER_META[v.verifier];
  const VIcon = meta.icon;
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <li className={cn("flex items-start gap-1.5", dense ? "text-[11px]" : "text-sm")}>
            <StatusIcon status={v.status} />
            <span className="min-w-0 flex-1 leading-snug">{v.label}</span>
            <Badge
              variant="outline"
              className="shrink-0 gap-1 px-1.5 py-0 font-mono text-[9px] uppercase tracking-wider"
            >
              <VIcon className="h-2.5 w-2.5" />
              {v.verifier}
            </Badge>
          </li>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-xs">
          <div className="text-xs font-medium">
            {meta.label} · {v.status}
          </div>
          {v.detail && <div className="mt-0.5 text-xs text-muted-foreground">{v.detail}</div>}
          {v.checkedAt && (
            <div className="mt-0.5 text-[10px] font-mono text-muted-foreground">
              checked {new Date(v.checkedAt).toLocaleString()}
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function ResearchPanel({ data }: { data: PanelData }) {
  return (
    <Card className="flex h-[540px] min-w-0 flex-col gap-3 overflow-hidden border-border/70 bg-card/60 p-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold leading-tight tracking-tight text-foreground">
            {data.title}
          </h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{data.purpose}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ConfidenceMeter value={data.confidence.value} penalties={data.confidence.penalties} />
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-[11px]">
                Expand
                <ChevronRight className="h-3 w-3" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[92vh] w-[min(96vw,1180px)] max-w-none overflow-y-auto">
              <DialogHeader className="border-b border-border/60 pb-3 text-left">
                <DialogTitle>{data.title}</DialogTitle>
                <DialogDescription>{data.purpose}</DialogDescription>
              </DialogHeader>
              <div className="mt-4 space-y-5">
                {data.background && <BackgroundBlock bg={data.background} />}
                <Section title="Metrics">
                  <MetricGrid metrics={data.metrics} large />
                </Section>
                <PanelNarrative data={data} />
                {data.chart && (
                  <Section title="Trend">
                    <div className="rounded-md border border-border/60 bg-background/40 p-2">
                      <TrendChart
                        series={{ ...data.chart, overrideKey: data.chart.overrideKey ?? data.id }}
                        height={220}
                      />
                    </div>
                  </Section>
                )}
                <Section title="What changed">
                  <p className="text-sm">{data.whatChanged}</p>
                </Section>
                <Section title="Why it matters">
                  <p className="text-sm">{data.whyItMatters}</p>
                  {data.whyBullets && data.whyBullets.length > 0 && (
                    <ul className="mt-2 space-y-1 text-sm list-disc pl-4 marker:text-[var(--primary)]">
                      {data.whyBullets.map((b, i) => (
                        <li key={i} className="leading-snug">
                          {b}
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
                <Section title={`Evidence (${data.evidence.length})`}>
                  {data.evidence.length === 0 ? (
                    <div className="text-xs text-muted-foreground">— no evidence wired —</div>
                  ) : (
                    data.evidence.map((e) => <EvidenceRow key={e.id} e={e} />)
                  )}
                </Section>
                <div className="grid grid-cols-2 gap-4">
                  <Section title={`Positives (${data.positives.length})`}>
                    <PointList points={data.positives} kind="positive" />
                  </Section>
                  <Section title={`Deductions (${data.deductions.length})`}>
                    <PointList points={data.deductions} kind="deduction" />
                  </Section>
                </div>
                <Section title="Verified by platform">
                  <ul className="space-y-1 text-sm">
                    {data.verifyNext.map((v) => (
                      <VerifyRow key={v.id} v={v} />
                    ))}
                  </ul>
                  <div className="mt-1 text-[10px] text-muted-foreground/70">
                    Secondary checks. The metrics, evidence, positives and deductions above are the
                    primary evidence.
                  </div>
                </Section>
                {data.catalysts && data.catalysts.length > 0 && (
                  <Section title={`External catalysts (${data.catalysts.length})`}>
                    <div className="space-y-2">
                      {data.catalysts.map((c) => (
                        <CatalystRow key={c.id} c={c} />
                      ))}
                    </div>
                  </Section>
                )}
                {data.calculation && (
                  <Section title="Calculation">
                    <div className="rounded-md border border-border bg-muted/30 p-2 text-xs font-mono">
                      <div className="text-[var(--primary)]">{data.calculation.formula}</div>
                      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-muted-foreground">
                        {Object.entries(data.calculation.inputs).map(([k, v]) => (
                          <div key={k} className="flex justify-between">
                            <span>{k}</span>
                            <span className="text-foreground tabular-nums">{String(v)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 border-t border-border/70 pt-1.5 text-[10px]">
                        <div>
                          version{" "}
                          <span className="text-foreground">{data.calculation.calcVersion}</span>
                        </div>
                        <div>
                          computed{" "}
                          <span className="text-foreground">
                            {new Date(data.calculation.computedAt).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Section>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Compact metrics */}
      <MetricGrid metrics={data.metrics} />

      <div className="max-h-[92px] overflow-hidden">
        <PanelNarrative data={data} compact />
      </div>

      {/* Trend chart */}
      {data.chart && (
        <div className="rounded-md border border-border/60 bg-background/40 p-2">
          <TrendChart series={data.chart} height={145} compact />
        </div>
      )}

      {/* Compact interpretation. Full evidence, checks and maths live in Expand. */}
      <div className="mt-auto grid grid-cols-2 gap-3 border-t border-border/60 pt-2 text-[11px]">
        <div>
          <div className="uppercase tracking-wider text-muted-foreground">What changed</div>
          <p className="mt-0.5 line-clamp-3 leading-snug">{data.whatChanged}</p>
        </div>
        <div>
          <div className="uppercase tracking-wider text-muted-foreground">What it means</div>
          <p className="mt-0.5 line-clamp-3 leading-snug">{data.whyItMatters}</p>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border/60 pt-2 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
        <span>{data.evidence.length} evidence items</span>
        <span>
          {data.positives.length} supportive · {data.deductions.length} risks
        </span>
      </div>
    </Card>
  );
}

function MetricGrid({ metrics, large = false }: { metrics: Metric[]; large?: boolean }) {
  if (metrics.length === 0) return null;
  return (
    <div
      className={cn(
        "grid gap-2",
        metrics.length >= 3 ? "grid-cols-3" : metrics.length === 2 ? "grid-cols-2" : "grid-cols-1",
      )}
    >
      {metrics.map((m, i) => (
        <div key={i} className="rounded-md border border-border/60 bg-background/40 px-2 py-1.5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            <InfoTip label={m.label} explanation={m.explanation} />
          </div>
          <InfoTip label={`${m.label}: ${m.value}`} explanation={m.explanation}>
            <span
              className={cn(
                "mt-0.5 font-mono tabular-nums",
                large ? "text-lg" : "text-sm",
                ToneClass(m.tone),
              )}
            >
              {m.value}
            </span>
          </InfoTip>
          {m.delta && (
            <div className={cn("text-[10px] font-mono tabular-nums", ToneClass(m.tone))}>
              {m.delta}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      {children}
    </section>
  );
}

function BackgroundBlock({ bg }: { bg: NonNullable<PanelData["background"]> }) {
  return (
    <section className="rounded-md border border-border/70 bg-muted/20 p-3 space-y-3">
      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--primary)]">
          Background — what this panel measures
        </div>
        <p className="text-sm leading-relaxed">{bg.overview}</p>
      </div>
      {bg.historicalContext && (
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Historical context
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">{bg.historicalContext}</p>
        </div>
      )}
      {bg.whatCauses && bg.whatCauses.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            What typically causes it
          </div>
          <ul className="space-y-0.5 text-xs list-disc pl-4 marker:text-[var(--primary)]">
            {bg.whatCauses.map((c, i) => (
              <li key={i} className="leading-snug">
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}
      {bg.assetsAffected && bg.assetsAffected.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Assets, sectors & markets most affected
          </div>
          <ul className="space-y-1 text-xs">
            {bg.assetsAffected.map((a, i) => (
              <li key={i} className="flex gap-2">
                <span className="font-mono text-[var(--primary)] shrink-0">›</span>
                <span className="leading-snug">
                  <span className="font-medium">{a.label}</span>
                  {a.note && <span className="text-muted-foreground"> — {a.note}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {bg.whatToWatch && bg.whatToWatch.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            What to watch next
          </div>
          <ul className="space-y-0.5 text-xs list-disc pl-4 marker:text-[var(--warning)]">
            {bg.whatToWatch.map((c, i) => (
              <li key={i} className="leading-snug">
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}
      {bg.examples && bg.examples.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Historical examples
          </div>
          <ul className="space-y-1 text-xs">
            {bg.examples.map((a, i) => (
              <li key={i} className="flex gap-2">
                <span className="font-mono text-muted-foreground shrink-0">•</span>
                <span className="leading-snug">
                  <span className="font-medium">{a.label}</span>
                  {a.note && <span className="text-muted-foreground"> — {a.note}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function CatalystRow({ c, dense = false }: { c: Catalyst; dense?: boolean }) {
  const tone = c.direction === "tailwind" ? "text-[var(--positive)]" : "text-[var(--negative)]";
  const bg =
    c.direction === "tailwind"
      ? "border-[color:var(--positive)]/30 bg-[color:var(--positive)]/5"
      : "border-[color:var(--negative)]/30 bg-[color:var(--negative)]/5";
  const kindLabel = c.kind === "alt_data" ? "alt-data" : c.kind;
  const mag = "•".repeat(c.magnitude);
  return (
    <div className={cn("rounded-sm border p-1.5", bg)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div
            className={cn("flex items-center gap-1.5 text-[11px] font-medium leading-tight", tone)}
          >
            <span className="font-mono text-[9px] uppercase tracking-wider">{kindLabel}</span>
            <span className="font-mono text-[9px]">{mag}</span>
            <span className="truncate">{c.headline}</span>
          </div>
          <div
            className={cn(
              "mt-0.5 leading-snug text-muted-foreground",
              dense ? "text-[10px]" : "text-[11px]",
            )}
          >
            {c.reasoning}
          </div>
          {c.historicalNote && !dense && (
            <div className="mt-0.5 text-[10px] italic text-muted-foreground/80">
              ↳ {c.historicalNote}
            </div>
          )}
        </div>
        <div className="shrink-0 text-right font-mono text-[9px] text-muted-foreground">
          <div>{c.source}</div>
          <div>{new Date(c.asOf).toLocaleDateString()}</div>
        </div>
      </div>
    </div>
  );
}
