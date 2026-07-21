import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { PanelGrid } from "@/components/research/PanelGrid";
import { getRadarPanels } from "@/lib/panels/radar.functions";

const radarQueryOptions = queryOptions({
  queryKey: ["panels", "radar"],
  queryFn: () => getRadarPanels(),
});

export const Route = createFileRoute("/radar")({
  head: () => ({ meta: [
    { title: "Opportunity Radar — Research Terminal" },
    { name: "description", content: "Ranked research candidates. Every positive point and every deduction is visible." },
  ]}),
  loader: ({ context }) => context.queryClient.ensureQueryData(radarQueryOptions),
  component: Radar,
});

function Radar() {
  const { data: panels } = useSuspenseQuery(radarQueryOptions);
  return (
    <AppShell>
      <SectionHeader
        code="OR · Opportunity Radar"
        title="Which research candidates deserve time next?"
        purpose="Deterministic scoring across anomaly, breadth, regime fit and recency. Never a recommendation to buy — always a research priority."
      />
      <PanelGrid panels={panels} />
    </AppShell>
  );
}