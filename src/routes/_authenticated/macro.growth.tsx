import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { getGrowthEngine, type GrowthRegion, type GrowthIndicatorRow } from "@/lib/panels/growth-engine.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/macro/growth")({
  head: () => ({ meta: [
    { title: "Growth Engine — Macro — Research Terminal" },
    { name: "description", content: "Real GDP, industrial production, retail sales, new orders and business survey — compressed into a latent growth factor per region." },
  ]}),
  component: GrowthEnginePage,
});

const REGIONS: { id: GrowthRegion; label: string; status: "active" | "planned" }[] = [
  { id: "US", label: "United States", status: "active"  },
  { id: "UK", label: "United Kingdom", status: "planned" },
  { id: "EA", label: "Euro area",      status: "planned" },
];

function GrowthEnginePage() {
  const [region, setRegion] = useState<GrowthRegion>("US");
  const fetchGrowth = useServerFn(getGrowthEngine);
  const { data, isLoading, error } = useQuery({
    queryKey: ["growth-engine", region],
    queryFn: () => fetchGrowth({ data: { region } }),
    refetchOnWindowFocus: false,
  });

  return (
    <AppShell>
      <SectionHeader
        code="Macro · Stage 1 · Growth Engine"
        title={`${data?.regionLabel ?? region} Growth`}
        purpose="Five official growth indicators compressed into a latent growth factor. Raw observations here; Kalman level + slope arrive once the Python analytics service is live."
      />

      <div className="mb-4 flex flex-wrap gap-1.5 font-mono text-[10px] uppercase tracking-wider">
        {REGIONS.map((r) => (
          <button
            key={r.id}
            type="button"
            disabled={r.status === "planned"}
            onClick={() => setRegion(r.id)}
            className={cn(
              "rounded-sm border px-3 py-1 transition-colors",
              region === r.id
                ? "border-[var(--primary)] text-foreground"
                : "border-border/70 text-muted-foreground hover:border-foreground hover:text-foreground",
              r.status === "planned" && "cursor-not-allowed opacity-40",
            )}
          >
            {r.label}
            {r.status === "planned" && <span className="ml-2 text-muted-foreground/60">planned</span>}
          </button>
        ))}
      </div>

      {isLoading && <div className="font-mono text-xs text-muted-foreground">Loading…</div>}
      {error && <div className="font-mono text-xs text-[var(--negative)]">{String((error as Error).message)}</div>}

      {data && (
        <div className="space-y-6">
          <IndicatorTable rows={data.indicators} />
          <ModelStatus status={data.modelStatus} />
        </div>
      )}
    </AppShell>
  );
}

function IndicatorTable({ rows }: { rows: GrowthIndicatorRow[] }) {
  return (
    <div className="rounded-sm border border-border/70 bg-card/40">
      <div className="border-b border-border/70 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Registered indicators · {rows.length}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/70 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2">Concept</th>
              <th className="px-3 py-2">Series</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Freq</th>
              <th className="px-3 py-2 text-right">Latest</th>
              <th className="px-3 py-2 text-right">As of</th>
              <th className="px-3 py-2 text-right">Obs</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.concept_code} className="border-b border-border/50 last:border-0">
                <td className="px-3 py-2">
                  <div className="font-medium">{r.name}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">{r.concept_code} · {r.transform_default}</div>
                </td>
                <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">{r.series_code_native}</td>
                <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">{r.source ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">{r.frequency}</td>
                <td className="px-3 py-2 text-right font-mono">{r.latest_value !== null ? r.latest_value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}</td>
                <td className="px-3 py-2 text-right font-mono text-[10px] text-muted-foreground">{r.latest_date ?? "—"}</td>
                <td className="px-3 py-2 text-right font-mono text-[10px] text-muted-foreground">{r.observation_count.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ModelStatus({ status }: { status: { kalman: { available: boolean; message: string }; factor: { available: boolean; message: string } } }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {[
        { key: "Kalman filter (level + slope)", ...status.kalman },
        { key: "PCA growth factor",             ...status.factor },
      ].map((s) => (
        <div key={s.key} className="rounded-sm border border-border/70 bg-card/40 p-3">
          <div className="flex items-center justify-between">
            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{s.key}</div>
            <span className={cn(
              "rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider",
              s.available ? "border-[var(--positive)]/40 text-[var(--positive)] bg-[var(--positive)]/10"
                          : "border-border/70 text-muted-foreground bg-muted/30",
            )}>{s.available ? "Live" : "Awaiting"}</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{s.message}</p>
        </div>
      ))}
    </div>
  );
}