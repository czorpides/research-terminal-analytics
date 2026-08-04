import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  Crosshair,
  Gauge,
  Target,
  TrendingUp,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { getSwingTrackerWorkspace, type SwingTrackerRow } from "@/lib/swing/tracker.functions";
import { cn } from "@/lib/utils";

export function SwingOutcomesPanel() {
  const query = useQuery({
    queryKey: ["opportunity-radar", "swing-outcomes-v1"],
    queryFn: () => getSwingTrackerWorkspace(),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const workspace = query.data;
  const recent = useMemo(() => workspace?.rows.slice(0, 30) ?? [], [workspace?.rows]);

  if (!workspace) {
    return (
      <section className="mt-5 rounded-xl border border-border/70 bg-card/55 p-6 text-sm text-muted-foreground">
        Loading the Swing Trade outcome ledger…
      </section>
    );
  }

  return (
    <div className="mt-5 space-y-5">
      <section className="rounded-xl border border-primary/25 bg-primary/[0.04] p-4 lg:p-5">
        <div className="flex items-start gap-3">
          <BrainCircuit className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">
              SW · Outcome ledger & empirical learning
            </div>
            <h3 className="mt-1 text-base font-semibold">
              Track what happened after the signal, not what the model wishes had happened
            </h3>
            <p className="mt-1 max-w-5xl text-sm leading-6 text-muted-foreground">
              Qualifying setups are stored with their original score, conditions, entry, stop and
              target. Later prices are evaluated against that frozen snapshot. Targets that were
              exceeded, stops that fired first, near-misses and ambiguous same-day target/stop
              crosses are kept separate so the calibration data stays auditable.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <CadencePill icon={Clock3} text={workspace.cadence.liveMonitor} />
              <CadencePill icon={Activity} text={workspace.cadence.uiRefresh} />
              <CadencePill icon={CheckCircle2} text={workspace.cadence.authoritativeOutcomeSource} />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Crosshair}
          label="Tracked setups"
          value={workspace.totals.tracked.toString()}
          detail={`${workspace.totals.active} still active`}
        />
        <MetricCard
          icon={Target}
          label="Observed target hit rate"
          value={workspace.performance.hitRate === null ? "n/a" : `${workspace.performance.hitRate.toFixed(1)}%`}
          detail={`${workspace.totals.resolvedEligible} resolved, eligible outcomes`}
        />
        <MetricCard
          icon={TrendingUp}
          label="Targets exceeded"
          value={workspace.totals.targetExceeded.toString()}
          detail="Target hit, then materially overshot"
        />
        <MetricCard
          icon={Gauge}
          label="Near misses"
          value={workspace.totals.nearMisses.toString()}
          detail="Expired within the ATR-aware target tolerance"
        />
      </section>

      <section className="overflow-hidden rounded-xl border border-border/70 bg-card/55">
        <div className="flex flex-col gap-2 border-b border-border/70 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
              Signal history
            </div>
            <h3 className="mt-1 text-base font-semibold">What actually happened</h3>
          </div>
          <div className="text-xs text-muted-foreground">
            Last monitor evidence {formatTimestamp(workspace.asOf)}
          </div>
        </div>

        {recent.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No qualifying setups have been frozen into the ledger yet. The hourly monitor will
            begin recording confirmed/developing setups scoring 65+ after deployment.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-left text-sm">
              <thead className="border-b border-border/70 bg-background/35 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Signal</th>
                  <th className="px-3 py-3">Setup</th>
                  <th className="px-3 py-3 text-right">Score</th>
                  <th className="px-3 py-3 text-right">Entry</th>
                  <th className="px-3 py-3 text-right">Target</th>
                  <th className="px-3 py-3 text-right">Stop</th>
                  <th className="px-3 py-3">Outcome</th>
                  <th className="px-3 py-3 text-right">Best move</th>
                  <th className="px-3 py-3 text-right">Worst move</th>
                  <th className="px-3 py-3 text-right">Latest</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((row) => <OutcomeRow key={row.id} row={row} />)}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-xl border border-border/70 bg-card/55 p-4 lg:p-5">
          <div className="flex items-center gap-2 font-semibold">
            <BrainCircuit className="h-4 w-4 text-primary" /> Conditions that are working
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Each resolved setup contributes its original conditions to these buckets. A pattern
            becomes empirically validated only after {workspace.learning.minimumSample} resolved,
            non-ambiguous examples. Until then it is evidence collection, not a reason to change
            the model.
          </p>
          {workspace.learning.patterns.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No resolved pattern sample yet.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {workspace.learning.patterns.map((pattern) => (
                <div
                  key={pattern.key}
                  className="grid grid-cols-[minmax(0,1fr)_70px_80px_auto] items-center gap-3 rounded-lg border border-border/60 bg-background/30 px-3 py-2 text-sm"
                >
                  <span className="truncate font-medium">{pattern.label}</span>
                  <span className="text-right font-mono text-xs text-muted-foreground">n={pattern.sampleSize}</span>
                  <span className="text-right font-mono text-xs">{pattern.hitRate.toFixed(1)}%</span>
                  <Badge variant={pattern.validated ? "default" : "outline"} className="justify-self-end text-[10px]">
                    {pattern.validated ? "Validated" : "Collecting"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.05] p-4 lg:p-5">
          <div className="flex items-center gap-2 font-semibold">
            <Gauge className="h-4 w-4 text-amber-500" /> Learning gate
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{workspace.learning.note}</p>
          <div className="mt-4 grid gap-2 text-xs text-muted-foreground">
            <SummaryLine label="Target hits" value={workspace.totals.targetHits} />
            <SummaryLine label="Stops first" value={workspace.totals.stopHits} />
            <SummaryLine label="Near misses" value={workspace.totals.nearMisses} />
            <SummaryLine label="Expired without target" value={workspace.totals.expired} />
            <SummaryLine label="Ambiguous target + stop day" value={workspace.totals.ambiguous} />
          </div>
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            Ambiguous outcomes are excluded from the hit-rate denominator. This is intentional:
            daily OHLC bars cannot prove whether the target or stop occurred first when both were
            crossed in the same session.
          </p>
        </div>
      </section>
    </div>
  );
}

function OutcomeRow({ row }: { row: SwingTrackerRow }) {
  return (
    <tr className="border-b border-border/50">
      <td className="px-4 py-3">
        <div className="font-semibold">{row.symbol}</div>
        <div className="text-xs text-muted-foreground">{row.priceAsOf}</div>
      </td>
      <td className="px-3 py-3">
        <div className="text-xs font-medium">{row.setupLabel}</div>
        <div className="text-[11px] text-muted-foreground">{row.sessionsObserved} sessions observed</div>
      </td>
      <td className="px-3 py-3 text-right font-mono text-xs">{row.setupScore.toFixed(1)}</td>
      <td className="px-3 py-3 text-right font-mono text-xs">{formatPrice(row.entry)}</td>
      <td className="px-3 py-3 text-right font-mono text-xs">{formatPrice(row.target)}</td>
      <td className="px-3 py-3 text-right font-mono text-xs">{formatPrice(row.invalidation)}</td>
      <td className="px-3 py-3"><OutcomeBadge row={row} /></td>
      <td className="px-3 py-3 text-right font-mono text-xs">{formatPct(row.maxFavourablePct)}</td>
      <td className="px-3 py-3 text-right font-mono text-xs">{formatPct(row.maxAdversePct)}</td>
      <td className="px-3 py-3 text-right">
        <div className="font-mono text-xs">{row.latestObservedPrice === null ? formatPct(row.latestReturnPct) : formatPrice(row.latestObservedPrice)}</div>
        <div className="text-[10px] text-muted-foreground">{row.latestObservedAt ? formatTimestamp(row.latestObservedAt) : "daily bar"}</div>
      </td>
    </tr>
  );
}

function OutcomeBadge({ row }: { row: SwingTrackerRow }) {
  const label = outcomeLabel(row);
  const className =
    row.outcomeStatus === "target_hit"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
      : row.outcomeStatus === "stop_hit"
        ? "border-red-500/30 bg-red-500/10 text-red-600"
        : row.outcomeStatus === "near_miss"
          ? "border-amber-500/30 bg-amber-500/10 text-amber-600"
          : row.outcomeStatus === "ambiguous_same_bar"
            ? "border-violet-500/30 bg-violet-500/10 text-violet-600"
            : "border-border bg-background/40 text-muted-foreground";
  return <Badge variant="outline" className={cn("whitespace-nowrap text-[10px]", className)}>{label}</Badge>;
}

function outcomeLabel(row: SwingTrackerRow): string {
  if (row.outcomeStatus === "target_hit" && row.targetBehaviour === "exceeded") {
    return `Target exceeded ${formatPct(row.targetOvershootPct)}`;
  }
  if (row.outcomeStatus === "target_hit") return "Target hit";
  if (row.outcomeStatus === "stop_hit") return "Stop hit first";
  if (row.outcomeStatus === "near_miss") return `Just shy ${formatPct(row.targetShortfallPct)}`;
  if (row.outcomeStatus === "expired") return "Expired";
  if (row.outcomeStatus === "ambiguous_same_bar") return "Target + stop same day";
  if (row.latestObservedPrice !== null) {
    const distance = (row.target / row.latestObservedPrice - 1) * 100;
    if (distance > 0 && distance <= 1) return `Active · ${distance.toFixed(1)}% shy`;
  }
  return "Active";
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/55 p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" /> {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function CadencePill({ icon: Icon, text }: { icon: typeof Activity; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/40 px-2.5 py-1">
      <Icon className="h-3 w-3 text-primary" /> {text}
    </span>
  );
}

function SummaryLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border/50 bg-background/30 px-3 py-2">
      <span>{label}</span><span className="font-mono text-foreground">{value}</span>
    </div>
  );
}

function formatPct(value: number | null): string {
  if (value === null) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "n/a";
  return value >= 100 ? value.toFixed(2) : value.toFixed(3);
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
