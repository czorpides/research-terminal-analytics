import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { PanelGrid } from "@/components/research/PanelGrid";
import { getUndervaluationPanels } from "@/lib/panels/undervaluation.functions";

const uvQueryOptions = queryOptions({
  queryKey: ["panels", "undervaluation"],
  queryFn: () => getUndervaluationPanels(),
});

export const Route = createFileRoute("/undervaluation")({
  head: () => ({ meta: [
    { title: "Undervaluation Radar — Research Terminal" },
    { name: "description", content: "Weekly stable watchlist of value candidates paired with macro, commodity and alt-data catalysts." },
  ]}),
  loader: ({ context }) => context.queryClient.ensureQueryData(uvQueryOptions),
  component: Undervaluation,
});

function Undervaluation() {
  const { data: panels } = useSuspenseQuery(uvQueryOptions);
  return (
    <AppShell>
      <SectionHeader
        code="UV · Undervaluation Radar"
        title="Which cheap names are actually worth the work — with a live catalyst?"
        purpose="Weekly cadence. Names only join the list when they clearly qualify (score ≥ 70) and only leave after two consecutive weak weeks. Each panel is paired with the macro, commodity or alt-data catalysts pressuring or supporting it."
      />
      <PanelGrid panels={panels} />
    </AppShell>
  );
}