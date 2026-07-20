import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { PanelGrid } from "@/components/research/PanelGrid";
import { getPanelsForSection } from "@/lib/panels/mocks";

export const Route = createFileRoute("/macro")({
  head: () => ({ meta: [
    { title: "Macro — Research Terminal" },
    { name: "description", content: "Growth pulse, inflation pulse, liquidity, real yields and release surprises." },
  ]}),
  component: Macro,
});

function Macro() {
  return (
    <AppShell>
      <SectionHeader
        code="MA · Macroeconomic Environment"
        title="What is the macro backdrop today?"
        purpose="Growth, inflation, policy, liquidity and release surprises — with the transmission mechanism to assets, industries and factors."
      />
      <PanelGrid panels={getPanelsForSection("macro")} />
    </AppShell>
  );
}