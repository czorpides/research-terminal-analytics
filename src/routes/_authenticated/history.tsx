import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { PanelGrid } from "@/components/research/PanelGrid";
import { getHistoryPanels } from "@/lib/panels/history.functions";

const historyQueryOptions = queryOptions({
  queryKey: ["panels", "history"],
  queryFn: () => getHistoryPanels(),
  staleTime: 5 * 60 * 1000,
  refetchInterval: 30 * 60 * 1000,
  refetchOnWindowFocus: true,
});

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({
    meta: [
      { title: "Historical Events — Research Terminal" },
      {
        name: "description",
        content:
          "Transparent comparison of today's economic environment with a sourced library of rate cycles, oil shocks, tariff rounds, banking stress and recessions.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(historyQueryOptions),
  component: HistoryPage,
});

function HistoryPage() {
  const { data: panels } = useSuspenseQuery(historyQueryOptions);
  return (
    <AppShell>
      <SectionHeader
        code="HE · Historical Events"
        title="What happened last time this environment appeared?"
        purpose="Compares today's interest rates, yield curve, inflation, oil and unemployment direction with past events. Every comparison links to sources and recorded forward returns."
      />

      <section className="mt-4 rounded border border-border/50 bg-card/40 p-4 text-xs text-muted-foreground leading-relaxed">
        <span className="text-foreground font-semibold">How to read this hub. </span>
        The top panel turns today&rsquo;s rates, yield curve, inflation, oil and unemployment into
        six simple conditions, then compares them with the historical library. Each result shows
        what caused the event, what happened next and whether the narrative passed the
        platform&rsquo;s evidence checks. Open an event for its full narrative, sources and recorded
        sector returns.
      </section>

      <PanelGrid panels={panels} />
    </AppShell>
  );
}
