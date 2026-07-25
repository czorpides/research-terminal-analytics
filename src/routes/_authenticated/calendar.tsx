import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, RefreshCw } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { ReleaseCalendarView } from "@/components/research/ReleaseCalendarView";
import { Button } from "@/components/ui/button";
import { getReleaseCalendarDashboard } from "@/lib/panels/release-calendar.functions";
import { cn } from "@/lib/utils";

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
  const query = useQuery({
    queryKey: ["release-calendar", "dashboard"],
    queryFn: () => load(),
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  return (
    <AppShell>
      {query.isLoading && !query.data && <CalendarLoading />}
      {query.error && !query.data && (
        <CalendarFailure
          message={(query.error as Error).message}
          retry={() => query.refetch()}
          retrying={query.isFetching}
        />
      )}
      {query.data && <ReleaseCalendarView data={query.data} />}
    </AppShell>
  );
}

function CalendarLoading() {
  return (
    <>
      <SectionHeader
        code="PF · Release Calendar"
        title="What is due, and did the data actually arrive?"
        purpose="Loading the official macro and tracked-company release queue together with its verification audit trail."
      />
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-24 animate-pulse rounded-md border border-border/70 bg-muted/20" />
        ))}
      </div>
      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.55fr)]">
        <div className="h-96 animate-pulse rounded-md border border-border/70 bg-muted/20" />
        <div className="h-96 animate-pulse rounded-md border border-border/70 bg-muted/20" />
      </div>
    </>
  );
}

function CalendarFailure({
  message,
  retry,
  retrying,
}: {
  message: string;
  retry: () => void;
  retrying: boolean;
}) {
  return (
    <>
      <SectionHeader
        code="PF · Release Calendar"
        title="What is due, and did the data actually arrive?"
        purpose="The calendar could not load its current release and verification state. No stale queue is being presented as current."
      />
      <div className="rounded-md border border-[var(--negative)]/40 bg-[var(--negative)]/5 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--negative)]">
              <CalendarClock className="h-4 w-4" /> Calendar unavailable
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{message}</p>
          </div>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-[10px]" onClick={retry}>
            <RefreshCw className={cn("h-3.5 w-3.5", retrying && "animate-spin")} /> Retry
          </Button>
        </div>
      </div>
    </>
  );
}
