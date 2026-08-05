import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  Globe2,
  ShieldCheck,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type {
  OpportunityRadarHealth,
  OpportunityReadinessCheck,
  OpportunityRegionHealth,
} from "@/lib/opportunity/health.functions";
import { cn } from "@/lib/utils";

export function OpportunityRadarReadinessStatus({ health }: { health: OpportunityRadarHealth | null }) {
  if (!health) return null;

  const stateClass = health.state === "ready"
    ? "border-emerald-500/35 bg-emerald-500/[0.06]"
    : health.state === "degraded"
      ? "border-red-500/35 bg-red-500/[0.06]"
      : "border-amber-500/35 bg-amber-500/[0.06]";
  const StateIcon = health.state === "ready"
    ? CheckCircle2
    : health.state === "degraded"
      ? XCircle
      : AlertTriangle;

  return (
    <section className={cn("mb-5 rounded-xl border p-4 lg:p-5", stateClass)}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <StateIcon
            className={cn(
              "mt-0.5 h-5 w-5 shrink-0",
              health.state === "ready"
                ? "text-emerald-500"
                : health.state === "degraded"
                  ? "text-red-500"
                  : "text-amber-500",
            )}
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Opportunity data readiness
              </div>
              <Badge variant="outline" className="font-mono text-[10px] uppercase">
                {health.state}
              </Badge>
            </div>
            <h2 className="mt-1 text-base font-semibold">
              {health.trustedMarketEvidence
                ? "Opportunity Radar market evidence is ready"
                : "Opportunity Radar is still building full market evidence"}
            </h2>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-muted-foreground">{health.headline}</p>
            <p className="mt-2 max-w-4xl text-xs leading-5 text-muted-foreground">
              Required checks cover the managed universe, fresh full-universe EOD prices, 252-session adjusted
              history, fresh technical scores and a regional floor across US, UK and Europe. Fundamental freshness
              and provider-identifier coverage are visible separately rather than being silently assumed.
            </p>
          </div>
        </div>

        <div className="grid min-w-[320px] grid-cols-2 gap-2 text-xs">
          <Summary icon={Database} label="Universe" value={`${health.universe.active.toLocaleString()} / ${health.universe.target.toLocaleString()}`} />
          <Summary icon={ShieldCheck} label="252-bar ready" value={`${health.technical.history252CoveragePct.toFixed(1)}%`} />
          <Summary icon={Activity} label="Fresh scores" value={`${health.technical.freshScoreCoveragePct.toFixed(1)}%`} />
          <Summary icon={Database} label="Fresh fundamentals" value={`${health.fundamentals.freshCoveragePct.toFixed(1)}%`} />
        </div>
      </div>

      {health.regions.length > 0 && (
        <div className="mt-4 grid gap-2 md:grid-cols-3">
          {health.regions.map((region) => <RegionCard key={region.region} region={region} />)}
        </div>
      )}

      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {health.checks.map((check) => <HealthCheck key={check.key} check={check} />)}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[10px] text-muted-foreground">
        <span>EODHD mapped {health.providerMappings.eodhdMappedAssets.toLocaleString()}</span>
        <span>FMP mapped {health.providerMappings.fmpMappedAssets.toLocaleString()}</span>
        <span>FMP verified {health.providerMappings.fmpVerifiedAssets.toLocaleString()}</span>
        <span>TD mapped {health.providerMappings.twelveDataMappedAssets.toLocaleString()}</span>
        <span>Fundamental warning {health.fundamentals.warningAssets.toLocaleString()}</span>
        <span>Fundamental stale {health.fundamentals.staleAssets.toLocaleString()}</span>
      </div>
    </section>
  );
}

function RegionCard({ region }: { region: OpportunityRegionHealth }) {
  const Icon = region.ready ? CheckCircle2 : AlertTriangle;
  const weakest = Math.min(
    region.freshPriceCoveragePct,
    region.history252CoveragePct,
    region.freshScoreCoveragePct,
  );
  return (
    <div className="rounded-lg border border-border/60 bg-background/35 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <Globe2 className="h-3.5 w-3.5 text-muted-foreground" /> {region.region}
        </div>
        <Icon className={cn("h-3.5 w-3.5", region.ready ? "text-emerald-500" : "text-amber-500")} />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 font-mono text-[10px]">
        <div><div className="text-muted-foreground">EOD</div><div>{region.freshPriceCoveragePct.toFixed(1)}%</div></div>
        <div><div className="text-muted-foreground">252d</div><div>{region.history252CoveragePct.toFixed(1)}%</div></div>
        <div><div className="text-muted-foreground">Scores</div><div>{region.freshScoreCoveragePct.toFixed(1)}%</div></div>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        {region.activeAssets.toLocaleString()} assets · weakest coverage {weakest.toFixed(1)}%
      </div>
    </div>
  );
}

function HealthCheck({ check }: { check: OpportunityReadinessCheck }) {
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
  icon: LucideIcon;
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
