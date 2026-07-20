import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { PanelGrid } from "@/components/research/PanelGrid";
import { getPanelsForSection } from "@/lib/panels/mocks";

export const Route = createFileRoute("/alt-data")({
  head: () => ({ meta: [
    { title: "Alternative Data — Research Terminal" },
    { name: "description", content: "Web, satellite, hiring, patents and other alt signals — always penalised for provenance and freshness." },
  ]}),
  component: AltData,
});

function AltData() {
  return (
    <AppShell>
      <SectionHeader
        code="AD · Alternative Data"
        title="What are non-traditional signals saying?"
        purpose="Alt data is a Tier 4 input by default: every signal carries a visible confidence penalty and links to the raw payload."
      />
      <PanelGrid panels={getPanelsForSection("alt-data")} />
    </AppShell>
  );
}