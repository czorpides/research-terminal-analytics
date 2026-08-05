import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { AlertTriangle, Crosshair, Radar as RadarIcon } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { OpportunityRadarDiscoveryView } from "@/components/research/OpportunityRadarDiscoveryView";
import { OpportunityRadarReadinessStatus } from "@/components/research/OpportunityRadarReadinessStatus";
import { SwingExpectationsPanel } from "@/components/research/SwingExpectationsPanel";
import { SwingOperationalStatus } from "@/components/research/SwingOperationalStatus";
import { SwingTradesIntegratedView } from "@/components/research/SwingTradesIntegratedView";
import { Button } from "@/components/ui/button";
import { getOpportunityRadarHealth } from "@/lib/opportunity/health.functions";
import { getOpportunityCandidateFreshness } from "@/lib/opportunity/integrity.functions";
import { applyOpportunityEvidenceIntegrity } from "@/lib/opportunity/integrity";
import { getInstitutionalOpportunityWorkspace } from "@/lib/opportunity/institutional.functions";
import { getOpportunityRadarWorkspace } from "@/lib/opportunity/workspace.functions";
import { getRegimeMonitor } from "@/lib/panels/regime.functions";
import { getSwingExpectationsWorkspace } from "@/lib/swing/expectations.functions";
import { getSwingOperationalHealth } from "@/lib/swing/health.functions";
import { refreshSwingTradesNow } from "@/lib/swing/refresh.functions";
import { getSwingTrackerWorkspace } from "@/lib/swing/tracker.functions";
import { getSwingTradesWorkspace } from "@/lib/swing/workspace.functions";

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

const regimeQueryOptions = queryOptions({
  queryKey: ["macro", "regime-monitor"],
  queryFn: () => getRegimeMonitor(),
  staleTime: 15 * 60 * 1000,
  refetchInterval: 15 * 60 * 1000,
  refetchOnWindowFocus: true,
});

const swingQueryOptions = queryOptions({
  queryKey: ["opportunity-radar", "swing-trades-v5-operational"],
  queryFn: () => getSwingTradesWorkspace(),
  staleTime: 5 * 60 * 1000,
  refetchInterval: 5 * 60 * 1000,
  refetchOnWindowFocus: true,
});

const trackerQueryOptions = queryOptions({
  queryKey: ["opportunity-radar", "swing-outcomes-v2-integrated"],
  queryFn: () => getSwingTrackerWorkspace(),
  staleTime: 5 * 60 * 1000,
  refetchInterval: 5 * 60 * 1000,
  refetchOnWindowFocus: true,
  retry: false,
});

const expectationsQueryOptions = queryOptions({
  queryKey: ["opportunity-radar", "swing-expectations-v1"],
  queryFn: () => getSwingExpectationsWorkspace(),
  staleTime: 5 * 60 * 1000,
  refetchInterval: 5 * 60 * 1000,
  refetchOnWindowFocus: true,
  retry: false,
});

const swingHealthQueryOptions = queryOptions({
  queryKey: ["opportunity-radar", "swing-operational-health-v1"],
  queryFn: () => getSwingOperationalHealth(),
  staleTime: 30 * 1000,
  refetchInterval: 60 * 1000,
  refetchOnWindowFocus: true,
  retry: false,
});

export const Route = createFileRoute("/_authenticated/radar")({
  head: () => ({
    meta: [
      { title: "Opportunity & Swing Radar — Research Terminal" },
      {
        name: "description",
        content:
          "Discover long-term research candidates and short-term swing setups through separate, auditable evidence engines.",
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
  const [view, setView] = useState<"opportunity" | "swing">("opportunity");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const { data: workspace } = useSuspenseQuery(radarQueryOptions);
  const { data: institutionalWorkspace } = useSuspenseQuery(institutionalQueryOptions);
  const { data: regime } = useSuspenseQuery(regimeQueryOptions);
  const opportunityHealthQuery = useQuery({
    ...opportunityHealthQueryOptions,
    enabled: view === "opportunity",
  });
  const swingQuery = useQuery({ ...swingQueryOptions, enabled: view === "swing" });
  const trackerQuery = useQuery({ ...trackerQueryOptions, enabled: view === "swing" });
  const expectationsQuery = useQuery({ ...expectationsQueryOptions, enabled: view === "swing" });
  const swingHealthQuery = useQuery({ ...swingHealthQueryOptions, enabled: view === "swing" });

  async function handleSwingRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshError(null);
    try {
      const result = await refreshSwingTradesNow();
      if (!result.ok) setRefreshError(result.error ?? "Swing refresh failed.");
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : String(error));
    } finally {
      await Promise.allSettled([
        swingQuery.refetch(),
        trackerQuery.refetch(),
        expectationsQuery.refetch(),
        swingHealthQuery.refetch(),
      ]);
      setRefreshing(false);
    }
  }

  const trackerError = trackerErrorText(trackerQuery.error);
  const swingError = errorText(swingQuery.error);
  const expectationsError = errorText(expectationsQuery.error);
  const swingHealthError = errorText(swingHealthQuery.error);
  const universeUnderfilled = workspace.universe.activeEquities < MANAGED_EQUITY_READY_FLOOR;

  return (
    <AppShell>
      <SectionHeader
        code="OR · Opportunity Radar"
        title="Find the opportunity, then decide whether the timing is right"
        purpose="The long-term Opportunity Radar ranks investable research theses. Swing Trades remains a separate timing tab, now with point-in-time outcome tracking, analyst expectation revisions, freshness controls and auditable empirical learning."
      />

      <div className="mb-5 flex flex-wrap gap-2 rounded-xl border border-border/70 bg-card/55 p-2">
        <Button
          variant={view === "opportunity" ? "default" : "ghost"}
          onClick={() => setView("opportunity")}
          className="justify-start"
        >
          <RadarIcon className="mr-2 h-4 w-4" /> Opportunity Radar
        </Button>
        <Button
          variant={view === "swing" ? "default" : "ghost"}
          onClick={() => setView("swing")}
          className="justify-start"
        >
          <Crosshair className="mr-2 h-4 w-4" /> Swing Trades
        </Button>
      </div>

      {universeUnderfilled && (
        <section className="mb-5 rounded-xl border border-amber-500/35 bg-amber-500/[0.06] p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <div>
              <div className="text-sm font-semibold">Managed equity universe is incomplete</div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                The database currently has {workspace.universe.activeEquities.toLocaleString()} active equities
                against a managed target of {MANAGED_EQUITY_TARGET.toLocaleString()}. This is an ingestion/deployment
                coverage fault, not a {workspace.universe.activeEquities.toLocaleString()}-company model cap. Both
                Opportunity Radar and Swing Trades are designed to first-pass screen the managed population up to
                the 3,000-name workspace capacity.
              </p>
            </div>
          </div>
        </section>
      )}

      {view === "opportunity" ? (
        <>
          <OpportunityRadarReadinessStatus health={opportunityHealthQuery.data ?? null} />
          <OpportunityRadarDiscoveryView
            workspace={workspace}
            institutionalWorkspace={institutionalWorkspace}
            regime={regime}
          />
        </>
      ) : swingQuery.data ? (
        <>
          <SwingOperationalStatus
            health={swingHealthQuery.data ?? null}
            loading={swingHealthQuery.isPending}
            error={swingHealthError}
          />
          <SwingTradesIntegratedView
            workspace={swingQuery.data}
            regime={regime}
            tracker={trackerQuery.data ?? null}
            trackerLoading={trackerQuery.isPending}
            trackerError={trackerError}
            refreshing={refreshing}
            refreshError={refreshError}
            onRefresh={handleSwingRefresh}
          />
          <SwingExpectationsPanel
            workspace={swingQuery.data}
            expectations={expectationsQuery.data ?? null}
            loading={expectationsQuery.isPending}
            error={expectationsError}
          />
        </>
      ) : swingError ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/[0.05] p-6 text-sm">
          <div className="font-semibold text-red-600">The Swing Trade scan could not load.</div>
          <div className="mt-2 font-mono text-xs text-muted-foreground">{swingError}</div>
        </div>
      ) : (
        <div className="rounded-xl border border-border/70 bg-card/55 p-8 text-center text-sm text-muted-foreground">
          Scanning the current equity universe for swing setups…
        </div>
      )}
    </AppShell>
  );
}

function trackerErrorText(error: unknown): string | null {
  const message = errorText(error);
  if (!message) return null;
  const normalized = message.toLowerCase();
  if (
    normalized.includes("swing_trade_setups") ||
    normalized.includes("swing_trade_price_snapshots") ||
    normalized.includes("schema cache") ||
    normalized.includes("relation") && normalized.includes("does not exist")
  ) {
    return `Swing tracking schema is missing from the deployed database. The tracker repair migration must be applied before outcome tracking can run. Original database error: ${message}`;
  }
  return message;
}

function errorText(error: unknown): string | null {
  if (!error) return null;
  return error instanceof Error ? error.message : String(error);
}
