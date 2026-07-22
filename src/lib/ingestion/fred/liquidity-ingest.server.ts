import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchSeriesObservations } from "./client.server";

export interface LiquidityIngestResult { concept_code: string; status: "success" | "failed" | "insufficient"; observations_fetched: number; new_observations: number; new_revisions: number; latest_date: string | null; latest_value: number | null; error?: string }
export interface LiquidityIngestSummary { runId: string | null; results: LiquidityIngestResult[]; totalNewObservations: number; totalRevisions: number; failed: number }

export async function runUsLiquidityFredIngest(opts: { yearsBack?: number } = {}): Promise<LiquidityIngestSummary> {
  const yearsBack = Math.max(5, Math.min(50, opts.yearsBack ?? 20));
  const { data: region } = await supabaseAdmin.from("regions").select("id").eq("code", "US").maybeSingle();
  const { data: source } = await supabaseAdmin.from("data_sources").select("id").eq("provider_code", "fred").maybeSingle();
  if (!region || !source) throw new Error("US region or FRED source missing");
  const { data: run } = await supabaseAdmin.from("ingestion_runs").insert({ source_id: source.id, data_category: "macro_release", status: "running", details: { pipeline: "us_liquidity_fred", yearsBack } }).select("id").single();
  const { data: indicators, error } = await supabaseAdmin.from("indicator_registry").select("id, concept_code, series_code_native, unit, frequency").eq("region_id", region.id).eq("engine", "liquidity").eq("is_active", true).order("concept_code");
  if (error) throw error;
  const start = new Date(Date.now() - yearsBack * 365.25 * 86400000).toISOString().slice(0, 10);
  const results: LiquidityIngestResult[] = [];
  for (const ind of indicators ?? []) results.push(await ingestOne(ind as { id: string; concept_code: string; series_code_native: string; unit: string | null; frequency: string }, start));
  const totalNewObservations = results.reduce((n, x) => n + x.new_observations, 0), totalRevisions = results.reduce((n, x) => n + x.new_revisions, 0), failed = results.filter((x) => x.status === "failed").length;
  if (run?.id) await supabaseAdmin.from("ingestion_runs").update({ status: failed ? (failed === results.length ? "failed" : "partial") : "success", finished_at: new Date().toISOString(), rows_ingested: totalNewObservations + totalRevisions, details: JSON.parse(JSON.stringify({ pipeline: "us_liquidity_fred", yearsBack, results })) }).eq("id", run.id);
  return { runId: run?.id ?? null, results, totalNewObservations, totalRevisions, failed };
}

async function ingestOne(ind: { id: string; concept_code: string; series_code_native: string; unit: string | null; frequency: string }, observationStart: string): Promise<LiquidityIngestResult> {
  const base: LiquidityIngestResult = { concept_code: ind.concept_code, status: "success", observations_fetched: 0, new_observations: 0, new_revisions: 0, latest_date: null, latest_value: null };
  try {
    const observations = (await fetchSeriesObservations(ind.series_code_native, { observationStart })).filter((x) => x.value !== null);
    base.observations_fetched = observations.length; if (!observations.length) return { ...base, status: "insufficient" };
    const latest = observations.at(-1)!; base.latest_date = latest.date; base.latest_value = latest.value;
    // Supabase caps responses at 1,000 rows. Load every stored page before
    // classifying observations, otherwise unchanged long-history rows are
    // treated as new on every retry.
    const values = new Map<string, number | null>();
    for (let from = 0; ; from += 1_000) {
      const { data: previous, error } = await supabaseAdmin.from("raw_observations").select("observation_date,value_raw,retrieved_at").eq("indicator_id", ind.id).order("observation_date", { ascending: true }).order("retrieved_at", { ascending: true }).range(from, from + 999);
      if (error) throw error;
      for (const row of previous ?? []) values.set((row.observation_date as string).slice(0, 10), row.value_raw == null ? null : Number(row.value_raw));
      if ((previous?.length ?? 0) < 1_000) break;
    }
    const changes = observations.filter((x) => values.get(x.date) === undefined || Math.abs((values.get(x.date) ?? 0) - (x.value ?? 0)) > 1e-9); if (!changes.length) return base;
    const now = new Date().toISOString(); const { data: vintage, error: vintageError } = await supabaseAdmin.from("data_vintages").insert({ indicator_id: ind.id, release_date: now.slice(0, 10), source_ref: `fred:${ind.series_code_native}`, payload_hash: `fred:${ind.series_code_native}:${now}` }).select("id").single(); if (vintageError) throw vintageError;
    for (let i = 0; i < changes.length; i += 500) { const batch = changes.slice(i, i + 500).map((x) => ({ indicator_id: ind.id, observation_date: x.date, value_raw: x.value, unit_raw: ind.unit, vintage_id: vintage.id, source_payload_ref: `fred:${ind.series_code_native}:${x.date}`, meta: { source: "FRED", series_code: ind.series_code_native, frequency: ind.frequency, revision: values.has(x.date), previous_value: values.get(x.date) ?? null } })); const { error: insertError } = await supabaseAdmin.from("raw_observations").insert(batch as never); if (insertError) throw insertError; }
    base.new_observations = changes.filter((x) => !values.has(x.date)).length; base.new_revisions = changes.length - base.new_observations; return base;
  } catch (error) { return { ...base, status: "failed", error: (error as Error).message }; }
}
