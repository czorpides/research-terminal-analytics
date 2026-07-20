import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { PanelGrid } from "@/components/research/PanelGrid";
import { getPanelsForSection } from "@/lib/panels/mocks";

export const Route = createFileRoute("/history")({
  head: () => ({ meta: [
    { title: "Historical Events — Research Terminal" },
    { name: "description", content: "Event studies and sensitivity matrix: distributions of forward returns after comparable episodes." },
  ]}),
  component: HistoryPage,
});

function HistoryPage() {
  return (
    <AppShell>
      <SectionHeader
        code="HE · Historical Events"
        title="What happened last time this environment appeared?"
        purpose="Similarity search across regimes with forward-return distributions, hit rates, sample sizes and confidence penalties for thin samples."
      />
      <PanelGrid panels={getPanelsForSection("history")} />
    </AppShell>
  );
}