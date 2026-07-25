import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { AlertsWorkspace } from "@/components/research/AlertsWorkspace";

export const Route = createFileRoute("/_authenticated/alerts")({
  head: () => ({
    meta: [
      { title: "Alerts — Research Terminal" },
      {
        name: "description",
        content:
          "Live deterministic alert rules, threshold firings, confidence and retained evaluation history.",
      },
    ],
  }),
  component: Alerts,
});

function Alerts() {
  return (
    <AppShell>
      <SectionHeader
        code="AL · Alerts"
        title="What crossed a stored threshold, and why did it fire?"
        purpose="Review active and paused rules alongside the retained firing history. Every alert exposes its rule relationship, stored confidence, state and evaluation detail rather than acting as an unexplained notification."
      />
      <AlertsWorkspace />
    </AppShell>
  );
}
