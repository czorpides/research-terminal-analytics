import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, RotateCcw } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { OpportunityRadarDefinitiveView } from "@/components/research/OpportunityRadarDefinitiveView";
import { RadarModeTabs } from "@/components/research/RadarModeTabs";
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

// Load the full equity research queue first. Optional freshness and Stage-1
// enrichment run independently, so a slow optional database query cannot hold
// the actual Opportunity Radar results hostage.
const radarQueryOptions = queryOptions({
  queryKey: ["opportunity-radar", "core-v1"],
  queryFn: () => getOpportunityRadarWorkspace(),
  staleTime: 15 * 60 * 1000,
  refetchOnWindowFocus: false,
  retry: false,
});
const freshnessQueryOptions = queryOptions({
  queryKey: ["opportunity-radar", "evidence-freshness"],
  queryFn: () => getOpportunityCandidateFreshness(),
  staleTime: 15 * 60 * 1000,
  retry: false,
});
const stage1QueryOptions = queryOptions({
  queryKey: ["opportunity-radar", "stage1-structure"],
  queryFn: () => getStage1StructureWorkspace(),
  staleTime: 15 * 60 * 1000,
  retry: false,
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
  const freshnessQuery = useQuery({ ...freshnessQueryOptions, enabled: Boolean(radarQuery.data) });
  const stage1Query = useQuery({ ...stage1QueryOptions, enabled: Boolean(radarQuery.data) });
  const institutionalQuery = useQuery({
    ...institutionalQueryOptions,
    enabled: Boolean(radarQuery.data),
    retry: false,
  });
  const healthQuery = useQuery({ ...opportunityHealthQueryOptions, enabled: Boolean(radarQuery.data) });
  const [takingLong, setTakingLong] = useState(false);
  useEffect(() => {
    if (!radarQuery.isPending) { setTakingLong(false); return; }
    const timer = setTimeout(() => setTakingLong(true), 12000);
    return () => clearTimeout(timer);
  }, [radarQuery.isPending]);
  const workspace = useMemo(() => {
    if (!radarQuery.data) return undefined;
    let result = radarQuery.data;
    if (freshnessQuery.data) result = applyOpportunityEvidenceIntegrity(result, freshnessQuery.data);
    if (stage1Query.data) result = applyStage1Structures(result, stage1Query.data);
    return result;
  }, [radarQuery.data, freshnessQuery.data, stage1Query.data]);
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
      <RadarModeTabs current="opportunity" />
      <Link to="/catalysts" className="mb-3 inline-flex items-center text-xs text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground">
        Catalyst Intelligence · verified event monitoring (shadow mode) →
      </Link>
      <SectionHeader
        code="OR · Opportunity Radar"
        title="One research queue. One company research screen."
        purpose="Find medium- and long-term investment opportunities. Open any company for valuation, financial, expectations and model evidence."
      />

      {!workspace && (
        <section role="status" className="mb-5 rounded-xl border border-border/70 bg-card p-5">
          <div className="text-sm font-semibold">
            {radarQuery.isError ? "Opportunity Radar data is unavailable" : "Loading Opportunity Radar research data…"}
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {radarQuery.isError
              ? "The research page is available, but its data query failed. Other screens can still be used. Check Data Health while the recovered database is being repaired."
              : takingLong
                ? "The full equity universe is taking longer than expected. You can switch to Swing Radar while it loads; the research query will be cached once complete."
                : "Fetching the equity research queue. Navigation remains available while data loads."}
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
