import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { OpportunityRadarConvictionView } from "@/components/research/OpportunityRadarConvictionView";
import { getOpportunityRadarWorkspace } from "@/lib/opportunity/workspace.functions";
import { getRegimeMonitor } from "@/lib/panels/regime.functions";

const radarQueryOptions = queryOptions({
  queryKey: ["opportunity-radar", "horizons-v2-conviction"],
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
          "Rank companies by rules-based research conviction, model agreement and value-trap exclusions.",
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
        title="Which companies have enough evidence to justify research?"
        purpose="A rules-based conviction shortlist now combines valuation, quality, Piotroski, Magic Formula, price dislocation, recovery, impairment and model agreement. Hard value-trap gates can exclude cheap-looking companies, while the original horizon model remains visible as the audit trail."
      />
      <OpportunityRadarConvictionView workspace={workspace} regime={regime} />
    </AppShell>
  );
}
