import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { getLabourEngine } from "@/lib/panels/labour.functions";

export const Route = createFileRoute("/_authenticated/macro/labour")({
  head: () => ({ meta: [{ title: "US Labour Engine — Research Terminal" }] }),
  component: LabourEngine,
});

function LabourEngine() {
  const load = useServerFn(getLabourEngine);
  const { data, error, isLoading } = useQuery({
    queryKey: ["labour-engine"],
    queryFn: () => load(),
    refetchOnWindowFocus: false,
  });
  return (
    <AppShell>
      <SectionHeader
        code="MA · Phase 4 · US Labour"
        title="Is the US labour market heating, balanced or breaking?"
        purpose="Employment momentum, labour slack, worker demand and wage pressure, standardised into one auditable cycle score."
      />
      {isLoading && <div className="text-xs text-muted-foreground">Loading Labour Engine…</div>}
      {error && (
        <div className="text-xs text-[var(--negative)]">
          Failed to load: {(error as Error).message}
        </div>
      )}
      {data && (
        <>
          <div className="mb-4 grid gap-3 md:grid-cols-4 xl:grid-cols-7">
            <Card
              label="Labour heat"
              value={data.score.score?.toFixed(2) ?? "—"}
              sub={data.score.regime}
            />
            <Card label="Coverage" value={`${data.score.confidence}%`} sub="configured weight" />
            <Card
              label="Kalman"
              value={data.kalman.status}
              sub={data.kalman.version ?? "not run"}
            />
            {(["employment", "slack", "demand", "wages"] as const).map((family) => (
              <Card
                key={family}
                label={family}
                value={data.score.familyScores[family]?.toFixed(2) ?? "—"}
                sub="family z-score"
              />
            ))}
          </div>
          <div className="mb-4 rounded border border-border bg-card p-3">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Contribution ledger
            </div>
            {data.score.components.map((component) => (
              <div
                key={component.key}
                className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-border/50 py-2 text-xs last:border-0"
              >
                <span>
                  {component.label}{" "}
                  <span className="text-muted-foreground">· {component.family}</span>
                </span>
                <span className="font-mono text-muted-foreground">
                  z {component.zScore?.toFixed(2) ?? "—"} ·{" "}
                  {(component.effectiveWeight * 100).toFixed(0)}%
                </span>
                <span className="font-mono">{component.contribution?.toFixed(2) ?? "—"}</span>
              </div>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.indicators.map((indicator) => (
              <div key={indicator.concept} className="rounded border border-border bg-card p-3">
                <div className="font-mono text-[10px] text-muted-foreground">
                  {indicator.series} · {indicator.frequency}
                </div>
                <div className="text-sm font-semibold">{indicator.label}</div>
                <div className="mt-2 text-xl font-semibold">
                  {indicator.latest?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? "—"}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {indicator.date ?? "—"} · previous{" "}
                  {indicator.previous?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ??
                    "—"}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[11px] text-muted-foreground">
            {data.note} · {data.score.methodology}
          </p>
        </>
      )}
    </AppShell>
  );
}

function Card({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded border border-border bg-card p-3">
      <div className="font-mono text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      <div className="text-[11px] capitalize text-muted-foreground">{sub}</div>
    </div>
  );
}
