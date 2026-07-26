import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { OpportunityRadarConvictionViewV2 } from "@/components/research/OpportunityRadarConvictionViewV2";
import { getOpportunityRadarWorkspace } from "@/lib/opportunity/workspace.functions";
import { getRegimeMonitor } from "@/lib/panels/regime.functions";

const radarQueryOptions = queryOptions({
  queryKey: ["opportunity-radar", "horizons-v3-conviction"],
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
          "Prioritise companies for research using valuation, quality, Piotroski, Magic Formula, dislocation, recovery and impairment evidence.",
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
        title="Which companies deserve research time now?"
        purpose="The primary queue separates Priority Research, Qualified Research and Watchlist names. It rewards agreement across valuation, quality, Piotroski, Magic Formula, price dislocation, recovery and balance-sheet evidence, while showing exactly what still needs proving. The stricter horizon model remains available as the audit trail rather than suppressing every incomplete case."
      />
      <OpportunityRadarConvictionViewV2 workspace={workspace} regime={regime} />
    </AppShell>
  );
}
