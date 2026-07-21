import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { PanelGrid } from "@/components/research/PanelGrid";
import { getOvervaluationPanels } from "@/lib/panels/overvaluation.functions";

const ovQueryOptions = queryOptions({
  queryKey: ["panels", "overvaluation"],
  queryFn: () => getOvervaluationPanels(),
});

export const Route = createFileRoute("/_authenticated/overvaluation")({
  head: () => ({ meta: [
    { title: "Overvaluation Radar — Research Terminal" },
    { name: "description", content: "Risk-ranked equities where momentum, trend and volatility all point the wrong way." },
  ]}),
  loader: ({ context }) => context.queryClient.ensureQueryData(ovQueryOptions),
  component: Overvaluation,
});

function Overvaluation() {
  const { data: panels } = useSuspenseQuery(ovQueryOptions);
  return (
    <AppShell>
      <SectionHeader
        code="OV · Overvaluation Radar"
        title="Which names carry the most downside evidence right now?"
        purpose="Symmetric to Opportunity Radar. Same deterministic inputs, inverted ranking. Not a short recommendation — a research prompt with every deduction visible."
      />
      <PanelGrid panels={panels} />
    </AppShell>
  );
}