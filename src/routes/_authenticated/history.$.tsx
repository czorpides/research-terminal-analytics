import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { PlannedFeaturePage } from "@/components/PlannedFeaturePage";

// Splat fallback for /history/* — the more-specific $eventId dynamic route
// (history.$eventId.tsx) wins over this splat for real event detail URLs.
export const Route = createFileRoute("/_authenticated/history/$")({
  head: () => ({ meta: [{ title: "Historical Events — Research Terminal" }] }),
  component: HistorySplat,
});

function HistorySplat() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  return <PlannedFeaturePage pathname={pathname} />;
}