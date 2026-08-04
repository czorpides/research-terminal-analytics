import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type {
  SwingHealthCheck,
  SwingOperationalHealth,
} from "@/lib/swing/health.functions";
import { cn } from "@/lib/utils";

export function SwingOperationalStatus({
  health,
  loading,
  error,
}: {
  health: SwingOperationalHealth | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <section className="mb-5 rounded-xl border border-border/70 bg-card/55 p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Activity className="h-4 w-4 animate-pulse" /> Verifying Swing engine runtime health…
        </div>
      </section>
    );
  }

  if (error || !health) {
    return (
      <section className="mb-5 rounded-xl border border-red-500/35 bg-red-500/[0.06] p-4">
        <div className="flex items-start gap-3">
          <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
          <div>
            <div className="text-sm font-semibold">SWING ENGINE · HEALTH UNKNOWN</div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              The platform cannot prove the runtime prerequisites are healthy, so Swing signals should not be
              treated as fully live until the health query succeeds.
            </p>
            {error && <div className="mt-2 font-mono text-[11px] text-red-500">{error}</div>}
          </div>
        </div>
      </section>
    );
  }

  const stateClass =
    health.state === "operational"
      ? "border-emerald-500/35 bg-emerald-500/[0.06]"
      : health.state === "offline"
        ? "border-red-500/35 bg-red-500/[0.06]"
        : "border-amber-500/35 bg-amber-500/[0.06]";
  const StateIcon =
    health.state === "operational" ? CheckCircle2 : health.state === "offline" ? XCircle : AlertTriangle;

  return (
    <section className={cn("mb-5 rounded-xl border p-4 lg:p-5", stateClass)}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <StateIcon
            className={cn(
              "mt-0.5 h-5 w-5 shrink-0",
              health.state === "operational"
                ? "text-emerald-500"
                : health.state === "offline"
                  ? "text-red-500"
                  : "text-amber-500",
            )}
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Runtime trust gate
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "font-mono text-[10px] uppercase",
                  health.state === "operational"
                    ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-500"
                    : health.state === "offline"
                      ? "border-red-500/35 bg-red-500/10 text-red-500"
                      : "border-amber-500/35 bg-amber-500/10 text-amber-500",
                )}
              >
                {health.state}
              </Badge>
            </div>
            <h2 className="mt-1 text-base font-semibold">
              {health.trusted ? "Swing engine is currently trusted as operational" : "Swing engine is not yet trusted as fully operational"}
            </h2>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-muted-foreground">{health.headline}</p>
            <p className="mt-2 max-w-4xl text-xs leading-5 text-muted-foreground">
              This badge is fail-closed. It turns Operational only when the managed universe, fresh 90-bar
              coverage, tracker database, scheduled monitor heartbeat and full-universe EOD pipeline all pass.
              A page render or successful score calculation alone is not enough.
            </p>
          </div>
        </div>

        <div className="grid min-w-[320px] grid-cols-2 gap-2 text-xs lg:grid-cols-4 xl:grid-cols-2">
          <Summary icon={Database} label="Universe" value={`${health.universe.active.toLocaleString()} / ${health.universe.target.toLocaleString()}`} />
          <Summary icon={ShieldCheck} label="90-bar ready" value={`${health.universe.readyCoveragePct.toFixed(1)}%`} />
          <Summary icon={Clock3} label="Last monitor" value={ageLabel(health.monitor.lastSuccessAgeMinutes)} />
          <Summary icon={Activity} label="Tracker" value={health.tracker.schemaAvailable ? `${health.tracker.tracked} setups` : "Unavailable"} />
        </div>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {health.checks.map((check) => (
          <HealthCheck key={check.key} check={check} />
        ))}
      </div>

      {(health.monitor.lastError || health.eod.lastError) && (
        <div className="mt-3 rounded-lg border border-border/60 bg-background/35 p-3 font-mono text-[10px] leading-5 text-muted-foreground">
          {health.monitor.lastError && <div>Monitor: {health.monitor.lastError}</div>}
          {health.eod.lastError && <div>Bulk EOD: {health.eod.lastError}</div>}
        </div>
      )}
    </section>
  );
}

function HealthCheck({ check }: { check: SwingHealthCheck }) {
  const Icon = check.state === "pass" ? CheckCircle2 : check.state === "warn" ? AlertTriangle : XCircle;
  return (
    <div className="rounded-lg border border-border/60 bg-background/35 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <Icon
            className={cn(
              "h-3.5 w-3.5 shrink-0",
              check.state === "pass"
                ? "text-emerald-500"
                : check.state === "warn"
                  ? "text-amber-500"
                  : "text-red-500",
            )}
          />
          {check.label}
        </div>
        {check.required && (
          <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">required</span>
        )}
      </div>
      <div className="mt-1 font-mono text-xs">{check.value}</div>
      <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{check.detail}</p>
    </div>
  );
}

function Summary({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/35 p-2.5">
      <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="mt-1 font-mono text-xs font-semibold">{value}</div>
    </div>
  );
}

function ageLabel(minutes: number | null): string {
  if (minutes === null) return "Never";
  if (minutes < 60) return `${Math.round(minutes)}m ago`;
  if (minutes < 48 * 60) return `${(minutes / 60).toFixed(1)}h ago`;
  return `${(minutes / 1_440).toFixed(1)}d ago`;
}
