import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { PanelGrid } from "@/components/research/PanelGrid";
import { getAltDataPanels } from "@/lib/panels/alt-data.functions";

const altDataQuery = queryOptions({
  queryKey: ["panels", "alt-data"],
  queryFn: () => getAltDataPanels(),
  staleTime: 5 * 60 * 1000,
  refetchInterval: 30 * 60 * 1000,
  refetchOnWindowFocus: true,
});

export const Route = createFileRoute("/_authenticated/alt-data")({
  head: () => ({
    meta: [
      { title: "Alternative Data — Research Terminal" },
      {
        name: "description",
        content:
          "Live Wikipedia attention signals with visible provenance, freshness and reliability penalties.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(altDataQuery),
  component: AltData,
});

function AltData() {
  const { data: panels } = useSuspenseQuery(altDataQuery);
  return (
    <AppShell>
      <SectionHeader
        code="AD · Alternative Data"
        title="Where is unusual investor attention building or fading?"
        purpose="Live Wikipedia attention is treated as lower-confidence supporting evidence. Every signal shows freshness, coverage, method and the penalty applied for weaker provenance."
      />
      <PanelGrid panels={panels} />
    </AppShell>
  );
}
