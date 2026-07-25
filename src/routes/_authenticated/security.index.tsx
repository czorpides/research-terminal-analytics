import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { EquityExplorerView } from "@/components/research/EquityExplorerView";

export const Route = createFileRoute("/_authenticated/security/")({
  head: () => ({
    meta: [
      { title: "Global Security Master — Research Terminal" },
      {
        name: "description",
        content:
          "Paginated US, UK and EU equity master with latest deterministic scores, market identity and data coverage.",
      },
    ],
  }),
  component: SecurityIndex,
});

function SecurityIndex() {
  return (
    <AppShell>
      <SectionHeader
        code="SM · Security Master"
        title="The global equity universe, one auditable instrument at a time."
        purpose="Reference identity, market, sector, latest deterministic scores and coverage across the full active population. Search or filter before opening any company for its security-level evidence trail."
      />
      <EquityExplorerView mode="master" />
    </AppShell>
  );
}
