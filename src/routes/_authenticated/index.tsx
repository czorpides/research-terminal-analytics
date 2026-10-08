import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { PanelGrid } from "@/components/research/PanelGrid";
import { getCommandCentrePanels } from "@/lib/panels/command-centre.functions";

const ccQueryOptions = queryOptions({
  queryKey: ["panels", "command-centre"],
  queryFn: () => getCommandCentrePanels(),
});

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({ meta: [
    { title: "Command Centre — Research Terminal" },
    { name: "description", content: "Regime, top opportunities, top risks, data health and verifier activity — the one screen for what deserves attention right now." },
  ]}),
  component: CommandCentre,
});

function CommandCentre() {
  const query = useQuery({ ...ccQueryOptions, retry: false, staleTime: 5 * 60_000 });
  return (
    <AppShell>
      <SectionHeader
        code="CC · Command Centre"
        title="Where should I research next?"
        purpose="Regime, top opportunities, top risks and data health synthesised in one screen. Every metric traces back to a deterministic table — no black boxes."
      />
      {query.data ? <PanelGrid panels={query.data} /> : (
        <section role="status" className="rounded-xl border border-border/70 bg-card p-5 text-sm">
          {query.isError ? "Command Centre data is unavailable. Other research pages remain accessible." : "Loading Command Centre data…"}
          {query.isError && <button type="button" className="ml-3 underline" onClick={() => void query.refetch()}>Retry</button>}
        </section>
      )}
    </AppShell>
  );
}
