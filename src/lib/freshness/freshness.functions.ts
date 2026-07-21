import { createServerFn } from "@tanstack/react-start";

export interface SourceFreshnessRow {
  sourceCode: string;
  cadence: string;
  maxLagMinutes: number;
  latestAsOf: string | null;
  lagMinutes: number | null;
  state: "fresh" | "lagging" | "stale" | "dead" | "unknown";
  lastCronRunAt: string | null;
  lastCronStatus: string | null;
}

/**
 * Reads live max(as_of) per source and joins it against the expected cadence
 * from `source_freshness_expectations`. Used by Data Health to surface silent
 * ingestion failures — the exact class of bug that was hiding stale charts.
 */
export const getSourceFreshness = createServerFn({ method: "GET" }).handler(async (): Promise<SourceFreshnessRow[]> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: exp } = await supabaseAdmin
    .from("source_freshness_expectations")
    .select("source_code, cadence, max_lag_minutes");

  const { data: latestPerSource } = await supabaseAdmin.rpc as unknown as (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: Array<{ provider_code: string; latest: string | null }> | null }>;

  // Fallback: compute via a direct query (RPC not defined) — join data_sources -> data_points.
  const { data: sources } = await supabaseAdmin
    .from("data_sources")
    .select("id, provider_code");
  const latestByCode = new Map<string, string | null>();
  for (const s of sources ?? []) {
    if (!s.provider_code) continue;
    const { data: dp } = await supabaseAdmin
      .from("data_points")
      .select("as_of")
      .eq("source_id", s.id)
      .order("as_of", { ascending: false })
      .limit(1)
      .maybeSingle();
    latestByCode.set(s.provider_code, dp?.as_of ?? null);
  }

  // Best-effort cron read (cron.job_run_details is not exposed via PostgREST) — omit.
  const now = Date.now();
  const rows: SourceFreshnessRow[] = (exp ?? []).map((e) => {
    const latest = latestByCode.get(e.source_code) ?? null;
    const lag = latest ? Math.round((now - new Date(latest).getTime()) / 60000) : null;
    let state: SourceFreshnessRow["state"] = "unknown";
    if (lag === null) state = "dead";
    else if (lag <= e.max_lag_minutes) state = "fresh";
    else if (lag <= e.max_lag_minutes * 2) state = "lagging";
    else if (lag <= e.max_lag_minutes * 5) state = "stale";
    else state = "dead";
    return {
      sourceCode: e.source_code,
      cadence: e.cadence,
      maxLagMinutes: e.max_lag_minutes,
      latestAsOf: latest,
      lagMinutes: lag,
      state,
      lastCronRunAt: null,
      lastCronStatus: null,
    };
  });
  // Reference `latestPerSource` to keep the type declaration honest even though we don't use it.
  void latestPerSource;
  return rows.sort((a, b) => a.sourceCode.localeCompare(b.sourceCode));
});
