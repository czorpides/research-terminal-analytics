import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { PanelGrid } from "@/components/research/PanelGrid";
import { getHistoryPanels } from "@/lib/panels/history.functions";

const historyQueryOptions = queryOptions({
  queryKey: ["panels", "history"],
  queryFn: () => getHistoryPanels(),
});

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({ meta: [
    { title: "Historical Events — Research Terminal" },
    { name: "description", content: "Deterministic macro-fingerprint match against a seeded library of rate cycles, oil shocks, tariff rounds, banking stress and recessions." },
  ]}),
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
        purpose="Deterministic fingerprint match on rate level/direction, curve shape, inflation regime, oil regime and unemployment direction. Every analog links to sourced forward-return impacts by sector."
      />

      <section className="mt-4 rounded border border-border/50 bg-card/40 p-4 text-xs text-muted-foreground leading-relaxed">
        <span className="text-foreground font-semibold">How to read this hub. </span>
        The top panel matches today&rsquo;s <em>macro fingerprint</em> — a small set of buckets for rates, yield curve, inflation, oil and unemployment — against a library of ~24 seeded historical episodes. Each analog card shows a <em>Cause</em> and a <em>What happened next</em> summary, plus a badge for whether the narrative has been verified by our algo → API → AI loop. Open any event for the full narrative, sourced citations, and per-sector forward returns. The lower panels let you browse the library by category rather than by fingerprint.
      </section>

      <PanelGrid panels={panels} />
    </AppShell>
  );
}