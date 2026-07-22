import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { getInflationEngine, getGrowthInflationMap } from "@/lib/panels/inflation.functions";
import { GrowthInflationMap } from "@/components/research/GrowthInflationMap";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/macro/inflation")({
  head: () => ({ meta: [
    { title: "US Inflation Engine — Research Terminal" },
    { name: "description", content: "CPI, PCE, PPI, wages, shelter, import prices, expectations, freight and breakevens with an explainable Inflation Pressure Score." },
    { property: "og:title", content: "US Inflation Engine" },
    { property: "og:description", content: "13 inflation series, deterministic transforms, Kalman trend and pressure score with contribution ledger." },
  ]}),
  component: InflationEngine,
});

function fmt(n: number | null, digits = 2, suffix = ""): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n.toFixed(digits)}${suffix}`;
}

function zoneClass(zone: string) {
  switch (zone) {
    case "green": return "border-l-2 border-l-[var(--positive)]";
    case "yellow": return "border-l-2 border-l-yellow-500";
    case "red": return "border-l-2 border-l-[var(--negative)]";
    default: return "border-l-2 border-l-muted";
  }
}

function InflationEngine() {
  const engine = useServerFn(getInflationEngine);
  const map = useServerFn(getGrowthInflationMap);
  const { data, isLoading, error } = useQuery({ queryKey: ["inflation-engine"], queryFn: () => engine(), refetchOnWindowFocus: false });
  const { data: mapData } = useQuery({ queryKey: ["growth-inflation-map"], queryFn: () => map(), refetchOnWindowFocus: false });

  return (
    <AppShell>
      <SectionHeader
        code="MA · US Inflation Engine"
        title="What is the pace, breadth and direction of US inflation?"
        purpose="13 official price, wage, shelter, expectation and freight series with deterministic transforms, Kalman trend and an explainable Pressure Score."
      />
      {isLoading && <div className="text-xs text-muted-foreground">Loading inflation engine…</div>}
      {error && <div className="text-xs text-[var(--negative)]">Failed to load: {(error as Error).message}</div>}

      {data && (
        <>
          <div className="mb-4 grid gap-3 md:grid-cols-3">
            <div className="rounded border border-border bg-card p-3 md:col-span-1">
              <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Inflation Pressure Score</div>
              <div className="mt-1 text-3xl font-semibold">{data.pressure.score.toFixed(1)}</div>
              <div className="text-xs text-muted-foreground capitalize">{data.pressure.regime.replace("_", " ")}</div>
              <div className="mt-3 text-[11px] text-muted-foreground">
                Breadth: {data.breadth.above_target} above · {data.breadth.on_target} on target · {data.breadth.below_target} below · {data.breadth.unknown} unknown
              </div>
            </div>
            <div className="rounded border border-border bg-card p-3 md:col-span-2">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Contribution ledger</div>
              <div className="grid gap-1 text-xs">
                {data.pressure.contributions.map((c) => (
                  <div key={c.key} className="flex items-center justify-between border-b border-border/50 py-1 last:border-b-0">
                    <div className="flex-1">
                      <div className="text-foreground">{c.label}</div>
                      <div className="text-[10px] text-muted-foreground">{c.metric} · target {c.target ?? "—"} · weight {(c.weight * 100).toFixed(0)}%</div>
                    </div>
                    <div className="w-16 text-right font-mono">{fmt(c.value, 2)}</div>
                    <div className={cn("w-16 text-right font-mono",
                      c.direction === "up" ? "text-[var(--negative)]" : c.direction === "down" ? "text-[var(--positive)]" : "text-muted-foreground")}>
                      {c.direction === "up" ? "▲" : c.direction === "down" ? "▼" : "·"} {fmt(c.points, 1)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-[10px] text-muted-foreground">calc {data.pressure.calcVersion} · {new Date(data.pressure.computedAt).toISOString().slice(0, 10)}</div>
            </div>
          </div>

          {mapData && <div className="mb-4"><GrowthInflationMap data={mapData} /></div>}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.indicators.map((p) => (
              <div key={p.concept_code} className={cn("rounded border border-border bg-card p-3", zoneClass(p.zone))}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{p.series_code_native} · {p.frequency}</div>
                    <div className="text-sm font-semibold">{p.label}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold">{fmt(p.latest_value, 2)}</div>
                    <div className="text-[10px] text-muted-foreground">{p.latest_date ?? "—"}</div>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                  <div><div className="text-muted-foreground">MoM</div><div className="font-mono">{fmt(p.metrics.mom, 2, "%")}</div></div>
                  <div><div className="text-muted-foreground">YoY</div><div className="font-mono">{fmt(p.metrics.yoy, 2, "%")}</div></div>
                  <div><div className="text-muted-foreground">3m ann.</div><div className="font-mono">{fmt(p.metrics.chg3mAnn, 2, "%")}</div></div>
                  <div><div className="text-muted-foreground">6m ann.</div><div className="font-mono">{fmt(p.metrics.chg6mAnn, 2, "%")}</div></div>
                  <div><div className="text-muted-foreground">Accel</div><div className="font-mono">{fmt(p.metrics.acceleration, 2)}</div></div>
                  <div><div className="text-muted-foreground">z-score</div><div className="font-mono">{fmt(p.metrics.zscoreHistorical, 2)}</div></div>
                  <div><div className="text-muted-foreground">Pctl</div><div className="font-mono">{fmt(p.metrics.percentileHistorical, 0, "%")}</div></div>
                  <div><div className="text-muted-foreground">vs target</div><div className="font-mono">{fmt(p.metrics.distanceFromTarget, 2)}</div></div>
                  <div><div className="text-muted-foreground">Kalman</div><div className="font-mono">{fmt(p.kalman?.level ?? null, 2)}</div></div>
                </div>
                {p.latest_revision && (
                  <div className="mt-2 rounded bg-muted/50 p-1.5 text-[10px]">
                    Revised {p.latest_revision.observation_date}: {fmt(p.latest_revision.previous_value, 2)} → {fmt(p.latest_revision.revised_value, 2)}
                  </div>
                )}
                <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{p.vintage_quality ?? "snapshot"} · {p.calcVersion}</span>
                  <span>{p.target ? `target ${p.target.band[0]}–${p.target.band[1]} ${p.target.unit}` : ""}</span>
                </div>
              </div>
            ))}
          </div>

          {data.latestRun && (
            <div className="mt-4 text-[11px] text-muted-foreground">
              Latest Kalman run: {data.latestRun.status} · {data.latestRun.model_version} · started {new Date(data.latestRun.started_at).toISOString().slice(0, 16).replace("T", " ")}
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}