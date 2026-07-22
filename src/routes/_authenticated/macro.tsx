import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Macro is a layout route. The overview lives in macro.index.tsx, while each
 * engine renders through this outlet at its own URL.
 */
export const Route = createFileRoute("/_authenticated/macro")({
  component: MacroLayout,
});

function MacroLayout() {
  return <Outlet />;
}
