import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { getMarketEngine } from "@/lib/panels/market.functions";

export const Route = createFileRoute("/_authenticated/macro/market")({
  head: () => ({ meta: [{ title: "US Market Engine — Research Terminal" }] }),
  component: MarketEngine,
});

function MarketEngine() {
  const load = useServerFn(getMarketEngine);
  const { data, error, isLoading } = useQuery({
    queryKey: ["market-engine"],
    queryFn: () => load(),
    refetchOnWindowFocus: false,
  });
  return (
    <AppShell>
      <SectionHeader
        code="MA · Phase 5 · US Market"
        title="Are markets confirming or contradicting the macro picture?"
        purpose="Equities, volatility, credit, real yields, the dollar and commodities compressed into transparent stress plus a shadow co-movement factor."
      />
      {isLoading && <div className="text-xs text-muted-foreground">Loading Market Engine…</div>}
      {error && (
        <div className="text-xs text-[var(--negative)]">
          Failed to load: {(error as Error).message}
        </div>
      )}
      {data && (
        <>
          <div className="mb-4 grid gap-3 md:grid-cols-4">
            <Card
              label="Market stress"
              value={data.score.score?.toFixed(2) ?? "—"}
              sub={data.score.regime.replaceAll("_", " ")}
            />
            <Card label="Coverage" value={`${data.score.confidence}%`} sub="configured weight" />
            <Card
              label="PCA diagnostic"
              value={data.pca.status === "shadow" ? "Shadow" : "Not run"}
              sub={data.pca.version ?? "awaiting pipeline"}
            />
            <Card
              label="Factor variance"
              value={
                data.pca.explainedVariance == null
                  ? "—"
                  : `${(data.pca.explainedVariance * 100).toFixed(1)}%`
              }
              sub={data.pca.label}
            />
          </div>
          <div className="mb-4 rounded border border-border bg-card p-3">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Stress contribution ledger
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
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {data.indicators.map((indicator) => (
              <div key={indicator.concept} className="rounded border border-border bg-card p-3">
                <div className="font-mono text-[10px] text-muted-foreground">
                  {indicator.series} · {indicator.frequency}
                </div>
                <div className="text-sm font-semibold">{indicator.label}</div>
                <div className="mt-2 text-xl font-semibold">
                  {indicator.latest?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? "—"}
                </div>
                <div className="text-[11px] text-muted-foreground">{indicator.date ?? "—"}</div>
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
