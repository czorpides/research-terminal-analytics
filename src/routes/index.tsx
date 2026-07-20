import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { PanelGrid } from "@/components/research/PanelGrid";
import { getPanelsForSection } from "@/lib/panels/mocks";

export const Route = createFileRoute("/")({
  component: CommandCentre,
});

function CommandCentre() {
  return (
    <AppShell>
      <SectionHeader
        code="CC · Command Centre"
        title="Where should I research next?"
        purpose="Highest-priority observations, upcoming catalysts and the current regime — every score auditable, every deduction visible."
      />
      <PanelGrid panels={getPanelsForSection("command")} />
    </AppShell>
  );
}
