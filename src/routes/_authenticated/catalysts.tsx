import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, ClipboardCheck, CalendarClock, ShieldCheck, AlertTriangle } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { getCompanyCatalystWorkspace, type CompanyCatalystRow } from "@/lib/catalysts/company-event.functions";

export const Route = createFileRoute("/_authenticated/catalysts")({
  head: () => ({ meta: [{ title: "Catalyst Intelligence — Research Terminal" },
    { name:"description",content:"Source-verified company events, materiality, expiry and swing-opportunity evidence." }] }),
  component: CatalystIntelligencePage,
});

const filters = [
  {value:"all",label:"All events"},
  {value:"index_inclusion",label:"Index inclusion"},
  {value:"earnings_expectation",label:"Earnings expectations"},
  {value:"earnings_result",label:"Earnings results"},
  {value:"government_contract",label:"Government contracts"},
  {value:"political_statement",label:"Political statements"},
] as const;

function CatalystIntelligencePage() {
  const [filter,setFilter]=useState<string>("all");
  const [symbol,setSymbol]=useState("");
  const query=useQuery({
    queryKey:["company-catalysts","workspace-v0.1"],
    queryFn:()=>getCompanyCatalystWorkspace(),
    staleTime:5*60_000,retry:false,refetchOnWindowFocus:false,
  });
  const rows=useMemo(()=>(query.data?.events ?? []).filter(e =>
    (filter==="all" || e.eventType===filter) &&
    (!symbol.trim() || e.symbol.toLowerCase().includes(symbol.trim().toLowerCase()))
  ),[query.data,filter,symbol]);

  return (
    <AppShell>
      <SectionHeader
        code="CI · Catalyst Intelligence"
        title="What could materially change market expectations?"
        purpose="A standalone event-monitoring and verification ledger feeding future Swing and Opportunity analysis. Index changes, earnings developments, contracts and political headlines are evaluated by source, materiality, timing and evidence—not headline excitement."
        right={<Link to="/swing-trades" className="rounded-md border border-border px-3 py-2 text-xs hover:bg-accent">Open Swing Radar →</Link>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span className="rounded-full border border-border px-2.5 py-1">Shadow research · no trading bonuses</span>
        <span>Time-of-publication verified · events expire automatically</span>
      </div>
      {query.isPending && <section role="status" className="rounded-xl border border-border/70 p-5 text-sm">Loading Catalyst Intelligence…</section>}
      {query.isError && (
        <section role="alert" className="rounded-xl border border-[var(--negative)]/40 p-5 text-sm">
          <p className="font-semibold">Catalyst ledger is not available yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">The new database migration or service connection may still be pending. Other research pages remain available.</p>
          <button type="button" className="mt-3 rounded border border-border px-3 py-1.5 text-xs" onClick={()=>void query.refetch()}>Retry</button>
        </section>
      )}
      {query.data && (<>
        <section className="mb-4 rounded-xl border border-border/70 bg-card/40 p-3 text-xs">
          <div className="font-semibold">Source connections</div>
          <div className="mt-2 flex flex-wrap gap-3 text-muted-foreground">
            <span>SEC EDGAR earnings filings: {query.data.secEdgarConfigured ? "configured · manual internal polling available" : "awaiting SEC contact configuration"}</span>
            <span>Automatic polling: {query.data.scheduledRefreshConfigured ? "enabled" : "not yet scheduled"}</span>
            <span>Index changes / contracts / political statements: source feeds pending</span>
          </div>
        </section>
        <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
          <Metric label="Verified source events" value={query.data.verified} note="Reviewed with source evidence" />
          <Metric label="Active event signals" value={query.data.activeSignals} note="Within event-specific expiry window" />
          <Metric label="Awaiting review" value={query.data.pendingReview} note="Excluded from scores" />
          <Metric label="Unknown / expired" value={query.data.unknownOrExpired} note="No fabricated neutral scores" />
        </div>
        <div className="my-4 flex flex-wrap items-end gap-3 rounded-xl border border-border/70 bg-card p-3">
          <label className="flex min-w-44 flex-1 flex-col gap-1 text-[11px] text-muted-foreground">
            Search ticker
            <input value={symbol} onChange={e=>setSymbol(e.target.value)} placeholder="e.g. QCOM" type="search" className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground" />
          </label>
          <label className="flex min-w-44 flex-1 flex-col gap-1 text-[11px] text-muted-foreground">
            Catalyst category
            <select value={filter} onChange={e=>setFilter(e.target.value)} className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground">
              {filters.map(v=><option value={v.value} key={v.value}>{v.label}</option>)}
            </select>
          </label>
          <button type="button" className="rounded-md border border-border px-3 py-2 text-xs hover:bg-accent" onClick={()=>void query.refetch()} disabled={query.isFetching}>
            {query.isFetching?"Refreshing…":"Refresh ledger"}
          </button>
        </div>
        {query.data.events.length === 0 ? (
          <div className="rounded-xl border border-border/70 bg-card/50 p-6">
            <div className="mb-3 flex items-center gap-2 font-medium"><ClipboardCheck className="h-4 w-4"/> Event infrastructure is ready; no verified company catalysts yet.</div>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              The recovered database has no company-event intake records. This screen deliberately does not manufacture news or give stocks a positive catalyst score. Connect official index, earnings, company-disclosure and contract feeds, then review their timestamped evidence here.
            </p>
            <p className="mt-3 text-xs text-muted-foreground">The existing Release Calendar manages expected dates; the Historical Events section is for retrospective studies.</p>
          </div>
        ) : rows.length === 0 ? (
          <div role="status" className="rounded-xl border border-border/70 p-5 text-sm text-muted-foreground">No events match these filters.</div>
        ) : (
          <div className="space-y-3">
            {rows.map(row=><EventCard key={row.id} row={row}/>)}
          </div>
        )}
        <section className="mt-6 rounded-xl border border-border/70 bg-card p-4">
          <h2 className="text-sm font-semibold">Official index-announcement inbox</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            S&P Dow Jones Indices source documents are captured here before any company is matched. Additions, deletions and transaction-related changes are not automatically interpreted as bullish stock catalysts.
          </p>
          <div className="my-3 text-xs text-muted-foreground">
            {query.data.lastIndexPoll
              ? `Last poll: ${query.data.lastIndexPoll.status} · ${query.data.lastIndexPoll.startedAt.slice(0,16).replace("T"," ")} UTC · ${query.data.lastIndexPoll.observed} qualifying source documents`
              : "Not yet polled"}
            {query.data.lastIndexPoll?.warning && <span className="ml-2">· {query.data.lastIndexPoll.warning}</span>}
          </div>
          {query.data.indexDocuments.length===0 ? (
            <p role="status" className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
              No index-announcement source documents ingested yet. The index provider and polling worker are being configured.
            </p>
          ) : <div className="space-y-2">
            {query.data.indexDocuments.map(doc=>(
              <div key={doc.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border/70 p-3">
                <div className="min-w-0 flex-1">
                  <a href={doc.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-medium underline underline-offset-2">{doc.title}</a>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Published {doc.publishedAt.slice(0,10)} · first observed {doc.firstObservedAt.slice(0,10)} · {doc.state === "unmapped" ? "Ticker mapping and verification pending" : doc.state}
                  </p>
                </div>
                <span className="rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground">{doc.state}</span>
              </div>
            ))}
          </div>}
        </section>
        <p className="mt-5 text-xs leading-5 text-muted-foreground">
          {query.data.note} Last source publication: {query.data.latestKnownAt ? query.data.latestKnownAt.slice(0,10) : "unavailable"}.
          Source publication and verification timestamps prevent using future news in historical backtests.
        </p>
      </>)}
    </AppShell>
  );
}
function Metric({label,value,note}:{label:string;value:number;note:string}) {
  return <div className="rounded-lg border border-border/70 bg-card p-3">
    <div className="text-[10px] text-muted-foreground">{label}</div>
    <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    <p className="mt-1 text-[10px] text-muted-foreground">{note}</p>
  </div>;
}
function EventCard({row}:{row:CompanyCatalystRow}) {
  const assessment=row.assessment;
  const active=assessment.state==="active";
  return <article className="rounded-xl border border-border/70 bg-card p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2"><span className="font-mono text-xs font-semibold">{row.symbol}</span>
        <span className="text-xs text-muted-foreground">{row.companyName}</span>
      </div>
      <div className="flex gap-2 text-[10px] text-muted-foreground">
        <span className="rounded border border-border px-2 py-1">{row.eventType.replaceAll("_"," ")}</span>
        <span className="rounded border border-border px-2 py-1">{active?"Verified · active":assessment.state}</span>
      </div>
    </div>
    <h2 className="mt-3 text-sm font-semibold">{row.headline}</h2>
    {row.summary && <p className="mt-1 text-xs leading-5 text-muted-foreground">{row.summary}</p>}
    <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">
      <span className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5"/> {assessment.priorityScore===null?"No verified upside score":`Upside signal ${assessment.priorityScore.toFixed(1)} / 100`}</span>
      {assessment.downsideRiskScore!==null && <span className="flex items-center gap-1 text-[var(--negative)]"><AlertTriangle className="h-3.5 w-3.5"/> Downside risk {assessment.downsideRiskScore.toFixed(1)}</span>}
      <span className="flex items-center gap-1 text-muted-foreground"><CalendarClock className="h-3.5 w-3.5"/>{row.knownAt.slice(0,10)} publicly known</span>
      <a href={row.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline hover:text-foreground">{row.sourceName}<ArrowUpRight className="h-3 w-3"/></a>
    </div>
    <p className="mt-2 text-[11px] text-muted-foreground">{assessment.explanation}</p>
  </article>;
}
