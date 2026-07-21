import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { PanelGrid } from "@/components/research/PanelGrid";
import { getHistoryPanels } from "@/lib/panels/history.functions";

const historyQueryOptions = queryOptions({
  queryKey: ["panels", "history"],
  queryFn: () => getHistoryPanels(),
});

export const Route = createFileRoute("/history")({
  head: () => ({ meta: [
    { title: "Historical Events — Research Terminal" },
    { name: "description", content: "Deterministic macro-fingerprint match against a seeded library of rate cycles, oil shocks, tariff rounds, banking stress and recessions." },
  ]}),
  loader: ({ context }) => context.queryClient.ensureQueryData(historyQueryOptions),
  component: HistoryPage,
});

function HistoryPage() {
  const { data: panels } = useSuspenseQuery(historyQueryOptions);
  return (
    <AppShell>
      <SectionHeader
        code="HE · Historical Events"
        title="What happened last time this environment appeared?"
        purpose="Deterministic fingerprint match on rate level/direction, curve shape, inflation regime, oil regime and unemployment direction. Every analog links to sourced forward-return impacts by sector."
      />
      <PanelGrid panels={panels} />
    </AppShell>
  );
}