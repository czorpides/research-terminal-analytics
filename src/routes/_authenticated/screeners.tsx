import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { EquityExplorerView } from "@/components/research/EquityExplorerView";

export const Route = createFileRoute("/_authenticated/screeners")({
  head: () => ({
    meta: [
      { title: "Global Equity Screeners — Research Terminal" },
      {
        name: "description",
        content:
          "Server-side filters across the active US, UK and EU equity universe with paginated results and explicit data coverage.",
      },
    ],
  }),
  component: Screeners,
});

function Screeners() {
  return (
    <AppShell>
      <SectionHeader
        code="SC · Screeners"
        title="Which companies match a precise, testable research thesis?"
        purpose="Search and combine market, country, sector, momentum, trend, valuation, quality, composite and evidence-coverage filters. All filters run against the complete active universe before the result is paginated."
      />
      <EquityExplorerView mode="screener" />
    </AppShell>
  );
}
