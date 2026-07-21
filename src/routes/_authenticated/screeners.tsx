import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { PanelGrid } from "@/components/research/PanelGrid";
import { getScreenerPanels } from "@/lib/panels/screeners.functions";

const screenersQueryOptions = queryOptions({
  queryKey: ["panels", "screeners"],
  queryFn: () => getScreenerPanels(),
});

export const Route = createFileRoute("/screeners")({
  head: () => ({ meta: [
    { title: "Screeners — Research Terminal" },
    { name: "description", content: "Filter stocks, industries, commodities and assets against the validated analytics layer." },
  ]}),
  loader: ({ context }) => context.queryClient.ensureQueryData(screenersQueryOptions),
  component: Screeners,
});

function Screeners() {
  const { data: panels } = useSuspenseQuery(screenersQueryOptions);
  return (
    <AppShell>
      <SectionHeader
        code="SC · Screeners"
        title="Which subjects match a specific research thesis?"
        purpose="Composable filters across factors, fundamentals, sensitivity and alt data — with every filter's confidence penalty visible."
      />
      <PanelGrid panels={panels} />
    </AppShell>
  );
}