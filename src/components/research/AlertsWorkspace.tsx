import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Bell, CheckCircle2, Clock3, RefreshCw, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAlertsDashboard, type AlertFiringView } from "@/lib/panels/alerts.functions";
import { cn } from "@/lib/utils";

export function AlertsWorkspace() {
  const load = useServerFn(getAlertsDashboard);
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["alerts", "dashboard", "v2"],
    queryFn: () => load(),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
  const [state, setState] = useState<"all" | AlertFiringView["state"]>("all");
  const firings = useMemo(
    () => data?.firings.filter((firing) => state === "all" || firing.state === state) ?? [],
    [data?.firings, state],
  );

  if (isLoading && !data) return <div className="rounded border border-border/70 p-8 text-center text-xs text-muted-foreground">Loading alert rules and firing history…</div>;
  if (error) return <div className="rounded border border-[var(--negative)]/40 bg-[var(--negative)]/5 p-3 text-xs text-[var(--negative)]">Alerts unavailable: {(error as Error).message}</div>;
  if (!data) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-card/40 p-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold"><Bell className="h-4 w-4 text-[var(--primary)]" />Deterministic alert monitor</div>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">Rules and firings are read from the audit tables. Each firing retains its stored confidence, rule relationship and evaluation detail.</p>
        </div>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-[10px]" onClick={() => refetch()}><RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />Refresh</Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={ShieldCheck} label="Active rules" value={String(data.counts.activeRules)} detail={`${data.counts.inactiveRules} inactive`} />
        <Kpi icon={AlertTriangle} label="Open alerts" value={String(data.counts.openAlerts)} detail="Pending or triggered" tone={data.counts.openAlerts ? "warning" : "positive"} />
        <Kpi icon={Clock3} label="Triggered in 7 days" value={String(data.counts.triggeredSevenDays)} detail={`${data.firings.length} retained firings`} />
        <Kpi icon={CheckCircle2} label="Average confidence" value={`${data.counts.averageConfidence.toFixed(0)}%`} detail={`${data.counts.acknowledged} acknowledged`} />
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(340px,.75fr)_minmax(0,1.25fr)]">
        <section className="rounded-md border border-border/70 bg-card/35">
          <header className="border-b border-border/60 p-3">
            <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Rule catalogue</div>
            <h2 className="mt-0.5 text-sm font-semibold">What the platform is watching</h2>
          </header>
          <div className="divide-y divide-border/50">
            {data.rules.length ? data.rules.map((rule) => (
              <article key={rule.id} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><div className="truncate text-xs font-semibold">{rule.name}</div><div className="mt-0.5 truncate text-[9px] text-muted-foreground">{rule.subjectLabel}</div></div>
                  <Badge variant="outline" className={cn("h-5 px-1.5 text-[8px] uppercase", rule.active ? "border-[var(--positive)]/40 text-[var(--positive)]" : "text-muted-foreground")}>{rule.active ? "active" : "paused"}</Badge>
                </div>
                <div className="mt-2 rounded border border-border/50 bg-background/25 p-2 font-mono text-[10px] leading-relaxed">{rule.condition}</div>
                <div className="mt-2 flex items-center justify-between font-mono text-[9px] text-muted-foreground"><span>{rule.firedCount} retained firings</span><span>{rule.latestFiringAt ? relative(rule.latestFiringAt) : "Never fired"}</span></div>
              </article>
            )) : <Empty text="No alert rules are currently stored." />}
          </div>
        </section>

        <section className="rounded-md border border-border/70 bg-card/35">
          <header className="flex flex-col gap-2 border-b border-border/60 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div><div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Firing history</div><h2 className="mt-0.5 text-sm font-semibold">What crossed a stored threshold</h2></div>
            <select value={state} onChange={(event) => setState(event.target.value as typeof state)} className="h-8 rounded border border-border/70 bg-background px-2 text-[10px]"><option value="all">All states</option><option value="pending">Pending</option><option value="triggered">Triggered</option><option value="acknowledged">Acknowledged</option><option value="dismissed">Dismissed</option></select>
          </header>
          <div className="divide-y divide-border/50">
            {firings.length ? firings.map((firing) => (
              <article key={firing.id} className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_115px] sm:items-start">
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold">{firing.headline}</span><StateBadge state={firing.state} /></div><div className="mt-1 text-[10px] text-muted-foreground">{firing.ruleName}</div><p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">{firing.detail}</p></div>
                <div className="text-right"><div className="font-mono text-sm font-semibold">{firing.confidence.toFixed(0)}%</div><div className="font-mono text-[9px] text-muted-foreground">{relative(firing.triggeredAt)}</div></div>
              </article>
            )) : <Empty text="No alert firings match this state." />}
          </div>
        </section>
      </div>
    </div>
  );
}

function StateBadge({ state }: { state: AlertFiringView["state"] }) {
  const style: Record<AlertFiringView["state"], string> = { pending: "border-[var(--warning)]/40 text-[var(--warning)]", triggered: "border-[var(--negative)]/40 text-[var(--negative)]", acknowledged: "border-[var(--positive)]/40 text-[var(--positive)]", dismissed: "text-muted-foreground" };
  return <Badge variant="outline" className={cn("h-5 px-1.5 text-[8px] uppercase", style[state])}>{state}</Badge>;
}

function Kpi({ icon: Icon, label, value, detail, tone = "neutral" }: { icon: typeof Bell; label: string; value: string; detail: string; tone?: "neutral" | "positive" | "warning" }) {
  return <div className="rounded-md border border-border/70 bg-card/35 p-3"><div className="flex items-center justify-between gap-2"><span className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</span><Icon className="h-3.5 w-3.5 text-muted-foreground" /></div><div className={cn("mt-1 font-mono text-2xl font-semibold", tone === "positive" && "text-[var(--positive)]", tone === "warning" && "text-[var(--warning)]")}>{value}</div><div className="mt-1 text-[10px] text-muted-foreground">{detail}</div></div>;
}

function Empty({ text }: { text: string }) { return <div className="p-8 text-center text-xs text-muted-foreground">{text}</div>; }

function relative(value: string): string {
  const delta = Date.now() - new Date(value).getTime();
  const days = Math.floor(delta / 86_400_000);
  if (days > 0) return `${days}d ago`;
  const hours = Math.floor(delta / 3_600_000);
  if (hours > 0) return `${hours}h ago`;
  const minutes = Math.max(0, Math.floor(delta / 60_000));
  return `${minutes}m ago`;
}
