import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, Crosshair } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { OpportunityRadarDefinitiveView } from "@/components/research/OpportunityRadarDefinitiveView";
import { OpportunityRadarEvidenceFreshness } from "@/components/research/OpportunityRadarEvidenceFreshness";
import { OpportunityRadarReadinessStatus } from "@/components/research/OpportunityRadarReadinessStatus";
import { getOpportunityRadarHealth } from "@/lib/opportunity/health.functions";
import { getOpportunityCandidateFreshness } from "@/lib/opportunity/integrity.functions";
import { applyOpportunityEvidenceIntegrity } from "@/lib/opportunity/integrity";
import { getInstitutionalOpportunityWorkspace } from "@/lib/opportunity/institutional.functions";
import { getOpportunityRadarWorkspace } from "@/lib/opportunity/workspace.functions";

const MANAGED_EQUITY_TARGET = 3_000;
const MANAGED_EQUITY_READY_FLOOR = 2_950;

const radarQueryOptions = queryOptions({
  queryKey: ["opportunity-radar", "horizons-v6-evidence-integrity"],
  queryFn: async () => {
    const [workspace, freshness] = await Promise.all([
      getOpportunityRadarWorkspace(),
      getOpportunityCandidateFreshness(),
    ]);
    return applyOpportunityEvidenceIntegrity(workspace, freshness);
  },
  staleTime: 15 * 60 * 1000,
  refetchInterval: 15 * 60 * 1000,
  refetchOnWindowFocus: true,
});

const opportunityHealthQueryOptions = queryOptions({
  queryKey: ["opportunity-radar", "readiness-v2-regional"],
  queryFn: () => getOpportunityRadarHealth(),
  staleTime: 60 * 1000,
  refetchInterval: 2 * 60 * 1000,
  refetchOnWindowFocus: true,
  retry: false,
});

const institutionalQueryOptions = queryOptions({
  queryKey: ["opportunity-radar", "institutional-v1"],
  queryFn: () => getInstitutionalOpportunityWorkspace(),
  staleTime: 60 * 60 * 1000,
  refetchInterval: 60 * 60 * 1000,
  refetchOnWindowFocus: false,
});

export const Route = createFileRoute("/_authenticated/radar")({
  head: () => ({
    meta: [
      { title: "Opportunity Radar — Research Terminal" },
      {
        name: "description",
        content: "A definitive long-term research queue with dedicated advanced company analysis screens.",
      },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(radarQueryOptions),
      context.queryClient.ensureQueryData(institutionalQueryOptions),
    ]),
  component: OpportunityRadarPage,
});

function OpportunityRadarPage() {
  const { data: workspace } = useSuspenseQuery(radarQueryOptions);
  const { data: institutionalWorkspace } = useSuspenseQuery(institutionalQueryOptions);
  const healthQuery = useQuery(opportunityHealthQueryOptions);
  const universeUnderfilled = workspace.universe.activeEquities < MANAGED_EQUITY_READY_FLOOR;

  return (
    <AppShell>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <SectionHeader
          code="OR · Opportunity Radar"
          title="One research queue. One company research screen."
          purpose="Find medium- and long-term investment opportunities without carrying multiple legacy Radar interfaces. Open any company for the full valuation, financial, expectations and model evidence screen."
        />
        <Link
          to="/swing-trades"
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border/70 bg-card/50 px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/[0.06] hover:text-foreground"
        >
          <Crosshair className="h-4 w-4" /> Open Swing Trades
        </Link>
      </div>

      {universeUnderfilled && (
        <section className="mb-5 rounded-xl border border-amber-500/35 bg-amber-500/[0.06] p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <div>
              <div className="text-sm font-semibold">Managed equity universe is incomplete</div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                The database currently has {workspace.universe.activeEquities.toLocaleString()} active equities against a managed target of {MANAGED_EQUITY_TARGET.toLocaleString()}. Rankings should be treated as incomplete until the managed universe recovers above {MANAGED_EQUITY_READY_FLOOR.toLocaleString()} names.
              </p>
            </div>
          </div>
        </section>
      )}

      <OpportunityRadarDefinitiveView
        workspace={workspace}
        institutionalWorkspace={institutionalWorkspace}
      />

      <details className="group mt-5 rounded-xl border border-border/65 bg-muted/10">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
          <div>
            <div className="text-sm font-semibold">Data readiness & evidence integrity</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Operational coverage, freshness and candidate evidence holds stay available here without competing with the investment queue.
            </p>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-4 border-t border-border/60 p-4">
          <OpportunityRadarReadinessStatus health={healthQuery.data ?? null} />
          <OpportunityRadarEvidenceFreshness workspace={workspace} />
        </div>
      </details>
    </AppShell>
  );
}
