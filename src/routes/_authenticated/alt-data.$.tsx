import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { PlannedFeaturePage } from "@/components/PlannedFeaturePage";

export const Route = createFileRoute("/_authenticated/alt-data/$")({
  head: () => ({ meta: [{ title: "Alternative Data — Research Terminal" }] }),
  component: AltDataSplat,
});

function AltDataSplat() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  return <PlannedFeaturePage pathname={pathname} />;
}