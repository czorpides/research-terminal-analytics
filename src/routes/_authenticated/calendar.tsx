import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { AppShell } from "@/components/layout/AppShell";
import { ReleaseCalendarView } from "@/components/research/ReleaseCalendarView";
import { getReleaseCalendarDashboard } from "@/lib/panels/release-calendar.functions";

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({
    meta: [
      { title: "Release Calendar — Research Terminal" },
      {
        name: "description",
        content:
          "Official macro and tracked-company earnings dates with verified release-aware data refreshes.",
      },
    ],
  }),
  component: ReleaseCalendarPage,
});

function ReleaseCalendarPage() {
  const load = useServerFn(getReleaseCalendarDashboard);
  const { data, isLoading, error } = useQuery({
    queryKey: ["release-calendar", "dashboard"],
    queryFn: () => load(),
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
  return (
    <AppShell>
      {isLoading && <div className="text-xs text-muted-foreground">Loading release calendar…</div>}
      {error && (
        <div className="text-xs text-[var(--negative)]">
          Calendar unavailable: {(error as Error).message}
        </div>
      )}
      {data && <ReleaseCalendarView data={data} />}
    </AppShell>
  );
}
