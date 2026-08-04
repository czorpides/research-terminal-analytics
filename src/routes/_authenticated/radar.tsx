import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Crosshair, Radar as RadarIcon } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { OpportunityRadarDiscoveryView } from "@/components/research/OpportunityRadarDiscoveryView";
import { SwingOutcomesPanel } from "@/components/research/SwingOutcomesPanel";
import { SwingTradesView } from "@/components/research/SwingTradesView";
import { Button } from "@/components/ui/button";
import { getInstitutionalOpportunityWorkspace } from "@/lib/opportunity/institutional.functions";
import { getOpportunityRadarWorkspace } from "@/lib/opportunity/workspace.functions";
import { getRegimeMonitor } from "@/lib/panels/regime.functions";
import { getSwingTradesWorkspace } from "@/lib/swing/workspace.functions";

const radarQueryOptions = queryOptions({
  queryKey: ["opportunity-radar", "horizons-v5-discovery"],
  queryFn: () => getOpportunityRadarWorkspace(),
  staleTime: 15 * 60 * 1000,
  refetchInterval: 15 * 60 * 1000,
  refetchOnWindowFocus: true,
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
  queryKey: ["opportunity-radar", "swing-trades-v2-intraday"],
  queryFn: () => getSwingTradesWorkspace(),
  staleTime: 5 * 60 * 1000,
  refetchInterval: 5 * 60 * 1000,
  refetchOnWindowFocus: true,
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
  const { data: workspace } = useSuspenseQuery(radarQueryOptions);
  const { data: institutionalWorkspace } = useSuspenseQuery(institutionalQueryOptions);
  const { data: regime } = useSuspenseQuery(regimeQueryOptions);
  const swingQuery = useQuery({ ...swingQueryOptions, enabled: view === "swing" });

  return (
    <AppShell>
      <SectionHeader
        code="OR · Opportunity Radar"
        title="Find the opportunity, then decide whether the timing is right"
        purpose="The long-term Opportunity Radar ranks investable research theses. The Swing Trades engine is a separate timing layer that ranks short-term technical setups by momentum, RSI, location, volume, volatility, confirmation, regime, catalyst and reward/risk."
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

      {view === "opportunity" ? (
        <OpportunityRadarDiscoveryView
          workspace={workspace}
          institutionalWorkspace={institutionalWorkspace}
          regime={regime}
        />
      ) : swingQuery.data ? (
        <>
          <SwingTradesView workspace={swingQuery.data} regime={regime} />
          <SwingOutcomesPanel />
        </>
      ) : (
        <div className="rounded-xl border border-border/70 bg-card/55 p-8 text-center text-sm text-muted-foreground">
          Scanning the current equity universe for swing setups…
        </div>
      )}
    </AppShell>
  );
}
