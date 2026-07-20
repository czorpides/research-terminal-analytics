import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { PanelGrid } from "@/components/research/PanelGrid";
import { getPanelsForSection } from "@/lib/panels/mocks";

export const Route = createFileRoute("/screeners")({
  head: () => ({ meta: [
    { title: "Screeners — Research Terminal" },
    { name: "description", content: "Filter stocks, industries, commodities and assets against the validated analytics layer." },
  ]}),
  component: Screeners,
});

function Screeners() {
  return (
    <AppShell>
      <SectionHeader
        code="SC · Screeners"
        title="Which subjects match a specific research thesis?"
        purpose="Composable filters across factors, fundamentals, sensitivity and alt data — with every filter's confidence penalty visible."
      />
      <PanelGrid panels={getPanelsForSection("screeners")} />
    </AppShell>
  );
}