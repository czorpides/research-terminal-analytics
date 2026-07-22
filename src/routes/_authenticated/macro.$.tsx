import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { PlannedFeaturePage } from "@/components/PlannedFeaturePage";

export const Route = createFileRoute("/_authenticated/macro/$")({
  head: () => ({ meta: [{ title: "Macro — Research Terminal" }] }),
  component: MacroSplat,
});

function MacroSplat() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  return <PlannedFeaturePage pathname={pathname} />;
}