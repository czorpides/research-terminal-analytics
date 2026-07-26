import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { OpportunityRadarInstitutionalView } from "@/components/research/OpportunityRadarInstitutionalView";
import { getInstitutionalOpportunityWorkspace } from "@/lib/opportunity/institutional.functions";
import { getOpportunityRadarWorkspace } from "@/lib/opportunity/workspace.functions";
import { getRegimeMonitor } from "@/lib/panels/regime.functions";

const radarQueryOptions = queryOptions({
  queryKey: ["opportunity-radar", "horizons-v4-institutional"],
  queryFn: () => getOpportunityRadarWorkspace(),
  staleTime: 15 * 60 * 1000,
  refetchInterval: 15 * 60 * 1000,
  refetchOnWindowFocus: true,
});

const institutionalQueryOptions = queryOptions({
  queryKey: ["opportunity-radar", "institutional-v1"],
  queryFn: () => getInstitutionalOpportunityWorkspace(),
  staleTime: 60 * 60 * 1000,
  refetchInterval: 60 * 60 * 1000,
  refetchOnWindowFocus: false,
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
          "Prioritise research candidates using market expectations, cash generation, economic returns, balance-sheet risk, operating trajectory, capital allocation, accounting quality and the existing conviction evidence.",
      },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(radarQueryOptions),
      context.queryClient.ensureQueryData(institutionalQueryOptions),
      context.queryClient.ensureQueryData(regimeQueryOptions),
    ]),
  component: Radar,
});

function Radar() {
  const { data: workspace } = useSuspenseQuery(radarQueryOptions);
  const { data: institutionalWorkspace } = useSuspenseQuery(institutionalQueryOptions);
  const { data: regime } = useSuspenseQuery(regimeQueryOptions);
  return (
    <AppShell>
      <SectionHeader
        code="OR · Opportunity Radar"
        title="Which companies deserve research time now?"
        purpose="The primary queue now separates merely cheap companies from cash-backed, economically productive and financially resilient candidates. Seven institutional statement lenses work alongside valuation, Piotroski, Magic Formula, price dislocation and recovery evidence. Hard value-trap risks override attractive multiples, while missing evidence is shown rather than guessed."
      />
      <OpportunityRadarInstitutionalView
        workspace={workspace}
        institutionalWorkspace={institutionalWorkspace}
        regime={regime}
      />
    </AppShell>
  );
}
