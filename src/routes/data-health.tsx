import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { PanelGrid } from "@/components/research/PanelGrid";
import { getPanelsForSection } from "@/lib/panels/mocks";
import { SOURCE_TIER_META } from "@/lib/reliability/tiers";
import { DEFAULT_FRESHNESS } from "@/lib/reliability/freshness";

export const Route = createFileRoute("/data-health")({
  head: () => ({ meta: [
    { title: "Data Health — Research Terminal" },
    { name: "description", content: "Source tiers, freshness policies, ingestion runs and model governance." },
  ]}),
  component: DataHealth,
});

function DataHealth() {
  return (
    <AppShell>
      <SectionHeader
        code="DH · Data Health & Governance"
        title="Is the underlying data trustworthy right now?"
        purpose="The reliability framework driving every panel's confidence score. Owner-only administration lives here."
      />
      <PanelGrid panels={getPanelsForSection("data-health")} />

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <section className="rounded-md border border-border/70 bg-card/60 p-3">
          <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Source hierarchy (spec §19)
          </h2>
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase text-muted-foreground">
              <tr className="border-b border-border/60"><th className="py-1 text-left">Tier</th><th className="text-left">Description</th><th className="text-right">Weight</th></tr>
            </thead>
            <tbody className="font-mono">
              {Object.entries(SOURCE_TIER_META).map(([k, v]) => (
                <tr key={k} className="border-b border-border/40 last:border-b-0">
                  <td className="py-1 pr-2">{v.label}</td>
                  <td className="pr-2 text-muted-foreground">{v.description}</td>
                  <td className="text-right tabular-nums">{v.weight.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rounded-md border border-border/70 bg-card/60 p-3">
          <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Freshness policies
          </h2>
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase text-muted-foreground">
              <tr className="border-b border-border/60"><th className="py-1 text-left">Category</th><th className="text-right">Warn</th><th className="text-right">Max</th></tr>
            </thead>
            <tbody className="font-mono">
              {Object.entries(DEFAULT_FRESHNESS).map(([k, v]) => (
                <tr key={k} className="border-b border-border/40 last:border-b-0">
                  <td className="py-1 pr-2">{k}</td>
                  <td className="text-right tabular-nums">{formatDur(v.warnAgeSeconds)}</td>
                  <td className="text-right tabular-nums">{formatDur(v.maxAgeSeconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </AppShell>
  );
}

function formatDur(s: number): string {
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}