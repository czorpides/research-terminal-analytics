import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { OpportunityRadarView } from "@/components/research/OpportunityRadarView";
import { getOpportunityRadarWorkspace } from "@/lib/opportunity/workspace.functions";
import { getRegimeMonitor } from "@/lib/panels/regime.functions";

const radarQueryOptions = queryOptions({
  queryKey: ["opportunity-radar", "horizons-v1"],
  queryFn: () => getOpportunityRadarWorkspace(),
  staleTime: 15 * 60 * 1000,
  refetchInterval: 15 * 60 * 1000,
  refetchOnWindowFocus: true,
});

const regimeQueryOptions = queryOptions({
  queryKey: ["macro", "regime-monitor"],
  queryFn: () => getRegimeMonitor(),
  staleTime: 15 * 60 * 1000,
  refetchInterval: 15 * 60 * 1000,
  refetchOnWindowFocus: true,
});

export const Route = createFileRoute("/_authenticated/radar")({
  head: () => ({
    meta: [
      { title: "Opportunity Radar — Research Terminal" },
      {
        name: "description",
        content:
          "Find price damage that appears greater than the damage to the underlying business.",
      },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(radarQueryOptions),
      context.queryClient.ensureQueryData(regimeQueryOptions),
    ]),
  component: Radar,
});

function Radar() {
  const { data: workspace } = useSuspenseQuery(radarQueryOptions);
  const { data: regime } = useSuspenseQuery(regimeQueryOptions);
  return (
    <AppShell>
      <SectionHeader
        code="OR · Opportunity Radar"
        title="Where has the share price broken more than the business?"
        purpose="One evidence engine, three investment horizons. Price damage, permanent impairment, company-specific pressure and data confidence remain separate so cheapness cannot disguise a value trap."
      />
      <OpportunityRadarView workspace={workspace} regime={regime} />
    </AppShell>
  );
}
