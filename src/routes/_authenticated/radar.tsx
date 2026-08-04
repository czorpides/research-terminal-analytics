import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Crosshair } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { OpportunityRadarDiscoveryView } from "@/components/research/OpportunityRadarDiscoveryView";
import { Button } from "@/components/ui/button";
import { getInstitutionalOpportunityWorkspace } from "@/lib/opportunity/institutional.functions";
import { getOpportunityRadarWorkspace } from "@/lib/opportunity/workspace.functions";
import { getRegimeMonitor } from "@/lib/panels/regime.functions";

const radarQueryOptions = queryOptions({
  queryKey: ["opportunity-radar", "horizons-v5-discovery"],
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
          "Discover long-term research candidates through a separate, auditable fundamental and valuation engine.",
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
        title="Find the long-term opportunity"
        purpose="The Opportunity Radar ranks investable research theses using valuation, quality, cash generation, balance-sheet resilience, recovery evidence and sector-aware institutional analysis. Short-term timing now lives in its own Swing Trades workspace."
      />

      <div className="mb-5 flex justify-end">
        <Button asChild variant="outline">
          <Link to="/swing-trades">
            <Crosshair className="mr-2 h-4 w-4" /> Open Swing Trades
          </Link>
        </Button>
      </div>

      <OpportunityRadarDiscoveryView
        workspace={workspace}
        institutionalWorkspace={institutionalWorkspace}
        regime={regime}
      />
    </AppShell>
  );
}
