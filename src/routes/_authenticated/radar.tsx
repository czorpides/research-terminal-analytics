import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, Crosshair, RotateCcw } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { OpportunityRadarDefinitiveView } from "@/components/research/OpportunityRadarDefinitiveView";
import { OpportunityRadarEvidenceFreshness } from "@/components/research/OpportunityRadarEvidenceFreshness";
import { OpportunityRadarReadinessStatus } from "@/components/research/OpportunityRadarReadinessStatus";
import { getOpportunityRadarHealth } from "@/lib/opportunity/health.functions";
import { getOpportunityCandidateFreshness } from "@/lib/opportunity/integrity.functions";
import { applyOpportunityEvidenceIntegrity } from "@/lib/opportunity/integrity";
import { getInstitutionalOpportunityWorkspace, type InstitutionalOpportunityWorkspace } from "@/lib/opportunity/institutional.functions";
import {
  applyStage1Structures,
  getStage1StructureWorkspace,
} from "@/lib/opportunity/stage1-workspace.functions";
import { getOpportunityRadarWorkspace } from "@/lib/opportunity/workspace.functions";

const MANAGED_EQUITY_TARGET = 3_000;
const MANAGED_EQUITY_READY_FLOOR = 2_950;

const radarQueryOptions = queryOptions({
  queryKey: ["opportunity-radar", "horizons-v7-stage1-structure"],
  queryFn: async () => {
    const [workspace, freshness, stage1] = await Promise.all([
      getOpportunityRadarWorkspace(),
      getOpportunityCandidateFreshness(),
      getStage1StructureWorkspace(),
    ]);
    return applyStage1Structures(applyOpportunityEvidenceIntegrity(workspace, freshness), stage1);
  },
  staleTime: 15 * 60 * 1000,
  refetchInterval: 15 * 60 * 1000,
  refetchOnWindowFocus: false,
  retry: 1,
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
  queryKey: ["opportunity-radar", "institutional-v2-advanced-valuation"],
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
  component: OpportunityRadarPage,
});

function OpportunityRadarPage() {
  // Render the route immediately rather than blocking navigation on several
  // large 3,000-equity remote queries. Surface failures instead of a blank page.
  const radarQuery = useQuery(radarQueryOptions);
  const institutionalQuery = useQuery({
    ...institutionalQueryOptions,
    enabled: Boolean(radarQuery.data),
    retry: false,
  });
  const healthQuery = useQuery(opportunityHealthQueryOptions);
  const workspace = radarQuery.data;
  const institutionalWorkspace: InstitutionalOpportunityWorkspace = institutionalQuery.data ?? {
    asOf: new Date(0).toISOString(),
    calcVersion: "unavailable",
    status: "unavailable",
    universe: { activeEquities: 0, loadedAssets: 0, assetsWithStatements: 0, assetsWithTwoPeriods: 0, cap: 3000, truncated: false },
    counts: { priority: 0, qualified: 0, watch: 0, avoid: 0, insufficient: 0 },
    analyses: [],
    modelNote: "Institutional analysis is still loading or currently unavailable.",
    warnings: ["Institutional analysis is not available yet. Core radar discovery remains accessible."],
  };
  const universeUnderfilled = workspace ? workspace.universe.activeEquities < MANAGED_EQUITY_READY_FLOOR : false;

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

      {!workspace && (
        <section role="status" className="mb-5 rounded-xl border border-border/70 bg-card p-5">
          <div className="text-sm font-semibold">
            {radarQuery.isError ? "Opportunity Radar data is unavailable" : "Loading Opportunity Radar research data…"}
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {radarQuery.isError
              ? "The research page is available, but its data query failed. Other screens can still be used. Check Data Health while the recovered database is being repaired."
              : "Loading and evaluating the recovered equity universe. This may take longer than ordinary page navigation."}
          </p>
          {radarQuery.isError && (
            <div className="mt-3 flex items-center gap-4">
              <button type="button" onClick={() => void radarQuery.refetch()} className="inline-flex items-center gap-2 rounded border border-border px-3 py-1.5 text-xs">
                <RotateCcw className="h-3 w-3" /> Retry data loading
              </button>
              <Link to="/data-health" className="text-xs underline">Open Data Health</Link>
            </div>
          )}
        </section>
      )}

      {workspace && universeUnderfilled && (
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

      {workspace && (
        <OpportunityRadarDefinitiveView
          workspace={workspace}
          institutionalWorkspace={institutionalWorkspace}
        />
      )}

      {institutionalQuery.isError && workspace && (
        <p className="mb-3 text-xs text-amber-500">Advanced valuation is temporarily unavailable. Core Radar remains usable.</p>
      )}

      {workspace && <details className="group mt-5 rounded-xl border border-border/65 bg-muted/10">
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
      </details>}
    </AppShell>
  );
}
