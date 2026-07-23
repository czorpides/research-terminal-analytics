import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { BandBar, InfoTip, ResearchNarrative } from "@/components/research/ResearchContext";
import { getMacroHealth } from "@/lib/panels/macro-health.functions";

const macroHealthQueryOptions = queryOptions({
  queryKey: ["macro", "model-health", "v1"],
  queryFn: () => getMacroHealth(),
  staleTime: 2 * 60 * 1000,
  refetchInterval: 15 * 60 * 1000,
  refetchOnWindowFocus: true,
});

export const Route = createFileRoute("/_authenticated/macro/model-health")({
  head: () => ({
    meta: [
      { title: "Macro Model Health — Research Terminal" },
      {
        name: "description",
        content: "Live data coverage, freshness, history depth and model-run health.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(macroHealthQueryOptions),
  component: MacroModelHealth,
});

function MacroModelHealth() {
  const { data } = useSuspenseQuery(macroHealthQueryOptions);
  const weakest = [...data.engines].sort((a, b) => a.reliabilityPct - b.reliabilityPct)[0];
  const successfulModels = data.models.filter(
    (model) => model.status === "success" || model.status === "partial",
  ).length;
  return (
    <AppShell>
      <SectionHeader
        code="MA · Model Health"
        title="Can the macro evidence be trusted right now?"
        purpose="Live coverage, freshness, history depth and model runs, translated into a transparent reliability score."
      />

      <div className="mb-4">
        <ResearchNarrative
          summary={`Overall macro reliability is ${data.overallReliability.toFixed(0)}%. ${weakest ? `${title(weakest.engine)} is currently the weakest engine at ${weakest.reliabilityPct.toFixed(0)}%.` : "No active engine evidence is available."}`}
          detail={data.explanation}
          watch={[
            weakest
              ? `${title(weakest.engine)}: ${weakest.fresh} of ${weakest.registered} indicators are within their expected release window.`
              : "Check that the US indicator registry is configured.",
            `${successfulModels} recent model runs are successful or usable.`,
            "A low freshness score may simply mean the official monthly or quarterly release is not due yet.",
          ]}
          asOf={data.computedAt}
          confidence={data.overallReliability}
        />
      </div>

      <section className="mb-4 rounded border border-border/70 bg-card/60 p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Engine reliability</h2>
          <InfoTip label="Reliability formula" explanation={data.explanation} />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {data.engines.map((engine) => (
            <article key={engine.engine} className="rounded border border-border/60 p-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">{title(engine.engine)}</h3>
                <span className="font-mono text-lg">{engine.reliabilityPct.toFixed(0)}%</span>
              </div>
              <div className="mt-2">
                <BandBar
                  value={engine.reliabilityPct}
                  explanation="Red is weak evidence, yellow needs attention and green is broadly dependable."
                />
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center font-mono text-[10px]">
                <HealthItem label="Has data" value={`${engine.withData}/${engine.registered}`} />
                <HealthItem
                  label="Enough history"
                  value={`${engine.eligible}/${engine.registered}`}
                />
                <HealthItem label="Current" value={`${engine.fresh}/${engine.registered}`} />
              </dl>
              <div className="mt-2 text-[10px] text-muted-foreground">
                Latest observation: {engine.latestObservation ?? "none"}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded border border-border/70 bg-card/60 p-3">
        <h2 className="mb-1 text-sm font-semibold">Recent model runs</h2>
        <p className="mb-3 text-[11px] text-muted-foreground">
          Transparent rules remain the live decision aids. Noise-filtered trends and experimental
          comparisons are shown here so failed or stale runs cannot remain hidden.
        </p>
        <div className="grid gap-2 md:grid-cols-2">
          {data.models.map((model) => (
            <article key={model.key} className="rounded border border-border/60 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold">{model.label}</div>
                  <div className="mt-0.5 font-mono text-[9px] text-muted-foreground">
                    {model.version ?? "version unavailable"}
                  </div>
                </div>
                <span className={statusClass(model.status)}>{plainStatus(model.status)}</span>
              </div>
              <div className="mt-2 text-[10px] text-muted-foreground">
                Last started {new Date(model.startedAt).toLocaleString()}
              </div>
            </article>
          ))}
          {data.models.length === 0 && (
            <div className="text-xs text-muted-foreground">No recent macro model runs found.</div>
          )}
        </div>
      </section>
    </AppShell>
  );
}

function HealthItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-background/40 p-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-foreground">{value}</dd>
    </div>
  );
}

function title(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function plainStatus(value: string): string {
  if (value === "success") return "Healthy";
  if (value === "partial") return "Usable with gaps";
  if (value === "running") return "Running";
  return "Needs attention";
}

function statusClass(value: string): string {
  const colour =
    value === "success"
      ? "border-[var(--positive)]/40 text-[var(--positive)]"
      : value === "partial" || value === "running"
        ? "border-[var(--warning)]/40 text-[var(--warning)]"
        : "border-[var(--negative)]/40 text-[var(--negative)]";
  return `rounded border px-2 py-0.5 font-mono text-[9px] uppercase ${colour}`;
}
