import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { PanelGrid } from "@/components/research/PanelGrid";
import { getCommandCentrePanels } from "@/lib/panels/command-centre.functions";

const ccQueryOptions = queryOptions({
  queryKey: ["panels", "command-centre"],
  queryFn: () => getCommandCentrePanels(),
});

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Command Centre — Research Terminal" },
    { name: "description", content: "Regime, top opportunities, top risks, data health and verifier activity — the one screen for what deserves attention right now." },
  ]}),
  loader: ({ context }) => context.queryClient.ensureQueryData(ccQueryOptions),
  component: CommandCentre,
});

function CommandCentre() {
  const { data: panels } = useSuspenseQuery(ccQueryOptions);
  return (
    <AppShell>
      <SectionHeader
        code="CC · Command Centre"
        title="Where should I research next?"
        purpose="Regime, top opportunities, top risks and data health synthesised in one screen. Every metric traces back to a deterministic table — no black boxes."
      />
      <PanelGrid panels={panels} />
    </AppShell>
  );
}
