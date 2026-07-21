import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { SOURCE_TIER_META } from "@/lib/reliability/tiers";
import { DEFAULT_FRESHNESS } from "@/lib/reliability/freshness";
import { getDataHealthOverview, triggerVerifierRun } from "@/lib/panels/data-health.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/data-health")({
  head: () => ({ meta: [
    { title: "Data Health — Research Terminal" },
    { name: "description", content: "Source tiers, freshness policies, ingestion runs and model governance." },
  ]}),
  component: DataHealth,
});

function DataHealth() {
  const fetchOverview = useServerFn(getDataHealthOverview);
  const runVerifier = useServerFn(triggerVerifierRun);
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const { data } = useQuery({ queryKey: ["data-health"], queryFn: () => fetchOverview(), refetchOnWindowFocus: false });

  async function onRun() {
    setRunning(true);
    try { await runVerifier({ data: {} }); await qc.invalidateQueries({ queryKey: ["data-health"] }); }
    finally { setRunning(false); }
  }

  return (
    <AppShell>
      <SectionHeader
        code="DH · Data Health & Governance"
        title="Is the underlying data trustworthy right now?"
        purpose="The reliability framework driving every panel's confidence score. Owner-only administration lives here."
      />

      <section className="mb-6 rounded-md border border-border/70 bg-card/60 p-3">
        <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Sources · live</h2>
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase text-muted-foreground">
            <tr className="border-b border-border/60">
              <th className="py-1 text-left">Provider</th>
              <th className="text-left">Tier</th>
              <th className="text-left">Last run</th>
              <th className="text-left">Status</th>
              <th className="text-right">Rows 24h</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {(data?.sources ?? []).map((s) => (
              <tr key={s.id} className="border-b border-border/40 last:border-b-0">
                <td className="py-1 pr-2">{s.name}</td>
                <td className="pr-2 text-muted-foreground">{s.tier}</td>
                <td className="pr-2 text-muted-foreground">{s.lastRunAt ? new Date(s.lastRunAt).toLocaleString() : "—"}</td>
                <td className="pr-2">
                  {s.lastRunStatus ? (
                    <Badge variant="outline" className="text-[10px] uppercase">{s.lastRunStatus}</Badge>
                  ) : <span className="text-muted-foreground">idle</span>}
                </td>
                <td className="text-right tabular-nums">{s.rowsIngested24h.toLocaleString()}</td>
              </tr>
            ))}
            {!data && <tr><td colSpan={5} className="py-2 text-muted-foreground">Loading…</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="mb-6 rounded-md border border-border/70 bg-card/60 p-3">
        <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Recent ingestion runs</h2>
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase text-muted-foreground">
            <tr className="border-b border-border/60">
              <th className="py-1 text-left">Started</th>
              <th className="text-left">Source</th>
              <th className="text-left">Category</th>
              <th className="text-left">Status</th>
              <th className="text-right">Rows</th>
              <th className="text-left">Error</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {(data?.recentRuns ?? []).map((r) => (
              <tr key={r.id} className="border-b border-border/40 last:border-b-0">
                <td className="py-1 pr-2 text-muted-foreground">{new Date(r.startedAt).toLocaleString()}</td>
                <td className="pr-2">{r.sourceName}</td>
                <td className="pr-2 text-muted-foreground">{r.category}</td>
                <td className="pr-2">
                  <span className={r.status === "success" ? "text-[var(--positive)]" : r.status === "failed" ? "text-[var(--negative)]" : "text-[var(--warning)]"}>
                    {r.status}
                  </span>
                </td>
                <td className="text-right tabular-nums">{r.rowsIngested ?? 0}</td>
                <td className="pr-2 text-[var(--negative)] truncate max-w-[16rem]">{r.error ?? ""}</td>
              </tr>
            ))}
            {data && data.recentRuns.length === 0 && <tr><td colSpan={6} className="py-2 text-muted-foreground">No runs recorded yet.</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="mb-6 rounded-md border border-border/70 bg-card/60 p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Verifier audit trail · latest 25 runs
          </h2>
          <Button size="sm" variant="outline" className="h-7 text-[10px] uppercase tracking-wider" disabled={running} onClick={onRun}>
            {running ? "Running…" : "Run verifier now"}
          </Button>
        </div>
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase text-muted-foreground">
            <tr className="border-b border-border/60">
              <th className="py-1 text-left">Started</th>
              <th className="text-left">Panel</th>
              <th className="text-left">Check</th>
              <th className="text-left">Verifier</th>
              <th className="text-left">Status</th>
              <th className="text-left">Trigger</th>
              <th className="text-left">Runner</th>
              <th className="text-left">Calc ver</th>
              <th className="text-right">Conf</th>
              <th className="text-right">ms</th>
              <th className="text-left">Detail</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {(data?.verifyRuns ?? []).map((r) => (
              <tr key={r.id} className="border-b border-border/40 last:border-b-0">
                <td className="py-1 pr-2 text-muted-foreground">{new Date(r.startedAt).toLocaleString()}</td>
                <td className="pr-2">{r.panelId}</td>
                <td className="pr-2 text-muted-foreground truncate max-w-[14rem]">{r.checkId}</td>
                <td className="pr-2"><Badge variant="outline" className="text-[10px] uppercase">{r.verifier}</Badge></td>
                <td className="pr-2">
                  <span className={r.status === "pass" ? "text-[var(--positive)]" : r.status === "fail" || r.status === "stale" ? "text-[var(--negative)]" : "text-[var(--warning)]"}>
                    {r.status}
                  </span>
                </td>
                <td className="pr-2 text-muted-foreground">{r.trigger ?? "—"}</td>
                <td className="pr-2 text-muted-foreground">{r.runnerKey ?? "—"}</td>
                <td className="pr-2 text-muted-foreground">{r.calcVersion ?? "—"}</td>
                <td className="text-right tabular-nums">{r.confidence !== null ? r.confidence.toFixed(2) : "—"}</td>
                <td className="text-right tabular-nums text-muted-foreground">{r.durationMs ?? "—"}</td>
                <td className="pr-2 text-muted-foreground truncate max-w-[18rem]">{r.detail ?? ""}</td>
              </tr>
            ))}
            {data && data.verifyRuns.length === 0 && <tr><td colSpan={11} className="py-2 text-muted-foreground">No verification runs yet — click "Run verifier now" or wait for the 30-minute cron.</td></tr>}
          </tbody>
        </table>
      </section>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <section className="rounded-md border border-border/70 bg-card/60 p-3">
          <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Source hierarchy (spec §19)
          </h2>
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase text-muted-foreground">
              <tr className="border-b border-border/60"><th className="py-1 text-left">Tier</th><th className="text-left">Description</th><th className="text-right">Weight</th></tr>
            </thead>
            <tbody className="font-mono">
              {Object.entries(SOURCE_TIER_META).map(([k, v]) => (
                <tr key={k} className="border-b border-border/40 last:border-b-0">
                  <td className="py-1 pr-2">{v.label}</td>
                  <td className="pr-2 text-muted-foreground">{v.description}</td>
                  <td className="text-right tabular-nums">{v.weight.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rounded-md border border-border/70 bg-card/60 p-3">
          <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Freshness policies
          </h2>
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase text-muted-foreground">
              <tr className="border-b border-border/60"><th className="py-1 text-left">Category</th><th className="text-right">Warn</th><th className="text-right">Max</th></tr>
            </thead>
            <tbody className="font-mono">
              {Object.entries(DEFAULT_FRESHNESS).map(([k, v]) => (
                <tr key={k} className="border-b border-border/40 last:border-b-0">
                  <td className="py-1 pr-2">{k}</td>
                  <td className="text-right tabular-nums">{formatDur(v.warnAgeSeconds)}</td>
                  <td className="text-right tabular-nums">{formatDur(v.maxAgeSeconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </AppShell>
  );
}

function formatDur(s: number): string {
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}