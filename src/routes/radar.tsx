import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { PanelGrid } from "@/components/research/PanelGrid";
import { getPanelsForSection } from "@/lib/panels/mocks";

export const Route = createFileRoute("/radar")({
  head: () => ({ meta: [
    { title: "Opportunity Radar — Research Terminal" },
    { name: "description", content: "Ranked research candidates. Every positive point and every deduction is visible." },
  ]}),
  component: Radar,
});

function Radar() {
  return (
    <AppShell>
      <SectionHeader
        code="OR · Opportunity Radar"
        title="Which research candidates deserve time next?"
        purpose="Deterministic scoring across anomaly, breadth, regime fit and recency. Never a recommendation to buy — always a research priority."
      />
      <PanelGrid panels={getPanelsForSection("radar")} />
    </AppShell>
  );
}