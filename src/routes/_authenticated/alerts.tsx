import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { PanelGrid } from "@/components/research/PanelGrid";
import { getPanelsForSection } from "@/lib/panels/mocks";

export const Route = createFileRoute("/_authenticated/alerts")({
  head: () => ({ meta: [
    { title: "Alerts — Research Terminal" },
    { name: "description", content: "Deterministic alert rules and firing history with the exact evaluation that fired them." },
  ]}),
  component: Alerts,
});

function Alerts() {
  return (
    <AppShell>
      <SectionHeader
        code="AL · Alerts"
        title="What has crossed a threshold you care about?"
        purpose="Owner-defined conditions on any tracked metric. Every fired alert stores the inputs, formula and confidence at firing time."
      />
      <PanelGrid panels={getPanelsForSection("alerts")} />
    </AppShell>
  );
}