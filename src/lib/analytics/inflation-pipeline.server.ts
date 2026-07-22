/**
 * US Inflation pipeline orchestrator.
 * Reuses the growth pattern: ingest → hash-guard → stateless Kalman call
 * → validate → persist. The transformation framework runs in-memory when
 * panels are read; Kalman is the only external call and is hash-guarded
 * per-indicator.
 */
import { createHash } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runUsInflationFredIngest, type InflationIngestRunSummary } from "@/lib/ingestion/fred/inflation-ingest.server";
import type { KalmanCalculationRequest, KalmanCalculationResponse } from "./client.server";

const MODEL_KEY = "inflation_engine.us.kalman_llt";
const MODEL_VERSION = "kalman.llt.v0.2";

interface IndicatorRow { id: string; concept_code: string; series_code_native: string; frequency: string; unit: string; min_history: number | null }
interface IndicatorObservations { indicator: IndicatorRow; observations: Array<{ date: string; value: number | null }> }

export interface InflationPipelineResult {
  runId: string | null;
  status: "success" | "partial" | "failed" | "skipped" | "reused";
  inputHash: string | null; priorHash: string | null; dataChanged: boolean;
  indicatorsProcessed: number; indicatorsSkipped: number; outputRows: number;
  reason?: string; errors?: string[];
}

export async function runUsInflationKalmanPipeline(opts: { force?: boolean; ingestMs?: number } = {}): Promise<InflationPipelineResult> {
  if (!process.env.ANALYTICS_SERVICE_URL || !process.env.ANALYTICS_SERVICE_TOKEN) {
    return empty("skipped", "analytics service not configured");
  }
  const indicators = await loadIndicators();
  if (indicators.length === 0) return empty("skipped", "no active inflation indicators");

  const per = await loadObservations(indicators);
  const inputHash = computeHash(per);
  const priorHash = await lastHash();
  const dataChanged = inputHash !== priorHash;
  if (!opts.force && !dataChanged) {
    return { runId: null, status: "reused", inputHash, priorHash, dataChanged,
      indicatorsProcessed: 0, indicatorsSkipped: 0, outputRows: 0,
      reason: "input hash unchanged since last successful run" };
  }

  const priorInd = opts.force ? new Map<string, string>() : await lastIndicatorHashes();
  const currentInd = new Map<string, string>();
  for (const row of per) currentInd.set(row.indicator.id, indicatorHash(row));

  const { data: run } = await supabaseAdmin.from("model_runs").insert({
    model_key: MODEL_KEY, model_version: MODEL_VERSION, status: "running",
    started_at: new Date().toISOString(), input_hash: inputHash,
    output_summary: { engine: "inflation", region: "US", n_indicators: per.length },
  }).select("id").single();
  const runId = (run?.id as string | null) ?? null;

  const errors: string[] = [];
  const outputRows: any[] = [];
  const summaries: any[] = [];
  const timings: Record<string, number> = { ingest_ms: opts.ingestMs ?? 0 };
  const t0 = Date.now();
  let skipped = 0, reused = 0;

  const { calculateKalmanLlt } = await import("./client.server");
  for (const { indicator, observations } of per) {
    if (observations.length === 0) { skipped++; summaries.push({ indicator_id: indicator.id, concept_code: indicator.concept_code, status: "no_observations" }); continue; }
    const h = currentInd.get(indicator.id)!;
    if (!opts.force && priorInd.get(indicator.id) === h) {
      reused++; summaries.push({ indicator_id: indicator.id, concept_code: indicator.concept_code, status: "reused", indicator_hash: h }); continue;
    }
    const req: KalmanCalculationRequest = {
      model_key: MODEL_KEY, model_version: MODEL_VERSION, calculation_mode: "live",
      as_of_date: null, training_start: observations[0].date, training_end: observations[observations.length - 1].date,
      input_hash: inputHash, indicator_id: indicator.id,
      indicator_frequency: indicator.frequency as KalmanCalculationRequest["indicator_frequency"],
      indicator_unit: indicator.unit, observations,
      model_config_params: { min_history: indicator.min_history },
    };
    const s = Date.now();
    let res: KalmanCalculationResponse;
    try { res = await calculateKalmanLlt(req); }
    catch (e) { errors.push(`${indicator.concept_code}: ${(e as Error).message.slice(0, 240)}`); continue; }
    finally { timings[`kalman_ms.${indicator.concept_code}`] = Date.now() - s; }

    const err = validate(req, res);
    if (err) { errors.push(`${indicator.concept_code}: ${err}`); continue; }
    if (res.status === "insufficient_history") {
      skipped++; summaries.push({ indicator_id: indicator.id, concept_code: indicator.concept_code, status: "insufficient_history", reason: res.detail }); continue;
    }
    const meta = {
      model_run_id: runId, model_version: res.model_version, calculation_timestamp: res.calculated_at,
      calculation_mode: "live", training_start: res.training_start, training_end: res.training_end,
      model_params: res.model_params, log_likelihood: res.log_likelihood, converged: res.converged,
      concept_code: indicator.concept_code, indicator_hash: h,
    };
    for (const p of res.points) {
      const u = (p.level_ci_high - p.level_ci_low) / 2;
      outputRows.push({ model_key: MODEL_KEY, model_version: MODEL_VERSION, run_id: runId, indicator_id: indicator.id, ts: p.date, output_type: "kalman_level", value: p.level, uncertainty: u, meta });
      outputRows.push({ model_key: MODEL_KEY, model_version: MODEL_VERSION, run_id: runId, indicator_id: indicator.id, ts: p.date, output_type: "kalman_slope", value: p.slope, uncertainty: null, meta });
      outputRows.push({ model_key: MODEL_KEY, model_version: MODEL_VERSION, run_id: runId, indicator_id: indicator.id, ts: p.date, output_type: "kalman_level_ci_low", value: p.level_ci_low, uncertainty: null, meta });
      outputRows.push({ model_key: MODEL_KEY, model_version: MODEL_VERSION, run_id: runId, indicator_id: indicator.id, ts: p.date, output_type: "kalman_level_ci_high", value: p.level_ci_high, uncertainty: null, meta });
    }
    summaries.push({ indicator_id: indicator.id, concept_code: indicator.concept_code, status: "ok", n_observations: res.n_observations, converged: res.converged, indicator_hash: h });
  }

  if (outputRows.length) {
    for (let i = 0; i < outputRows.length; i += 500) {
      const chunk = outputRows.slice(i, i + 500);
      const { error } = await supabaseAdmin.from("model_outputs").upsert(chunk as any, {
        onConflict: "model_key,model_version,indicator_id,ts,output_type",
      });
      if (error) { errors.push(`model_outputs upsert: ${error.message}`); break; }
    }
  }

  const okCount = summaries.filter((s) => s.status === "ok").length;
  const finalStatus: "success" | "partial" | "failed" =
    errors.length === 0 ? "success" : (okCount + reused > 0 ? "partial" : "failed");
  timings.total_ms = Date.now() - t0;
  if (runId) {
    await supabaseAdmin.from("model_runs").update({
      status: finalStatus, finished_at: new Date().toISOString(),
      output_summary: ({ engine: "inflation", region: "US", indicators_processed: okCount, indicators_reused: reused, indicators_skipped: skipped, output_rows: outputRows.length, per_indicator: summaries } as any),
      diagnostics: timings as any,
      error: errors.length ? errors.join(" | ").slice(0, 1000) : null,
    }).eq("id", runId);
  }

  return { runId, status: finalStatus, inputHash, priorHash, dataChanged,
    indicatorsProcessed: okCount, indicatorsSkipped: skipped, outputRows: outputRows.length,
    errors: errors.length ? errors : undefined };
}

export async function runUsInflationPipeline(opts: { yearsBack?: number; forceKalman?: boolean } = {}): Promise<{ ingest: InflationIngestRunSummary; kalman: InflationPipelineResult }> {
  const t0 = Date.now();
  const ingest = await runUsInflationFredIngest({ yearsBack: opts.yearsBack });
  const kalman = await runUsInflationKalmanPipeline({ force: Boolean(opts.forceKalman), ingestMs: Date.now() - t0 });
  return { ingest, kalman };
}

function empty(status: InflationPipelineResult["status"], reason: string): InflationPipelineResult {
  return { runId: null, status, inputHash: null, priorHash: null, dataChanged: false,
    indicatorsProcessed: 0, indicatorsSkipped: 0, outputRows: 0, reason };
}

function validate(req: KalmanCalculationRequest, res: KalmanCalculationResponse): string | null {
  if (res.input_hash !== req.input_hash) return `input_hash mismatch`;
  if (res.indicator_id !== req.indicator_id) return "indicator_id mismatch";
  if (res.model_key !== req.model_key) return `model_key mismatch`;
  if (res.model_version !== req.model_version) return `model_version mismatch`;
  if (res.status === "error") return `remote error: ${res.detail ?? "unknown"}`;
  if (res.status === "ok" && res.points.length === 0) return "status=ok with zero points";
  return null;
}

async function loadIndicators(): Promise<IndicatorRow[]> {
  const { data: region } = await supabaseAdmin.from("regions").select("id").eq("code", "US").maybeSingle();
  if (!region) return [];
  const { data } = await supabaseAdmin
    .from("indicator_registry")
    .select("id, concept_code, series_code_native, frequency, unit, min_history")
    .eq("region_id", region.id).eq("engine", "inflation").eq("is_active", true)
    .order("concept_code", { ascending: true });
  return (data ?? []).map((r) => ({
    id: r.id as string, concept_code: r.concept_code as string,
    series_code_native: r.series_code_native as string,
    frequency: (r.frequency as string) ?? "monthly", unit: (r.unit as string) ?? "",
    min_history: (r.min_history as number | null) ?? null,
  }));
}

async function loadObservations(indicators: IndicatorRow[]): Promise<IndicatorObservations[]> {
  const PAGE = 1000;
  const out: IndicatorObservations[] = [];
  for (const ind of indicators) {
    const latest = new Map<string, number | null>();
    let from = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data: batch, error } = await supabaseAdmin
        .from("raw_observations")
        .select("observation_date, value_raw, retrieved_at")
        .eq("indicator_id", ind.id)
        .order("observation_date", { ascending: true })
        .order("retrieved_at", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`loadObservations(${ind.concept_code}): ${error.message}`);
      const rows = batch ?? [];
      for (const o of rows) {
        const d = (o.observation_date as string).slice(0, 10);
        latest.set(d, o.value_raw == null ? null : Number(o.value_raw));
      }
      if (rows.length < PAGE) break;
      from += rows.length;
    }
    const observations = Array.from(latest.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => ({ date, value }));
    out.push({ indicator: ind, observations });
  }
  return out;
}

function computeHash(rows: IndicatorObservations[]): string {
  const triples: Array<[string, string, number | null]> = [];
  for (const { indicator, observations } of rows) {
    for (const o of observations) triples.push([indicator.id, o.date, o.value]);
  }
  triples.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  return createHash("sha256").update(JSON.stringify({ model_key: MODEL_KEY, model_version: MODEL_VERSION, triples })).digest("hex");
}

function indicatorHash(row: IndicatorObservations): string {
  return createHash("sha256").update(JSON.stringify(row.observations)).digest("hex");
}

async function lastHash(): Promise<string | null> {
  const { data } = await supabaseAdmin.from("model_runs").select("input_hash")
    .eq("model_key", MODEL_KEY).in("status", ["success", "partial"])
    .order("finished_at", { ascending: false }).limit(1);
  return (data?.[0]?.input_hash as string | null) ?? null;
}

async function lastIndicatorHashes(): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  const { data } = await supabaseAdmin.from("model_runs")
    .select("output_summary, finished_at")
    .eq("model_key", MODEL_KEY).in("status", ["success", "partial"])
    .order("finished_at", { ascending: false }).limit(10);
  for (const row of data ?? []) {
    const per = ((row.output_summary as any)?.per_indicator ?? []) as Array<any>;
    for (const p of per) if (p?.indicator_id && p?.indicator_hash && !m.has(p.indicator_id)) m.set(p.indicator_id, p.indicator_hash);
  }
  return m;
}