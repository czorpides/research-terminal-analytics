import { AlertTriangle, CheckCircle2, Clock3, ShieldCheck, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { SwingExpectationSignal, SwingExpectationsWorkspace } from "@/lib/swing/expectations";
import type { SwingTradesWorkspace } from "@/lib/swing/workspace.functions";
import { cn } from "@/lib/utils";

export function SwingExpectationsPanel({
  workspace,
  expectations,
  loading,
  error,
}: {
  workspace: SwingTradesWorkspace;
  expectations: SwingExpectationsWorkspace | null;
  loading: boolean;
  error: string | null;
}) {
  const rows = workspace.candidates
    .filter((candidate) => candidate.expectations)
    .map((candidate) => ({ candidate, signal: candidate.expectations! }))
    .sort((left, right) => right.signal.adjustment - left.signal.adjustment)
    .slice(0, 12);

  return (
    <section className="mt-5 space-y-4 rounded-xl border border-border/70 bg-card/55 p-4 lg:p-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
            Analyst expectations · auditable conviction layer
          </div>
          <h3 className="mt-1 text-base font-semibold">Forward earnings and price-target revision momentum</h3>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-muted-foreground">
            Structured FMP analyst estimates and price targets are stored as point-in-time vintages.
            The raw technical Setup Score is never rewritten. Fresh, validated revisions can move the
            separate conviction rank by at most +/-7 points; stale or quarantined observations contribute zero.
          </p>
        </div>
        <div className="grid min-w-[320px] grid-cols-2 gap-2 text-xs">
          <Health label="Tracked" value={expectations?.health.trackedAssets ?? 0} />
          <Health label="Fresh" value={expectations?.health.freshAssets ?? 0} good />
          <Health label="Stale" value={expectations?.health.staleAssets ?? 0} warn={(expectations?.health.staleAssets ?? 0) > 0} />
          <Health label="Quarantined" value={expectations?.health.quarantinedAssets ?? 0} warn={(expectations?.health.quarantinedAssets ?? 0) > 0} />
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.05] p-3 text-xs">
          <div className="flex items-center gap-2 font-semibold text-amber-600">
            <AlertTriangle className="h-4 w-4" /> Analyst expectation evidence unavailable
          </div>
          <div className="mt-1 font-mono text-muted-foreground">{error}</div>
        </div>
      ) : loading ? (
        <div className="text-sm text-muted-foreground">Loading validated analyst expectation vintages…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-border/60 bg-background/30 p-4 text-sm text-muted-foreground">
          No Swing candidates have a validated expectation snapshot yet. The scheduled monitor prioritises
          the strongest stale candidates and begins building immutable vintages automatically.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border/60">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="border-b border-border/60 bg-background/35 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5">Security</th>
                <th className="px-3 py-2.5">Expectations</th>
                <th className="px-3 py-2.5 text-right">FY1 EPS rev.</th>
                <th className="px-3 py-2.5 text-right">FY2 EPS rev.</th>
                <th className="px-3 py-2.5 text-right">Revenue rev.</th>
                <th className="px-3 py-2.5 text-right">Target rev.</th>
                <th className="px-3 py-2.5 text-right">Target gap</th>
                <th className="px-3 py-2.5 text-right">Confidence</th>
                <th className="px-3 py-2.5">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ candidate, signal }) => (
                <tr key={candidate.assetId} className="border-b border-border/45 last:border-b-0">
                  <td className="px-3 py-3">
                    <div className="font-semibold">{candidate.symbol}</div>
                    <div className="max-w-[180px] truncate text-xs text-muted-foreground">{candidate.name}</div>
                  </td>
                  <td className="px-3 py-3"><ExpectationBadge signal={signal} /></td>
                  <td className="px-3 py-3 text-right font-mono text-xs">{pct(signal.fy1EpsRevisionPct)}</td>
                  <td className="px-3 py-3 text-right font-mono text-xs">{pct(signal.fy2EpsRevisionPct)}</td>
                  <td className="px-3 py-3 text-right font-mono text-xs">{pct(signal.fy1RevenueRevisionPct)}</td>
                  <td className="px-3 py-3 text-right font-mono text-xs">{pct(signal.targetRevisionPct)}</td>
                  <td className="px-3 py-3 text-right font-mono text-xs">{pct(signal.targetUpsidePct)}</td>
                  <td className="px-3 py-3 text-right font-mono text-xs">{signal.confidence.toFixed(0)}%</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5 text-xs">
                      <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                      <span className="uppercase">{signal.providerCode ?? "n/a"}</span>
                      <span>·</span>
                      <span className="capitalize">{signal.freshness}</span>
                    </div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      {signal.lastVerifiedAt ? `verified ${formatTimestamp(signal.lastVerifiedAt)}` : "not verified"}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-3">
        <Guardrail
          icon={CheckCircle2}
          title="No AI-generated numbers"
          text="Only structured provider values enter the calculations. Missing values remain unavailable rather than being guessed or filled by a language model."
        />
        <Guardrail
          icon={ShieldCheck}
          title="Validation + quarantine"
          text="Range errors, extreme target/price ratios and implausibly large revisions are quarantined for audit and contribute zero conviction until verified."
        />
        <Guardrail
          icon={Clock3}
          title="Freshness gate"
          text="Evidence is fresh for six hours, warns up to 24 hours and becomes score-ineligible after that. Identical provider payloads advance last-verified time without rewriting the original vintage."
        />
      </div>
    </section>
  );
}

function ExpectationBadge({ signal }: { signal: SwingExpectationSignal }) {
  if (signal.validationState === "quarantined") {
    return <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600">Quarantined</Badge>;
  }
  if (signal.freshness === "stale") {
    return <Badge variant="outline" className="border-border bg-background/40 text-muted-foreground">Stale · excluded</Badge>;
  }
  if (signal.blockHighConviction) {
    return <Badge variant="outline" className="border-red-500/30 bg-red-500/10 text-red-600">Negative revision block</Badge>;
  }
  if (signal.strongPositive) {
    return <Badge className="whitespace-nowrap">Strong ↑ · +{signal.adjustment.toFixed(1)}</Badge>;
  }
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap", signal.adjustment > 0 ? "text-emerald-600" : signal.adjustment < 0 ? "text-amber-600" : "text-muted-foreground")}>
      {signal.adjustment > 0 ? "+" : ""}{signal.adjustment.toFixed(1)} conviction
    </Badge>
  );
}

function Health({ label, value, good = false, warn = false }: { label: string; value: number; good?: boolean; warn?: boolean }) {
  return (
    <div className="rounded-md border border-border/60 bg-background/35 px-3 py-2">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 font-mono text-sm", good && "text-emerald-500", warn && "text-amber-500")}>{value}</div>
    </div>
  );
}

function Guardrail({ icon: Icon, title, text }: { icon: typeof TrendingUp; title: string; text: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/30 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 text-primary" /> {title}</div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p>
    </div>
  );
}

function pct(value: number | null): string {
  return value === null ? "n/a" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}
