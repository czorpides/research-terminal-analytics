import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { getInflationEngine, getGrowthInflationMap, type InflationEnginePayload, type GrowthInflationMapData } from "@/lib/panels/inflation.functions";
import { GrowthInflationMap } from "@/components/research/GrowthInflationMap";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/macro/inflation")({
  head: () => ({ meta: [
    { title: "US Inflation Engine — Research Terminal" },
    { name: "description", content: "CPI, PCE, PPI, wages, shelter, import prices, expectations and freight with a family-capped Inflation Pressure Score." },
    { property: "og:title", content: "US Inflation Engine" },
    { property: "og:description", content: "Deterministic transforms, Kalman trends and a level/direction/breadth inflation score with contribution ledger." },
  ]}),
  component: InflationEngine,
});

function fmt(n: number | null, digits = 2, suffix = ""): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n.toFixed(digits)}${suffix}`;
}

function signed(n: number, digits = 1): string {
  return `${n > 0 ? "+" : ""}${n.toFixed(digits)}`;
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
  const { data, isLoading, error } = useQuery<InflationEnginePayload>({ queryKey: ["inflation-engine"], queryFn: () => engine(), refetchOnWindowFocus: false });
  const { data: mapData } = useQuery<GrowthInflationMapData>({ queryKey: ["growth-inflation-map"], queryFn: () => map(), refetchOnWindowFocus: false });

  return (
    <AppShell>
      <SectionHeader
        code="MA · US Inflation Engine"
        title="What is the level, breadth and direction of US inflation?"
        purpose="Official price, wage, shelter, expectation and freight series with deterministic transforms, Kalman trends and a family-capped pressure model."
      />
      {isLoading && <div className="text-xs text-muted-foreground">Loading inflation engine…</div>}
      {error && <div className="text-xs text-[var(--negative)]">Failed to load: {(error as Error).message}</div>}

      {data && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded border border-border bg-card p-3">
              <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Pressure level</div>
              <div className="mt-1 text-3xl font-semibold">{data.pressure.score.toFixed(1)}</div>
              <div className="text-xs capitalize text-muted-foreground">{data.pressure.regime.replace("_", " ")}</div>
            </div>
            <div className="rounded border border-border bg-card p-3">
              <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Direction score</div>
              <div className="mt-1 text-3xl font-semibold">{data.pressure.directionScore.toFixed(1)}</div>
              <div className="text-xs text-muted-foreground">50 neutral · below 50 disinflationary</div>
            </div>
            <div className="rounded border border-border bg-card p-3">
              <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Breadth score</div>
              <div className="mt-1 text-3xl font-semibold">{data.pressure.breadthScore.toFixed(1)}</div>
              <div className="text-xs text-muted-foreground">Higher means pressure is more widespread</div>
            </div>
            <div className="rounded border border-border bg-card p-3">
              <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Model confidence</div>
              <div className="mt-1 text-3xl font-semibold">{data.pressure.confidence.toFixed(1)}%</div>
              <div className="text-xs text-muted-foreground">Falls when configured components are unavailable</div>
            </div>
          </div>

          <div className="mb-4 grid gap-3 xl:grid-cols-[2fr_1fr]">
            <div className="rounded border border-border bg-card p-3">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Signed contribution ledger</div>
              <div className="grid gap-1 text-xs">
                {data.pressure.contributions.map((contribution) => (
                  <div key={contribution.key} className="border-b border-border/50 py-2 last:border-b-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-foreground">{contribution.label}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {contribution.family.replaceAll("_", " ")} · {contribution.metric} · target {contribution.target ?? "—"} · effective weight {(contribution.weight * 100).toFixed(1)}%
                        </div>
                      </div>
                      <div className="w-16 text-right font-mono">{fmt(contribution.value, 2)}</div>
                      <div className={cn(
                        "w-16 text-right font-mono",
                        contribution.points > 0.25 ? "text-[var(--negative)]" : contribution.points < -0.25 ? "text-[var(--positive)]" : "text-muted-foreground",
                      )}>
                        {signed(contribution.points)}
                      </div>
                    </div>
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      level {signed(contribution.levelPoints)} · direction {signed(contribution.directionPoints)} · acceleration {signed(contribution.accelerationPoints)}
                      {contribution.trend3m != null ? ` · 3m direction ${signed(contribution.trend3m, 2)} pp` : ""}
                    </div>
                    {contribution.detail && <div className="mt-1 text-[10px] text-muted-foreground">{contribution.detail}</div>}
                  </div>
                ))}
              </div>
              <div className="mt-2 text-[10px] text-muted-foreground">calc {data.pressure.calcVersion} · {new Date(data.pressure.computedAt).toISOString().slice(0, 10)}</div>
            </div>

            <div className="grid gap-3">
              <div className="rounded border border-border bg-card p-3">
                <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Family caps</div>
                <div className="grid gap-1 text-[11px]">
                  {data.pressure.families.map((family) => (
                    <div key={family.family} className="flex items-center justify-between border-b border-border/40 py-1 last:border-b-0">
                      <span className="capitalize">{family.family.replaceAll("_", " ")}</span>
                      <span className="font-mono text-muted-foreground">cap {(family.cap * 100).toFixed(0)}% · active {(family.effectiveWeight * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded border border-border bg-card p-3">
                <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Calibration checks</div>
                <div className="mt-2 grid gap-1 text-[11px]">
                  <div className="flex justify-between"><span>Weight-profile range</span><span className="font-mono">{data.pressure.diagnostics.scoreRange[0].toFixed(1)}–{data.pressure.diagnostics.scoreRange[1].toFixed(1)}</span></div>
                  <div className="flex justify-between"><span>Historical min / median / max</span><span className="font-mono">{fmt(data.calibration.summary.min, 1)} / {fmt(data.calibration.summary.median, 1)} / {fmt(data.calibration.summary.max, 1)}</span></div>
                  <div className="flex justify-between"><span>Missing configured inputs</span><span className="font-mono">{data.pressure.diagnostics.missingKeys.length}</span></div>
                </div>
                <div className="mt-2 text-[10px] text-muted-foreground">{data.calibration.note}</div>
              </div>
            </div>
          </div>

          <div className="mb-3 text-[11px] text-muted-foreground">
            Target breadth: {data.breadth.above_target} above · {data.breadth.on_target} on target · {data.breadth.below_target} below · {data.breadth.unknown} unknown
          </div>

          {mapData && <div className="mb-4"><GrowthInflationMap data={mapData} /></div>}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.indicators.map((panel) => (
              <div key={panel.concept_code} className={cn("rounded border border-border bg-card p-3", zoneClass(panel.zone))}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{panel.series_code_native} · {panel.frequency}</div>
                    <div className="text-sm font-semibold">{panel.label}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold">{fmt(panel.latest_value, 2)}</div>
                    <div className="text-[10px] text-muted-foreground">{panel.latest_date ?? "—"}</div>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                  <div><div className="text-muted-foreground">MoM</div><div className="font-mono">{fmt(panel.metrics.mom, 2, "%")}</div></div>
                  <div><div className="text-muted-foreground">YoY</div><div className="font-mono">{fmt(panel.metrics.yoy, 2, "%")}</div></div>
                  <div><div className="text-muted-foreground">Reference</div><div className="font-mono">{fmt(panel.metrics.referenceRate, 2, "%")}</div></div>
                  <div><div className="text-muted-foreground">3m ann.</div><div className="font-mono">{fmt(panel.metrics.chg3mAnn, 2, "%")}</div></div>
                  <div><div className="text-muted-foreground">3m direction</div><div className="font-mono">{fmt(panel.metrics.trend3m, 2, "pp")}</div></div>
                  <div><div className="text-muted-foreground">3m acceleration</div><div className="font-mono">{fmt(panel.metrics.acceleration3m, 2, "pp")}</div></div>
                  <div><div className="text-muted-foreground">z-score</div><div className="font-mono">{fmt(panel.metrics.zscoreHistorical, 2)}</div></div>
                  <div><div className="text-muted-foreground">Pctl</div><div className="font-mono">{fmt(panel.metrics.percentileHistorical, 0, "%")}</div></div>
                  <div><div className="text-muted-foreground">vs target</div><div className="font-mono">{fmt(panel.metrics.distanceFromTarget, 2)}</div></div>
                  <div><div className="text-muted-foreground">Kalman level</div><div className="font-mono">{fmt(panel.kalman?.level ?? null, 2)}</div></div>
                  <div><div className="text-muted-foreground">Kalman slope</div><div className="font-mono">{fmt(panel.kalman?.slope ?? null, 3)}</div></div>
                </div>
                {panel.latest_revision && (
                  <div className="mt-2 rounded bg-muted/50 p-1.5 text-[10px]">
                    Revised {panel.latest_revision.observation_date}: {fmt(panel.latest_revision.previous_value, 2)} → {fmt(panel.latest_revision.revised_value, 2)}
                  </div>
                )}
                <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{panel.vintage_quality ?? "snapshot"} · {panel.calcVersion}</span>
                  <span>{panel.target ? `target ${panel.target.band[0]}–${panel.target.band[1]} ${panel.target.unit}` : ""}</span>
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
