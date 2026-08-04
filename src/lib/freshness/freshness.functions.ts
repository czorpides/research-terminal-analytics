import { createServerFn } from "@tanstack/react-start";

export interface SourceFreshnessRow {
  sourceCode: string;
  cadence: string;
  maxLagMinutes: number;
  latestAsOf: string | null;
  lagMinutes: number | null;
  state: "fresh" | "lagging" | "stale" | "dead" | "unknown";
}

/**
 * Reads live max(as_of) per source and joins it against the expected cadence
 * from `source_freshness_expectations`. Used by Data Health to surface silent
 * ingestion failures. Analyst expectations use their dedicated point-in-time
 * vintage table, so their accepted last-verified timestamp is appended here
 * using the same central watchdog contract.
 */
export const getSourceFreshness = createServerFn({ method: "GET" }).handler(async (): Promise<SourceFreshnessRow[]> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: exp } = await supabaseAdmin
    .from("source_freshness_expectations")
    .select("source_code, cadence, max_lag_minutes");

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
    };
  });

  // The migration may not be applied in a preview environment yet. Treat that
  // as unknown rather than failing the whole Data Health page.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const { data: analystRow, error: analystError } = await db
      .from("analyst_expectation_snapshots")
      .select("last_verified_at")
      .eq("validation_state", "accepted")
      .order("last_verified_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (analystError) throw analystError;
    const latest = analystRow?.last_verified_at ? String(analystRow.last_verified_at) : null;
    const lag = latest ? Math.round((now - new Date(latest).getTime()) / 60000) : null;
    const state: SourceFreshnessRow["state"] =
      lag === null ? "unknown" : lag <= 360 ? "fresh" : lag <= 1440 ? "lagging" : lag <= 2880 ? "stale" : "dead";
    rows.push({
      sourceCode: "analyst_expectations",
      cadence: "priority rolling · Swing monitor",
      maxLagMinutes: 1440,
      latestAsOf: latest,
      lagMinutes: lag,
      state,
    });
  } catch {
    rows.push({
      sourceCode: "analyst_expectations",
      cadence: "priority rolling · migration pending",
      maxLagMinutes: 1440,
      latestAsOf: null,
      lagMinutes: null,
      state: "unknown",
    });
  }

  return rows.sort((a, b) => a.sourceCode.localeCompare(b.sourceCode));
});