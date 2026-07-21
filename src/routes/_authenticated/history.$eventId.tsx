import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { getEventDetail } from "@/lib/panels/history.functions";
import { HISTORY_GLOSSARY } from "@/lib/history/glossary";

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
  const e = data.event! as unknown as {
    name: string; code: string; category: string; start_date: string; end_date: string | null;
    summary: string | null; source_url: string | null; tags: string[] | null;
    fingerprint: Record<string, string> | null;
    causes: string | null; mechanism: string | null; what_happened_next: string | null; key_takeaway: string | null;
    citations: Array<{ title: string; url: string; publisher: string }> | null;
    narrative_status: string; narrative_confidence: number | null; narrative_verifier: string | null;
    narrative_verified_at: string | null; narrative_issues: string[] | null; narrative_attempts: number | null;
  };
  const fp = (e.fingerprint ?? {}) as Record<string, string>;
  const citations = e.citations ?? [];
  const badgeClass = e.narrative_status === "verified" ? "text-emerald-400 border-emerald-500/40"
                    : e.narrative_status === "needs_review" ? "text-amber-400 border-amber-500/40"
                    : "text-muted-foreground border-border/60";

  return (
    <AppShell>
      <SectionHeader
        code={`HE · ${e.category}`}
        title={e.name}
        purpose={`${new Date(e.start_date).toLocaleDateString()}${e.end_date ? " → " + new Date(e.end_date).toLocaleDateString() : ""}`}
      />

      {/* About this page */}
      <section className="mt-4 rounded border border-border/50 bg-card/40 p-4 text-xs text-muted-foreground leading-relaxed">
        <span className="text-foreground font-semibold">About this page. </span>
        Every historical event is described in plain English across five sections — <em>Summary</em>, <em>Causes</em>, <em>Mechanism</em>, <em>What happened next</em>, <em>Key takeaway</em> — and every claim traces back to the <em>Citations</em> below.
        The <em>Verification</em> block shows how the narrative was checked: algorithm (structure + trusted-publisher allowlist) → API (link liveness) → AI (coherence). If AI can&rsquo;t verify, the loop rewrites the fields grounded in the citations and re-checks up to two more times before marking <em>needs review</em>.
      </section>

      {/* Verification status */}
      <section className={`mt-3 rounded border ${badgeClass} bg-card/30 p-3 flex items-center justify-between text-xs`}>
        <div>
          <span className="uppercase tracking-wider font-semibold">Narrative status</span>
          <span className="ml-2">{e.narrative_status.replace("_", " ")}</span>
          {e.narrative_confidence !== null && <span className="ml-2 font-mono">· AI confidence {e.narrative_confidence}/100</span>}
          {e.narrative_verified_at && <span className="ml-2 text-muted-foreground">· last checked {new Date(e.narrative_verified_at).toLocaleString()}</span>}
          {e.narrative_attempts ? <span className="ml-2 text-muted-foreground">· {e.narrative_attempts} rewrite pass{e.narrative_attempts === 1 ? "" : "es"}</span> : null}
        </div>
      </section>

      <div className="grid gap-6 mt-6">
        <section className="rounded border border-border/50 bg-card/50 p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Summary</div>
          <p className="text-sm leading-relaxed">{e.summary}</p>
        </section>

        <NarrativeBlock title="Causes" body={e.causes} placeholder="Awaiting narrative verification pass." />
        <NarrativeBlock title="Mechanism (how it transmitted through the system)" body={e.mechanism} placeholder="Awaiting narrative verification pass." />
        <NarrativeBlock title="What happened next" body={e.what_happened_next} placeholder="Awaiting narrative verification pass." />
        <NarrativeBlock title="Key takeaway" body={e.key_takeaway} placeholder="Awaiting narrative verification pass." />

        {/* Citations */}
        <section className="rounded border border-border/50 bg-card/50 p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Citations</div>
          {citations.length === 0 ? (
            <div className="text-sm text-muted-foreground">No citations recorded yet.</div>
          ) : (
            <ul className="space-y-2">
              {citations.map((c, i) => (
                <li key={i} className="text-sm">
                  <a href={c.url} target="_blank" rel="noreferrer" className="text-primary underline">{c.title}</a>
                  <span className="ml-2 text-xs text-muted-foreground">— {c.publisher}</span>
                </li>
              ))}
            </ul>
          )}
          {e.narrative_issues && e.narrative_issues.length > 0 && (
            <div className="mt-3 text-[11px] text-amber-400/80">Open issues: {e.narrative_issues.join(", ")}</div>
          )}
        </section>

        <section className="rounded border border-border/50 bg-card/50 p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Macro fingerprint — what the metrics mean</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            {Object.entries(fp).map(([k, v]) => {
              const g = HISTORY_GLOSSARY[k];
              return (
                <div key={k} className="rounded border border-border/40 p-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{g?.term ?? k.replace(/_/g, " ")}</div>
                  <div className="font-mono text-sm mt-0.5">{v}</div>
                  {g && <div className="mt-1 text-[11px] text-muted-foreground leading-snug">{g.plain}</div>}
                  {g?.buckets?.[v] && <div className="mt-0.5 text-[10px] font-mono text-muted-foreground/80">= {g.buckets[v]}</div>}
                </div>
              );
            })}
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

function NarrativeBlock({ title, body, placeholder }: { title: string; body: string | null; placeholder: string }) {
  return (
    <section className="rounded border border-border/50 bg-card/50 p-4">
      <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">{title}</div>
      {body
        ? <p className="text-sm leading-relaxed whitespace-pre-line">{body}</p>
        : <p className="text-sm text-muted-foreground italic">{placeholder}</p>}
    </section>
  );
}