import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { SOURCE_TIER_META } from "@/lib/reliability/tiers";
import { DEFAULT_FRESHNESS } from "@/lib/reliability/freshness";
import { getDataHealthOverview, triggerVerifierRun } from "@/lib/panels/data-health.functions";
import { getSourceFreshness } from "@/lib/freshness/freshness.functions";
import { getGrowthHealth } from "@/lib/panels/growth-health.functions";
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
  const fetchFreshness = useServerFn(getSourceFreshness);
  const fetchGrowth = useServerFn(getGrowthHealth);
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const { data } = useQuery({ queryKey: ["data-health"], queryFn: () => fetchOverview(), refetchOnWindowFocus: false });
  const { data: freshness } = useQuery({
    queryKey: ["source-freshness"],
    queryFn: () => fetchFreshness(),
    refetchInterval: 60_000,
  });
  const { data: growth } = useQuery({
    queryKey: ["stage1-growth-health"],
    queryFn: () => fetchGrowth(),
    refetchInterval: 60_000,
  });

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
        <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Source freshness · live watchdog
        </h2>
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase text-muted-foreground">
            <tr className="border-b border-border/60">
              <th className="py-1 text-left">Source</th>
              <th className="text-left">Cadence</th>
              <th className="text-left">Latest observation</th>
              <th className="text-right">Lag</th>
              <th className="text-right">Max allowed</th>
              <th className="text-left">State</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {(freshness ?? []).map((r) => (
              <tr key={r.sourceCode} className="border-b border-border/40 last:border-b-0">
                <td className="py-1 pr-2 uppercase">{r.sourceCode}</td>
                <td className="pr-2 text-muted-foreground">{r.cadence}</td>
                <td className="pr-2 text-muted-foreground">{r.latestAsOf ? new Date(r.latestAsOf).toLocaleString() : "—"}</td>
                <td className="text-right tabular-nums">{r.lagMinutes !== null ? formatDur(r.lagMinutes * 60) : "—"}</td>
                <td className="text-right tabular-nums text-muted-foreground">{formatDur(r.maxLagMinutes * 60)}</td>
                <td className="pr-2">
                  <span className={
                    r.state === "fresh" ? "text-[var(--positive)]" :
                    r.state === "lagging" ? "text-[var(--warning)]" :
                    "text-[var(--negative)]"
                  }>{r.state}</span>
                </td>
              </tr>
            ))}
            {!freshness && <tr><td colSpan={6} className="py-2 text-muted-foreground">Loading…</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="mb-6 rounded-md border border-primary/40 bg-card/60 p-3">
        <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
          Stage 1 · US Growth Engine health
        </h2>
        {!growth && <div className="py-2 text-xs text-muted-foreground">Loading…</div>}
        {growth && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4 font-mono text-[10px]">
              <Kv k="Analytics URL" v={growth.analytics.urlConfigured ? "configured" : "missing"} bad={!growth.analytics.urlConfigured} />
              <Kv k="Analytics token" v={growth.analytics.tokenConfigured ? "configured" : "missing"} bad={!growth.analytics.tokenConfigured} />
              <Kv k="Service reachable"
                  v={growth.analytics.reachable === null ? "not probed" : growth.analytics.reachable ? "yes" : "no"}
                  bad={growth.analytics.reachable === false} />
              <Kv k="Service ver" v={growth.analytics.serviceVersion ?? "—"} />
              <Kv k="Data version" v="raw_observations.v1" />
              <Kv k="Model version" v={growth.model.currentModelVersion ?? "—"} />
              <Kv k="Calc mode" v={growth.model.lastRun?.calculationMode ?? "—"} />
              <Kv k="Successful runs" v={String(growth.model.successfulRunCount)} />
              <Kv k="Eligible" v={String(growth.counts.eligible)} />
              <Kv k="With Kalman output" v={String(growth.counts.withOutput)} />
              <Kv k="Skipped (min-history)" v={String(growth.counts.skipped)} bad={growth.counts.skipped > 0} />
              <Kv k="Data changed since run" v={growth.model.dataChangedSinceLastRun ? "yes — rerun due" : "no"} bad={growth.model.dataChangedSinceLastRun} />
            </div>
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Ingestion · last US Growth FRED run</div>
            </div>
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Recurring scheduler</div>
              {growth.scheduler ? (
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4 font-mono text-[10px]">
                  <Kv k="Cron heartbeat" v={growth.scheduler.silentCron ? "silent >26h" : "active"} bad={growth.scheduler.silentCron} />
                  <Kv k="Failures 24h" v={String(growth.scheduler.failuresLast24h)} bad={growth.scheduler.failuresLast24h > 0} />
                  <Kv k="Last run status" v={growth.scheduler.lastRunStatus ?? "—"} bad={growth.scheduler.lastRunStatus === "failed"} />
                  <Kv k="Last run scope" v={(growth.scheduler.lastRunScope ?? []).join(", ") || "—"} />
                  <Kv k="Stale indicators" v={String(growth.scheduler.staleIndicators.length)} bad={growth.scheduler.staleIndicators.length > 0} />
                </div>
              ) : <div className="text-xs text-muted-foreground">Scheduler view not populated yet.</div>}
            </div>
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Ingestion · last US Growth FRED run (detail)</div>
              {growth.ingestion.lastRun ? (
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4 font-mono text-[10px]">
                  <Kv k="Started" v={new Date(growth.ingestion.lastRun.startedAt).toLocaleString()} />
                  <Kv k="Status" v={growth.ingestion.lastRun.status} bad={growth.ingestion.lastRun.status !== "success"} />
                  <Kv k="Rows" v={String(growth.ingestion.lastRun.rowsIngested ?? 0)} />
                  <Kv k="New / revisions / failed" v={`${growth.ingestion.lastRun.newObservations} / ${growth.ingestion.lastRun.revisions} / ${growth.ingestion.lastRun.failedCount}`} />
                </div>
              ) : <div className="text-xs text-muted-foreground">No ingestion run recorded yet.</div>}
            </div>
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Latest Kalman run</div>
              {growth.model.lastRun ? (
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4 font-mono text-[10px]">
                  <Kv k="Started" v={new Date(growth.model.lastRun.startedAt).toLocaleString()} />
                  <Kv k="Status" v={growth.model.lastRun.status} bad={growth.model.lastRun.status !== "success"} />
                  <Kv k="Processed / skipped" v={`${growth.model.lastRun.indicatorsProcessed ?? 0} / ${growth.model.lastRun.indicatorsSkipped ?? 0}`} />
                  <Kv k="Output rows" v={String(growth.model.lastRun.outputRows ?? 0)} />
                </div>
              ) : <div className="text-xs text-muted-foreground">No Kalman run recorded yet.</div>}
            </div>
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase text-muted-foreground">
                <tr className="border-b border-border/60">
                  <th className="py-1 text-left">Indicator</th>
                  <th className="text-left">Series</th>
                  <th className="text-left">Freq</th>
                  <th className="text-right">Obs</th>
                  <th className="text-right">Vintages</th>
                  <th className="text-left">Earliest</th>
                  <th className="text-left">Latest</th>
                  <th className="text-right">Stale (d)</th>
                  <th className="text-left">Min-hist</th>
                  <th className="text-left">Kalman</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {growth.indicators.map((i) => (
                  <tr key={i.concept_code} className="border-b border-border/40 last:border-b-0">
                    <td className="py-1 pr-2">{i.concept_code}</td>
                    <td className="pr-2 text-muted-foreground">{i.series_code}</td>
                    <td className="pr-2 text-muted-foreground">{i.frequency}</td>
                    <td className="text-right tabular-nums">{i.observation_count}</td>
                    <td className="text-right tabular-nums">{i.vintage_count}</td>
                    <td className="pr-2 text-muted-foreground">{i.earliest_observation ?? "—"}</td>
                    <td className="pr-2 text-muted-foreground">{i.latest_observation ?? "—"}</td>
                    <td className={"text-right tabular-nums " + ((i.staleness_days ?? 0) > 45 ? "text-[var(--warning)]" : "")}>{i.staleness_days ?? "—"}</td>
                    <td className={"pr-2 " + (i.meets_min_history ? "text-[var(--positive)]" : "text-[var(--warning)]")}>
                      {i.observation_count}/{i.min_history ?? "?"}
                    </td>
                    <td className={"pr-2 " + (i.has_kalman_output ? "text-[var(--positive)]" : "text-muted-foreground")}>
                      {i.has_kalman_output ? `output @ ${i.latest_output_ts ?? "—"}` : "not run"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {growth.warnings.length > 0 && (
              <div className="rounded-sm border border-[var(--warning)]/40 bg-[var(--warning)]/5 p-2">
                <div className="mb-1 text-[10px] uppercase tracking-wider text-[var(--warning)]">Open warnings</div>
                <ul className="list-inside list-disc space-y-0.5 text-[11px]">
                  {growth.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="mb-6 rounded-md border border-border/70 bg-card/60 p-3">
        <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Sources · live · full list</h2>
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

function Kv({ k, v, bad }: { k: string; v: string; bad?: boolean }) {
  return (
    <div className="rounded-sm border border-border/50 bg-background/40 px-2 py-1">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{k}</div>
      <div className={bad ? "text-[var(--warning)]" : ""}>{v}</div>
    </div>
  );
}