import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { SwingExpectationsPanel } from "@/components/research/SwingExpectationsPanel";
import { SwingOperationalStatus } from "@/components/research/SwingOperationalStatus";
import { SwingTradesIntegratedView } from "@/components/research/SwingTradesIntegratedView";
import { SwingTradesV2View } from "@/components/research/SwingTradesV2View";
import { RadarModeTabs } from "@/components/research/RadarModeTabs";
import { getRegimeMonitor } from "@/lib/panels/regime.functions";
import { getSwingExpectationsWorkspace } from "@/lib/swing/expectations.functions";
import { getSwingOperationalHealth } from "@/lib/swing/health.functions";
import { refreshSwingTradesNow } from "@/lib/swing/refresh.functions";
import { getSwingTrackerWorkspace } from "@/lib/swing/tracker.functions";
import { hardenSwingV2Workspace } from "@/lib/swing/workspace-v21-hardening";
import { getSwingTradesV2Workspace } from "@/lib/swing/workspace-v2.functions";
import { getSwingTradesWorkspace } from "@/lib/swing/workspace.functions";

const swingV2QueryOptions = queryOptions({
  queryKey: ["swing-trades", "workspace-v2-shadow-multistrategy-hardened"],
  queryFn: async () => hardenSwingV2Workspace(await getSwingTradesV2Workspace()),
  staleTime: 5 * 60 * 1000,
  refetchInterval: 5 * 60 * 1000,
  refetchOnWindowFocus: true,
});

const swingQueryOptions = queryOptions({
  queryKey: ["swing-trades", "workspace-v5-operational"],
  queryFn: () => getSwingTradesWorkspace(),
  staleTime: 5 * 60 * 1000,
  refetchInterval: 5 * 60 * 1000,
  refetchOnWindowFocus: true,
});

const regimeQueryOptions = queryOptions({
  queryKey: ["macro", "regime-monitor"],
  queryFn: () => getRegimeMonitor(),
  staleTime: 15 * 60 * 1000,
  refetchInterval: 15 * 60 * 1000,
  refetchOnWindowFocus: true,
});

const trackerQueryOptions = queryOptions({
  queryKey: ["swing-trades", "outcomes-v2-integrated"],
  queryFn: () => getSwingTrackerWorkspace(),
  staleTime: 5 * 60 * 1000,
  refetchInterval: 5 * 60 * 1000,
  refetchOnWindowFocus: true,
  retry: false,
});

const expectationsQueryOptions = queryOptions({
  queryKey: ["swing-trades", "expectations-v1"],
  queryFn: () => getSwingExpectationsWorkspace(),
  staleTime: 5 * 60 * 1000,
  refetchInterval: 5 * 60 * 1000,
  refetchOnWindowFocus: true,
  retry: false,
});

const swingHealthQueryOptions = queryOptions({
  queryKey: ["swing-trades", "operational-health-v1"],
  queryFn: () => getSwingOperationalHealth(),
  staleTime: 30 * 1000,
  refetchInterval: 60 * 1000,
  refetchOnWindowFocus: true,
  retry: false,
});

export const Route = createFileRoute("/_authenticated/swing-trades")({
  head: () => ({
    meta: [
      { title: "Swing Trades — Research Terminal" },
      {
        name: "description",
        content: "Multi-strategy swing opportunities with entry quality, catalyst/macro context, risk controls and point-in-time outcome tracking.",
      },
    ],
  }),
  component: SwingTradesPage,
});

function SwingTradesPage() {
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  // v2 is the primary screen. Legacy model, tracker and expectation datasets
  // are expensive and only load when the user expands their section.
  const [legacyOpen, setLegacyOpen] = useState(false);
  const [takingLong, setTakingLong] = useState(false);
  const v2Query = useQuery({ ...swingV2QueryOptions, retry: false, refetchOnWindowFocus: false });
  const v1Query = useQuery({ ...swingQueryOptions, enabled: legacyOpen, retry: false, refetchOnWindowFocus: false });
  const { data: regime, isPending: regimePending } = useQuery({ ...regimeQueryOptions, enabled: legacyOpen, retry: false });
  const trackerQuery = useQuery({ ...trackerQueryOptions, enabled: legacyOpen });
  const expectationsQuery = useQuery({ ...expectationsQueryOptions, enabled: legacyOpen });
  const healthQuery = useQuery(swingHealthQueryOptions);
  useEffect(() => {
    if (!v2Query.isPending) { setTakingLong(false); return; }
    const timer = setTimeout(() => setTakingLong(true), 12000);
    return () => clearTimeout(timer);
  }, [v2Query.isPending]);

  async function handleRefresh() {
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
        v2Query.refetch(),
        v1Query.refetch(),
        trackerQuery.refetch(),
        expectationsQuery.refetch(),
        healthQuery.refetch(),
      ]);
      setRefreshing(false);
    }
  }

  return (
    <AppShell>
      <RadarModeTabs current="swing" />
      <SectionHeader
        code="ST · Swing Trades"
        title="Multi-strategy swing opportunities"
        purpose="Find pullbacks, oversold reversals, 200SMA bounces, catalyst repricing and clean breakout/retest setups without mistaking a strong chart for a good entry. Gold and silver are assessed separately with macro context."
      />
      <SwingOperationalStatus
        health={healthQuery.data ?? null}
        loading={healthQuery.isPending}
        error={errorText(healthQuery.error)}
      />

      {v2Query.data ? (
        <SwingTradesV2View workspace={v2Query.data} />
      ) : (
        <section role="status" className="rounded-xl border border-border/70 bg-card p-5">
          <div className="text-sm font-semibold">
            {v2Query.isError ? "Swing Radar data is unavailable" : "Loading Swing Radar opportunities…"}
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {v2Query.isError
              ? "The trading research query failed. Use Retry, or switch back to Opportunity Radar."
              : takingLong
                ? "This first scan is taking longer than usual. You can switch radar tabs immediately and return later."
                : "Scanning the equity universe and recent price histories. The page remains usable while data loads."}
          </p>
          {v2Query.isError && <button type="button" className="mt-3 rounded border border-border px-3 py-1.5 text-xs" onClick={() => void v2Query.refetch()}>Retry scan</button>}
        </section>
      )}

      <details onToggle={(event) => setLegacyOpen(event.currentTarget.open)} className="group mt-6 rounded-xl border border-border/65 bg-muted/10">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4">
          <div>
            <div className="text-sm font-semibold">Legacy v1 control & point-in-time outcome tracker</div>
            <p className="mt-1 max-w-4xl text-xs leading-5 text-muted-foreground">
              v1 remains available as the control model while v2 collects outcomes. Its old “Confirmed” label is not treated as the primary entry recommendation; keeping it here lets us compare whether the new location/catalyst rules actually improve realised results.
            </p>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-5 border-t border-border/60 p-4 lg:p-5">
          {v1Query.isError && (
            <p role="alert" className="text-xs text-amber-500">Legacy Swing data is unavailable. <button type="button" className="underline" onClick={() => void v1Query.refetch()}>Retry</button></p>
          )}
          {(!v1Query.data || regimePending || !regime) && !v1Query.isError && (
            <p role="status" className="text-xs text-muted-foreground">Loading legacy model and market regime…</p>
          )}
          {v1Query.data && regime && <>
          <SwingTradesIntegratedView
            workspace={v1Query.data}
            regime={regime}
            tracker={trackerQuery.data ?? null}
            trackerLoading={trackerQuery.isPending}
            trackerError={trackerErrorText(trackerQuery.error)}
            refreshing={refreshing}
            refreshError={refreshError}
            onRefresh={handleRefresh}
          />
          <SwingExpectationsPanel
            workspace={v1Query.data}
            expectations={expectationsQuery.data ?? null}
            loading={expectationsQuery.isPending}
            error={errorText(expectationsQuery.error)}
          />
          </>}
        </div>
      </details>
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
    (normalized.includes("relation") && normalized.includes("does not exist"))
  ) {
    return `Swing tracking schema is missing from the deployed database. Original database error: ${message}`;
  }
  return message;
}

function errorText(error: unknown): string | null {
  if (!error) return null;
  return error instanceof Error ? error.message : String(error);
}
