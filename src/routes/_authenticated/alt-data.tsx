import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { PanelGrid } from "@/components/research/PanelGrid";
import { getAltDataPanels } from "@/lib/panels/alt-data.functions";

const altDataQuery = queryOptions({
  queryKey: ["panels", "alt-data"],
  queryFn: () => getAltDataPanels(),
});

export const Route = createFileRoute("/alt-data")({
  head: () => ({ meta: [
    { title: "Alternative Data — Research Terminal" },
    { name: "description", content: "Web, satellite, hiring, patents and other alt signals — always penalised for provenance and freshness." },
  ]}),
  loader: ({ context }) => context.queryClient.ensureQueryData(altDataQuery),
  component: AltData,
});

function AltData() {
  const { data: panels } = useSuspenseQuery(altDataQuery);
  return (
    <AppShell>
      <SectionHeader
        code="AD · Alternative Data"
        title="What are non-traditional signals saying?"
        purpose="Alt data is a Tier 4 input by default: every signal carries a visible confidence penalty and links to the raw payload."
      />
      <PanelGrid panels={panels} />
    </AppShell>
  );
}