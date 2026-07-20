import { useState } from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Minus,
  Plus,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SOURCE_TIER_META, type SourceTier } from "@/lib/reliability/tiers";
import type { PanelData, Evidence, Metric, Point } from "@/lib/panels/contract";

function ToneClass(tone?: Metric["tone"]) {
  switch (tone) {
    case "positive": return "text-[var(--positive)]";
    case "negative": return "text-[var(--negative)]";
    case "warning":  return "text-[var(--warning)]";
    default: return "text-foreground";
  }
}

function FreshnessDot({ state }: { state: Evidence["freshness"] }) {
  const color =
    state === "fresh" ? "bg-[var(--positive)]" :
    state === "warn"  ? "bg-[var(--warning)]"  :
                        "bg-[var(--negative)]";
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
    value >= 75 ? <ShieldCheck className="h-3.5 w-3.5" /> :
    value >= 40 ? <ShieldQuestion className="h-3.5 w-3.5" /> :
                  <ShieldAlert className="h-3.5 w-3.5" />;
  const tone =
    value >= 75 ? "text-[var(--positive)]" :
    value >= 40 ? "text-[var(--warning)]" :
                  "text-[var(--negative)]";
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
            <div className="text-xs">No deductions — all inputs are fresh, agreeing and Tier 1.</div>
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
            <a href={e.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
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
      <span className={cn("mt-1 shrink-0 text-[10px] font-mono uppercase", e.agrees ? "text-[var(--positive)]" : "text-[var(--negative)]")}>
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

export function ResearchPanel({ data }: { data: PanelData }) {
  const [showCalc, setShowCalc] = useState(false);

  return (
    <Card className="flex flex-col gap-3 p-3 bg-card/60 border-border/70">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold leading-tight tracking-tight text-foreground">{data.title}</h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{data.purpose}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ConfidenceMeter value={data.confidence.value} penalties={data.confidence.penalties} />
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-[11px]">
                Expand
                <ChevronRight className="h-3 w-3" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
              <SheetHeader>
                <SheetTitle>{data.title}</SheetTitle>
                <SheetDescription>{data.purpose}</SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-5">
                <Section title="Metrics">
                  <MetricGrid metrics={data.metrics} large />
                </Section>
                <Section title="What changed"><p className="text-sm">{data.whatChanged}</p></Section>
                <Section title="Why it matters"><p className="text-sm">{data.whyItMatters}</p></Section>
                <Section title={`Evidence (${data.evidence.length})`}>
                  {data.evidence.length === 0
                    ? <div className="text-xs text-muted-foreground">— no evidence wired —</div>
                    : data.evidence.map((e) => <EvidenceRow key={e.id} e={e} />)}
                </Section>
                <div className="grid grid-cols-2 gap-4">
                  <Section title={`Positives (${data.positives.length})`}>
                    <PointList points={data.positives} kind="positive" />
                  </Section>
                  <Section title={`Deductions (${data.deductions.length})`}>
                    <PointList points={data.deductions} kind="deduction" />
                  </Section>
                </div>
                <Section title="Verify next">
                  <ul className="space-y-1 text-sm">
                    {data.verifyNext.map((v, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span>{v}</span>
                      </li>
                    ))}
                  </ul>
                </Section>
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
                        <div>version <span className="text-foreground">{data.calculation.calcVersion}</span></div>
                        <div>computed <span className="text-foreground">{new Date(data.calculation.computedAt).toLocaleString()}</span></div>
                      </div>
                    </div>
                  </Section>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Compact metrics */}
      <MetricGrid metrics={data.metrics} />

      {/* Why */}
      <div className="space-y-1.5 border-t border-border/60 pt-2 text-[11px]">
        <div>
          <div className="uppercase tracking-wider text-muted-foreground">What changed</div>
          <p className="mt-0.5 leading-snug">{data.whatChanged}</p>
        </div>
        <div>
          <div className="uppercase tracking-wider text-muted-foreground">Why it matters</div>
          <p className="mt-0.5 leading-snug">{data.whyItMatters}</p>
        </div>
      </div>

      {/* Evidence compact */}
      {data.evidence.length > 0 && (
        <div className="border-t border-border/60 pt-2">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            Evidence · {data.evidence.length}
          </div>
          <div>
            {data.evidence.slice(0, 3).map((e) => <EvidenceRow key={e.id} e={e} />)}
          </div>
        </div>
      )}

      {/* Positives / deductions */}
      <div className="grid grid-cols-2 gap-3 border-t border-border/60 pt-2">
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            Positives · {data.positives.length}
          </div>
          <PointList points={data.positives} kind="positive" />
        </div>
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            Deductions · {data.deductions.length}
          </div>
          <PointList points={data.deductions} kind="deduction" />
        </div>
      </div>

      {/* Verify next */}
      {data.verifyNext.length > 0 && (
        <div className="border-t border-border/60 pt-2">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Verify next</div>
          <ul className="space-y-0.5 text-[11px]">
            {data.verifyNext.slice(0, 3).map((v, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                <span>{v}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Calculation drawer */}
      {data.calculation && (
        <Collapsible open={showCalc} onOpenChange={setShowCalc} className="border-t border-border/60 pt-2">
          <CollapsibleTrigger className="flex w-full items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground">
            <span>Show calculation</span>
            <ChevronDown className={cn("h-3 w-3 transition-transform", showCalc && "rotate-180")} />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <div className="rounded-md border border-border bg-muted/30 p-2 text-[11px] font-mono">
              <div className="text-[var(--primary)]">{data.calculation.formula}</div>
              <div className="mt-1.5 text-[10px] text-muted-foreground">
                v{data.calculation.calcVersion} · {new Date(data.calculation.computedAt).toLocaleString()}
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
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
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{m.label}</div>
          <div className={cn("mt-0.5 font-mono tabular-nums", large ? "text-lg" : "text-sm", ToneClass(m.tone))}>
            {m.value}
          </div>
          {m.delta && (
            <div className={cn("text-[10px] font-mono tabular-nums", ToneClass(m.tone))}>{m.delta}</div>
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