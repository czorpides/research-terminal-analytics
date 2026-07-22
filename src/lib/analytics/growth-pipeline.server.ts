/**
 * US Growth pipeline orchestrator.
 *
 *   FRED ingest → vintage-preserving raw_observations
 *      ↓
 *   input-data hash over (indicator_id, observation_date, latest value)
 *      ↓
 *   if hash differs from the last successful model_run's input_hash AND
 *   ANALYTICS_SERVICE_URL / ANALYTICS_SERVICE_TOKEN are both configured,
 *   POST to the Python service to run the Kalman filter. Otherwise return
 *   status='skipped' with an explicit reason. Kalman is never auto-run
 *   while the analytics service is unconfigured.
 */
import { createHash } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runUsGrowthFredIngest, type GrowthIngestRunSummary } from "@/lib/ingestion/fred/growth-ingest.server";

const MODEL_KEY = "growth_engine.us.kalman_llt";

export interface GrowthPipelineResult {
  ingest: GrowthIngestRunSummary;
  inputHash: string | null;
  priorHash: string | null;
  dataChanged: boolean;
  kalman:
    | { status: "skipped"; reason: string }
    | { status: "triggered"; runId: string; runStatus: string; reused: boolean; detail: string | null };
}

export async function runUsGrowthPipeline(opts: { yearsBack?: number; forceKalman?: boolean } = {}): Promise<GrowthPipelineResult> {
  const ingest = await runUsGrowthFredIngest({ yearsBack: opts.yearsBack });

  const inputHash = await computeCurrentInputHash();
  const priorHash = await lastSuccessfulInputHash();
  const dataChanged = inputHash !== null && inputHash !== priorHash;

  const analyticsConfigured = Boolean(process.env.ANALYTICS_SERVICE_URL && process.env.ANALYTICS_SERVICE_TOKEN);
  if (!analyticsConfigured) {
    return { ingest, inputHash, priorHash, dataChanged, kalman: { status: "skipped", reason: "analytics service not configured" } };
  }
  if (!opts.forceKalman && !dataChanged) {
    return { ingest, inputHash, priorHash, dataChanged, kalman: { status: "skipped", reason: "input hash unchanged" } };
  }
  if (inputHash === null) {
    return { ingest, inputHash, priorHash, dataChanged, kalman: { status: "skipped", reason: "no observations available" } };
  }

  const { triggerUsGrowthKalman } = await import("./client.server");
  const resp = await triggerUsGrowthKalman({ force: Boolean(opts.forceKalman) });
  return {
    ingest, inputHash, priorHash, dataChanged,
    kalman: { status: "triggered", runId: resp.run_id, runStatus: resp.status, reused: resp.reused, detail: resp.detail ?? null },
  };
}

/**
 * Deterministic SHA-256 over the current authoritative observation set for
 * the five US Growth indicators. Mirrors the Python-side hash: sorted
 * (indicator_id, observation_date, value) triples using the latest vintage
 * per date.
 */
export async function computeCurrentInputHash(): Promise<string | null> {
  const { data: region } = await supabaseAdmin
    .from("regions").select("id").eq("code", "US").maybeSingle();
  if (!region) return null;

  const { data: indicators } = await supabaseAdmin
    .from("indicator_registry")
    .select("id, concept_code")
    .eq("region_id", region.id).eq("engine", "growth").eq("is_active", true);
  const ids = (indicators ?? []).map((i) => i.id as string);
  if (!ids.length) return null;

  const { data: obs } = await supabaseAdmin
    .from("raw_observations")
    .select("indicator_id, observation_date, value_raw, retrieved_at")
    .in("indicator_id", ids)
    .order("indicator_id", { ascending: true })
    .order("observation_date", { ascending: true })
    .order("retrieved_at", { ascending: true });

  if (!obs || obs.length === 0) return null;

  // Latest vintage per (indicator, observation_date)
  const latest = new Map<string, { indicator_id: string; observation_date: string; value: number | null }>();
  for (const o of obs) {
    const key = `${o.indicator_id}|${(o.observation_date as string).slice(0, 10)}`;
    latest.set(key, {
      indicator_id: o.indicator_id as string,
      observation_date: (o.observation_date as string).slice(0, 10),
      value: o.value_raw === null ? null : Number(o.value_raw),
    });
  }

  const triples = Array.from(latest.values())
    .map((r) => [r.indicator_id, r.observation_date, r.value] as [string, string, number | null])
    .sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));

  const payload = JSON.stringify({
    model_key: MODEL_KEY,
    triples,
  });
  return createHash("sha256").update(payload).digest("hex");
}

async function lastSuccessfulInputHash(): Promise<string | null> {
  const { data: rows } = await supabaseAdmin
    .from("model_runs")
    .select("input_hash")
    .eq("model_key", MODEL_KEY)
    .eq("status", "success")
    .order("finished_at", { ascending: false })
    .limit(1);
  return (rows?.[0]?.input_hash as string | null) ?? null;
}