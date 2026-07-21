import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { getEventDetail } from "@/lib/panels/history.functions";

const detailQueryOptions = (code: string) => queryOptions({
  queryKey: ["history", "event", code],
  queryFn: () => getEventDetail({ data: { code } }),
});

export const Route = createFileRoute("/history/$eventId")({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(detailQueryOptions(params.eventId));
    if (!data.event) throw notFound();
    return data;
  },
  head: ({ loaderData }) => ({ meta: [
    { title: loaderData?.event ? `${loaderData.event.name} — Historical Event` : "Historical Event" },
    { name: "description", content: loaderData?.event?.summary ?? "Historical event card." },
  ]}),
  component: EventPage,
  notFoundComponent: () => (
    <AppShell><SectionHeader code="HE · not found" title="Event not found" purpose="No historical event with that code." /></AppShell>
  ),
  errorComponent: ({ error }) => (
    <AppShell><SectionHeader code="HE · error" title="Error loading event" purpose={error.message} /></AppShell>
  ),
});

function EventPage() {
  const { eventId } = Route.useParams();
  const { data } = useSuspenseQuery(detailQueryOptions(eventId));
  const e = data.event!;
  const fp = (e.fingerprint ?? {}) as Record<string, string>;

  return (
    <AppShell>
      <SectionHeader
        code={`HE · ${e.category}`}
        title={e.name}
        purpose={`${new Date(e.start_date).toLocaleDateString()}${e.end_date ? " → " + new Date(e.end_date).toLocaleDateString() : ""}`}
      />
      <div className="grid gap-6 mt-6">
        <section className="rounded border border-border/50 bg-card/50 p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Summary</div>
          <p className="text-sm leading-relaxed">{e.summary}</p>
          {e.source_url && (
            <a href={e.source_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline mt-3 inline-block">Source →</a>
          )}
        </section>

        <section className="rounded border border-border/50 bg-card/50 p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Macro fingerprint</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            {Object.entries(fp).map(([k, v]) => (
              <div key={k}>
                <div className="text-xs text-muted-foreground">{k.replace(/_/g, " ")}</div>
                <div className="font-mono">{v}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 text-xs text-muted-foreground">Tags: {(e.tags ?? []).join(", ")}</div>
        </section>

        <section className="rounded border border-border/50 bg-card/50 p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Forward-return impacts</div>
          {data.impacts.length === 0 ? (
            <div className="text-sm text-muted-foreground">No impacts recorded.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border/40">
                  <th className="py-2">Scope</th><th>Code</th><th>Window (d)</th><th className="text-right">Return</th><th>Note</th>
                </tr>
              </thead>
              <tbody>
                {data.impacts.map((im, i) => (
                  <tr key={i} className="border-b border-border/20">
                    <td className="py-2 text-muted-foreground">{im.scope_type}</td>
                    <td className="font-mono">{im.scope_code}</td>
                    <td>{im.window_days}</td>
                    <td className={`text-right font-mono ${im.return_pct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {im.return_pct >= 0 ? "+" : ""}{im.return_pct}%
                    </td>
                    <td className="text-xs text-muted-foreground">{im.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <Link to="/history" className="text-xs text-primary underline">← Back to Historical Events</Link>
      </div>
    </AppShell>
  );
}