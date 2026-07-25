import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { EquityExplorerView } from "@/components/research/EquityExplorerView";

export const Route = createFileRoute("/_authenticated/undervaluation")({
  head: () => ({
    meta: [
      { title: "Undervaluation Research Queue — Research Terminal" },
      {
        name: "description",
        content:
          "Paginated US, UK and EU value research queue with quality, trend, confidence and evidence-coverage gates.",
      },
    ],
  }),
  component: Undervaluation,
});

function Undervaluation() {
  return (
    <AppShell>
      <SectionHeader
        code="UV · Undervaluation"
        title="Where does valuation look attractive without ignoring business quality?"
        purpose="Filter and rank the entire active US, UK and EU equity population. The default queue requires peer-relative valuation strength and a minimum quality floor; missing fundamentals remain visible through the coverage controls rather than being treated as cheap."
      />
      <EquityExplorerView mode="undervalued" />
    </AppShell>
  );
}
