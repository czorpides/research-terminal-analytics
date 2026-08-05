import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";

import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { SwingExpectationsPanel } from "@/components/research/SwingExpectationsPanel";
import { SwingOperationalStatus } from "@/components/research/SwingOperationalStatus";
import { SwingTradesIntegratedView } from "@/components/research/SwingTradesIntegratedView";
import { getRegimeMonitor } from "@/lib/panels/regime.functions";
import { getSwingExpectationsWorkspace } from "@/lib/swing/expectations.functions";
import { getSwingOperationalHealth } from "@/lib/swing/health.functions";
import { refreshSwingTradesNow } from "@/lib/swing/refresh.functions";
import { getSwingTrackerWorkspace } from "@/lib/swing/tracker.functions";
import { getSwingTradesWorkspace } from "@/lib/swing/workspace.functions";

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
      { name: "description", content: "Short-horizon swing setups with entries, risk controls, expectations and tracked outcomes." },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(swingQueryOptions),
      context.queryClient.ensureQueryData(regimeQueryOptions),
    ]),
  component: SwingTradesPage,
});

function SwingTradesPage() {
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const { data: workspace } = useSuspenseQuery(swingQueryOptions);
  const { data: regime } = useSuspenseQuery(regimeQueryOptions);
  const trackerQuery = useQuery(trackerQueryOptions);
  const expectationsQuery = useQuery(expectationsQueryOptions);
  const healthQuery = useQuery(swingHealthQueryOptions);

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
        trackerQuery.refetch(),
        expectationsQuery.refetch(),
        healthQuery.refetch(),
      ]);
      setRefreshing(false);
    }
  }

  return (
    <AppShell>
      <SectionHeader
        code="ST · Swing Trades"
        title="Short-term setups, separated from long-term research"
        purpose="A dedicated trading workspace for setup quality, entry timing, risk/reward, analyst expectations and point-in-time outcome tracking."
      />
      <SwingOperationalStatus
        health={healthQuery.data ?? null}
        loading={healthQuery.isPending}
        error={errorText(healthQuery.error)}
      />
      <SwingTradesIntegratedView
        workspace={workspace}
        regime={regime}
        tracker={trackerQuery.data ?? null}
        trackerLoading={trackerQuery.isPending}
        trackerError={trackerErrorText(trackerQuery.error)}
        refreshing={refreshing}
        refreshError={refreshError}
        onRefresh={handleRefresh}
      />
      <SwingExpectationsPanel
        workspace={workspace}
        expectations={expectationsQuery.data ?? null}
        loading={expectationsQuery.isPending}
        error={errorText(expectationsQuery.error)}
      />
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
