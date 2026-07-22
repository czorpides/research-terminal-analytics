import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { getRegimeMonitor } from "@/lib/panels/regime.functions";

export const Route = createFileRoute("/_authenticated/macro/regime")({
  head: () => ({ meta: [{ title: "US Regime Monitor — Research Terminal" }] }),
  component: RegimeMonitor,
});

const LABELS = {
  growth: "Growth",
  inflation: "Inflation pressure",
  liquidityStress: "Financial conditions",
  labourHeat: "Labour heat",
  marketStress: "Market stress",
} as const;

function RegimeMonitor() {
  const load = useServerFn(getRegimeMonitor);
  const { data, error, isLoading } = useQuery({
    queryKey: ["regime-monitor"],
    queryFn: () => load(),
    refetchOnWindowFocus: false,
  });
  return (
    <AppShell>
      <SectionHeader
        code="MA · Phase 5 · Regime"
        title="What regime are the five US engines describing?"
        purpose="A cross-engine state call with visible inputs, confidence and shadow HMM probabilities, designed to direct research rather than make trades."
      />
      {isLoading && <div className="text-xs text-muted-foreground">Loading Regime Monitor…</div>}
      {error && (
        <div className="text-xs text-[var(--negative)]">
          Failed to load: {(error as Error).message}
        </div>
      )}
      {data && (
        <>
          <div className="mb-4 grid gap-3 md:grid-cols-4">
            <Card
              label="Current regime"
              value={data.current.label.replaceAll("_", " ")}
              sub={data.current.methodology}
            />
            <Card
              label="Confidence"
              value={`${data.current.confidence}%`}
              sub="coverage × classification"
            />
            <Card
              label="HMM status"
              value={data.hmm.status === "shadow" ? "Shadow" : "Not run"}
              sub={data.hmm.version ?? "awaiting pipeline"}
            />
            <Card
              label="HMM state"
              value={data.hmm.label?.replaceAll("_", " ") ?? "—"}
              sub={data.hmm.asOf ?? "no state"}
            />
          </div>
          <div className="mb-4 grid gap-3 md:grid-cols-5">
            {Object.entries(data.inputs).map(([key, value]) => (
              <Card
                key={key}
                label={LABELS[key as keyof typeof LABELS]}
                value={value?.toFixed(2) ?? "—"}
                sub={
                  value == null
                    ? "missing"
                    : value > 0.5
                      ? "high"
                      : value < -0.5
                        ? "low"
                        : "neutral"
                }
              />
            ))}
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded border border-border bg-card p-3">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Rules-based probabilities
              </div>
              {Object.entries(data.current.probabilities)
                .sort((a, b) => b[1] - a[1])
                .map(([label, probability]) => (
                  <Probability key={label} label={label} probability={probability} />
                ))}
            </div>
            <div className="rounded border border-border bg-card p-3">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Shadow HMM probabilities
              </div>
              {Object.keys(data.hmm.probabilities).length ? (
                Object.entries(data.hmm.probabilities)
                  .sort((a, b) => b[1] - a[1])
                  .map(([label, probability]) => (
                    <Probability key={label} label={label} probability={probability} />
                  ))
              ) : (
                <div className="text-xs text-muted-foreground">
                  Run the Phase 5 model pipeline after ingest to populate shadow probabilities.
                </div>
              )}
            </div>
          </div>
          <p className="mt-4 text-[11px] text-muted-foreground">{data.note}</p>
        </>
      )}
    </AppShell>
  );
}

function Probability({ label, probability }: { label: string; probability: number }) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-border/50 py-2 text-xs last:border-0">
      <span className="capitalize">{label.replaceAll("_", " ")}</span>
      <span className="font-mono">{(probability * 100).toFixed(1)}%</span>
    </div>
  );
}
function Card({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded border border-border bg-card p-3">
      <div className="font-mono text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold capitalize">{value}</div>
      <div className="text-[11px] text-muted-foreground">{sub}</div>
    </div>
  );
}
