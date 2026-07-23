import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { AppShell } from "@/components/layout/AppShell";
import { BondDashboardView } from "@/components/research/BondDashboardView";
import { getBondDashboard } from "@/lib/panels/bonds.functions";

export const Route = createFileRoute("/_authenticated/macro/bonds")({
  head: () => ({
    meta: [
      { title: "US Bonds — Research Terminal" },
      {
        name: "description",
        content:
          "US Treasury curve, real yields, inflation pricing, corporate spreads, rate drivers and duration effects.",
      },
    ],
  }),
  component: BondsPage,
});

function BondsPage() {
  const load = useServerFn(getBondDashboard);
  const { data, isLoading, error } = useQuery({
    queryKey: ["macro", "bonds", "dashboard"],
    queryFn: () => load(),
    staleTime: 2 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
  return (
    <AppShell>
      {isLoading && <div className="text-xs text-muted-foreground">Loading bond markets…</div>}
      {error && (
        <div className="text-xs text-[var(--negative)]">
          Bonds unavailable: {(error as Error).message}
        </div>
      )}
      {data && <BondDashboardView data={data} />}
    </AppShell>
  );
}
