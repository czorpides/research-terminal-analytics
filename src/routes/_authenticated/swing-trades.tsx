import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";

import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { SwingTradesIntegratedView } from "@/components/research/SwingTradesIntegratedView";
import { getRegimeMonitor } from "@/lib/panels/regime.functions";
import { refreshSwingTradesNow } from "@/lib/swing/refresh.functions";
import { getSwingTrackerWorkspace } from "@/lib/swing/tracker.functions";
import { getSwingTradesWorkspace } from "@/lib/swing/workspace.functions";

const regimeQueryOptions = queryOptions({
  queryKey: ["macro", "regime-monitor"],
  queryFn: () => getRegimeMonitor(),
  staleTime: 15 * 60 * 1000,
  refetchInterval: 15 * 60 * 1000,
  refetchOnWindowFocus: true,
});

const swingQueryOptions = queryOptions({
  queryKey: ["opportunity-radar", "swing-trades-v3-integrated"],
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

export const Route = createFileRoute("/_authenticated/swing-trades")({
  head: () => ({
    meta: [
      { title: "Swing Trades — Research Terminal" },
      {
        name: "description",
        content:
          "Rank short-term technical setups, monitor their live outcome and learn from point-in-time trade history.",
      },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(regimeQueryOptions),
      context.queryClient.ensureQueryData(swingQueryOptions),
    ]),
  component: SwingTrades,
});

function SwingTrades() {
  const { data: regime } = useSuspenseQuery(regimeQueryOptions);
  const swingQuery = useSuspenseQuery(swingQueryOptions);
  const trackerQuery = useQuery(trackerQueryOptions);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

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
      await Promise.allSettled([swingQuery.refetch(), trackerQuery.refetch()]);
      setRefreshing(false);
    }
  }

  const trackerError = trackerQuery.error
    ? trackerQuery.error instanceof Error
      ? trackerQuery.error.message
      : String(trackerQuery.error)
    : null;

  return (
    <AppShell>
      <SectionHeader
        code="SW · Swing Trades"
        title="Find the setup, track the outcome, improve the conviction"
        purpose="A dedicated short-to-medium-term timing workspace. Current setups remain separate from long-term Opportunity Radar research, while the integrated tracker freezes each qualifying signal and feeds validated historical outcomes back into a small, auditable empirical ranking overlay."
      />

      <SwingTradesIntegratedView
        workspace={swingQuery.data}
        regime={regime}
        tracker={trackerQuery.data ?? null}
        trackerLoading={trackerQuery.isPending}
        trackerError={trackerError}
        refreshing={refreshing}
        refreshError={refreshError}
        onRefresh={handleRefresh}
      />
    </AppShell>
  );
}
