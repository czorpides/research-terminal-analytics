import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { EquityExplorerView } from "@/components/research/EquityExplorerView";

export const Route = createFileRoute("/_authenticated/overvaluation")({
  head: () => ({
    meta: [
      { title: "Overvaluation Risk Queue — Research Terminal" },
      {
        name: "description",
        content:
          "Cross-market downside research queue combining expensive valuation with quality, momentum, trend and volatility evidence.",
      },
    ],
  }),
  component: Overvaluation,
});

function Overvaluation() {
  return (
    <AppShell>
      <SectionHeader
        code="OV · Overvaluation"
        title="Which expensive names also carry weakening supporting evidence?"
        purpose="Screen the full US, UK and EU population for expensive peer-relative valuation, then rank the result by a transparent risk setup. This is a downside research queue, not a short recommendation engine."
      />
      <EquityExplorerView mode="overvalued" />
    </AppShell>
  );
}
