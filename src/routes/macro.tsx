import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { PanelGrid } from "@/components/research/PanelGrid";
import { getMacroPanels } from "@/lib/panels/macro.functions";

export const Route = createFileRoute("/macro")({
  head: () => ({ meta: [
    { title: "Macro — Research Terminal" },
    { name: "description", content: "Growth pulse, inflation pulse, liquidity, real yields and release surprises." },
  ]}),
  component: Macro,
});

function Macro() {
  const fetchPanels = useServerFn(getMacroPanels);
  const { data, isLoading, error } = useQuery({
    queryKey: ["macro-panels"],
    queryFn: () => fetchPanels(),
    refetchOnWindowFocus: false,
  });

  return (
    <AppShell>
      <SectionHeader
        code="MA · Macroeconomic Environment"
        title="What is the macro backdrop today?"
        purpose="Growth, inflation, policy, liquidity and release surprises — with the transmission mechanism to assets, industries and factors."
      />
      {isLoading && <div className="text-xs text-muted-foreground">Loading live FRED data…</div>}
      {error && <div className="text-xs text-[var(--negative)]">Failed to load: {(error as Error).message}</div>}
      {data && <PanelGrid panels={data} />}
    </AppShell>
  );
}