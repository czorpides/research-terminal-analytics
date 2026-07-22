/**
 * US Growth pipeline orchestrator — Lovable side.
 *
 * Flow (stateless analytics architecture):
 *   FRED ingest → vintage-preserving raw_observations
 *      ↓
 *   read validated point-in-time observations from Lovable Cloud
 *      ↓
 *   input-data hash over (indicator, observation_date, latest value)
 *      ↓
 *   create idempotent model_runs row (status='queued' → 'running')
 *      ↓
 *   for each indicator: POST { observations + config } to authenticated
 *     Python /calc/kalman-llt. The Python service returns filtered
 *     level/slope/CI + diagnostics only — never writes to Supabase.
 *      ↓
 *   VALIDATE the response (hash echo, indicator id echo, status='ok', at
 *     least one point). Only then upsert model_outputs.
 *      ↓
 *   update model_runs status + summary. If any indicator response fails
 *     validation the run is marked 'failed' and no partial outputs remain.
 */
import { createHash } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runUsGrowthFredIngest, type GrowthIngestRunSummary } from "@/lib/ingestion/fred/growth-ingest.server";
import type {
  KalmanCalculationRequest,
  KalmanCalculationResponse,
} from "./client.server";

const MODEL_KEY = "growth_engine.us.kalman_llt";
const MODEL_VERSION = "kalman.llt.v0.2";
const SERVICE_VERSION = "0.2.0";

type CalcMode = "live" | "historical";

interface IndicatorRow {
  id: string;
  concept_code: string;
  series_code_native: string;
  frequency: string;
  unit: string;
  min_history: number | null;
}

interface IndicatorObservations {
  indicator: IndicatorRow;
  observations: Array<{ date: string; value: number | null }>;
}

export interface KalmanPipelineOptions {
  asOfDate?: string;
  mode?: CalcMode;
  force?: boolean;
}

export interface KalmanPipelineResult {
  runId: string | null;
  status: "success" | "failed" | "skipped" | "reused";
  inputHash: string | null;
  priorHash: string | null;
  dataChanged: boolean;
  indicatorsProcessed: number;
  indicatorsSkipped: number;
  outputRows: number;
  reason?: string;
  errors?: string[];
}

// -----------------------------------------------------------------------------
// Public entry points
// -----------------------------------------------------------------------------

export async function runUsGrowthKalmanPipeline(opts: KalmanPipelineOptions = {}): Promise<KalmanPipelineResult> {
  const mode: CalcMode = opts.mode ?? "live";
  const asOfDate = opts.asOfDate ?? null;

  if (!process.env.ANALYTICS_SERVICE_URL || !process.env.ANALYTICS_SERVICE_TOKEN) {
    return emptyResult("skipped", "analytics service not configured");
  }

  const indicators = await loadIndicators();
  if (indicators.length === 0) return emptyResult("skipped", "no active indicators");

  const perIndicator = await loadObservations(indicators, asOfDate);
  const inputHash = computeInputHash(perIndicator, mode, asOfDate);
  const priorHash = await lastSuccessfulInputHash();
  const dataChanged = inputHash !== priorHash;

  if (!opts.force && !dataChanged) {
    return {
      runId: null, status: "reused", inputHash, priorHash, dataChanged,
      indicatorsProcessed: 0, indicatorsSkipped: 0, outputRows: 0,
      reason: "input hash unchanged since last successful run",
    };
  }

  const runId = await insertModelRun({ inputHash, indicators: perIndicator, mode, asOfDate });
  const errors: string[] = [];
  const outputRows: any[] = [];
  const indicatorSummaries: any[] = [];
  let skipped = 0;

  const { calculateKalmanLlt } = await import("./client.server");

  for (const { indicator, observations } of perIndicator) {
    if (observations.length === 0) {
      skipped += 1;
      indicatorSummaries.push({ indicator_id: indicator.id, concept_code: indicator.concept_code, status: "no_observations" });
      continue;
    }
    const trainingStart = observations[0]!.date;
    const trainingEnd = observations[observations.length - 1]!.date;

    const request: KalmanCalculationRequest = {
      model_key: MODEL_KEY,
      model_version: MODEL_VERSION,
      calculation_mode: mode,
      as_of_date: asOfDate,
      training_start: trainingStart,
      training_end: trainingEnd,
      input_hash: inputHash,
      indicator_id: indicator.id,
      indicator_frequency: indicator.frequency as KalmanCalculationRequest["indicator_frequency"],
      indicator_unit: indicator.unit,
      observations,
      model_config_params: { min_history: indicator.min_history },
    };

    let response: KalmanCalculationResponse;
    try {
      response = await calculateKalmanLlt(request);
    } catch (e) {
      errors.push(`${indicator.concept_code}: ${(e as Error).message.slice(0, 240)}`);
      continue;
    }

    const validationError = validateResponse(request, response);
    if (validationError) {
      errors.push(`${indicator.concept_code}: ${validationError}`);
      continue;
    }
    if (response.status === "insufficient_history") {
      skipped += 1;
      indicatorSummaries.push({
        indicator_id: indicator.id, concept_code: indicator.concept_code,
        status: "insufficient_history", reason: response.detail,
        n_observations: response.n_observations,
      });
      continue;
    }

    const meta = {
      model_run_id: runId,
      model_version: response.model_version,
      calculation_timestamp: response.calculated_at,
      calculation_mode: mode,
      as_of_date: asOfDate,
      training_start: response.training_start,
      training_end: response.training_end,
      model_params: response.model_params,
      log_likelihood: response.log_likelihood,
      converged: response.converged,
      input_data_version: "raw_observations.v1",
      indicator_series_code: indicator.series_code_native,
      concept_code: indicator.concept_code,
      warnings: response.warnings,
    };

    for (const p of response.points) {
      const uncert = (p.level_ci_high - p.level_ci_low) / 2.0;
      outputRows.push({ model_key: MODEL_KEY, model_version: MODEL_VERSION, run_id: runId, indicator_id: indicator.id, ts: p.date, output_type: "kalman_level", value: p.level, uncertainty: uncert, meta });
      outputRows.push({ model_key: MODEL_KEY, model_version: MODEL_VERSION, run_id: runId, indicator_id: indicator.id, ts: p.date, output_type: "kalman_slope", value: p.slope, uncertainty: null, meta });
      outputRows.push({ model_key: MODEL_KEY, model_version: MODEL_VERSION, run_id: runId, indicator_id: indicator.id, ts: p.date, output_type: "kalman_level_ci_low", value: p.level_ci_low, uncertainty: null, meta });
      outputRows.push({ model_key: MODEL_KEY, model_version: MODEL_VERSION, run_id: runId, indicator_id: indicator.id, ts: p.date, output_type: "kalman_level_ci_high", value: p.level_ci_high, uncertainty: null, meta });
    }
    indicatorSummaries.push({
      indicator_id: indicator.id, concept_code: indicator.concept_code, status: "ok",
      n_observations: response.n_observations, log_likelihood: response.log_likelihood,
      converged: response.converged, training_start: response.training_start,
      training_end: response.training_end, model_params: response.model_params,
      latest: response.points.length ? response.points[response.points.length - 1] : null,
    });
  }

  const runFailed = errors.length > 0;
  if (!runFailed) {
    // Only persist outputs if EVERY indicator succeeded validation.
    for (let i = 0; i < outputRows.length; i += 500) {
      const chunk = outputRows.slice(i, i + 500);
      const { error } = await supabaseAdmin.from("model_outputs").upsert(chunk as any, {
        onConflict: "model_key,model_version,indicator_id,ts,output_type",
      });
      if (error) {
        errors.push(`model_outputs upsert: ${error.message}`);
        break;
      }
    }
  }

  const finalStatus = errors.length > 0 ? "failed" : "success";
  await supabaseAdmin.from("model_runs").update({
    status: finalStatus,
    finished_at: new Date().toISOString(),
    output_summary: ({
      engine: "growth", region: "US", calculation_mode: mode, as_of_date: asOfDate,
      indicators_processed: indicatorSummaries.filter((s) => s.status === "ok").length,
      indicators_skipped: skipped,
      output_rows: finalStatus === "success" ? outputRows.length : 0,
      per_indicator: indicatorSummaries,
    } as any),
    error: errors.length ? errors.join(" | ").slice(0, 1000) : null,
  }).eq("id", runId);

  if (finalStatus === "success") {
    await supabaseAdmin.from("model_runs")
      .update({ status: "superseded" })
      .eq("model_key", MODEL_KEY).eq("model_version", MODEL_VERSION)
      .eq("status", "success").neq("id", runId);
  }

  return {
    runId, status: finalStatus, inputHash, priorHash, dataChanged,
    indicatorsProcessed: indicatorSummaries.filter((s) => s.status === "ok").length,
    indicatorsSkipped: skipped,
    outputRows: finalStatus === "success" ? outputRows.length : 0,
    errors: errors.length ? errors : undefined,
  };
}

/**
 * Combined ingest + calculation entrypoint used by the public ingest route.
 */
export async function runUsGrowthPipeline(opts: { yearsBack?: number; forceKalman?: boolean } = {}): Promise<{
  ingest: GrowthIngestRunSummary;
  kalman: KalmanPipelineResult;
}> {
  const ingest = await runUsGrowthFredIngest({ yearsBack: opts.yearsBack });
  const kalman = await runUsGrowthKalmanPipeline({ force: Boolean(opts.forceKalman) });
  return { ingest, kalman };
}

// -----------------------------------------------------------------------------
// Response validation — refuses to persist tainted outputs
// -----------------------------------------------------------------------------

function validateResponse(req: KalmanCalculationRequest, res: KalmanCalculationResponse): string | null {
  if (res.input_hash !== req.input_hash) return `input_hash mismatch (got ${res.input_hash.slice(0, 12)}…)`;
  if (res.indicator_id !== req.indicator_id) return "indicator_id mismatch";
  if (res.model_key !== req.model_key) return `model_key mismatch (${res.model_key})`;
  if (res.model_version !== req.model_version) return `model_version mismatch (${res.model_version})`;
  if (res.status === "error") return `remote error: ${res.detail ?? "unknown"}`;
  if (res.status === "ok" && res.points.length === 0) return "status=ok with zero points";
  return null;
}

// -----------------------------------------------------------------------------
// DB helpers (all reads/writes stay on the Lovable side)
// -----------------------------------------------------------------------------

async function loadIndicators(): Promise<IndicatorRow[]> {
  const { data: region } = await supabaseAdmin.from("regions").select("id").eq("code", "US").maybeSingle();
  if (!region) return [];
  const { data } = await supabaseAdmin
    .from("indicator_registry")
    .select("id, concept_code, series_code_native, frequency, unit, min_history")
    .eq("region_id", region.id).eq("engine", "growth").eq("is_active", true)
    .order("concept_code", { ascending: true });
  return (data ?? []).map((r) => ({
    id: r.id as string,
    concept_code: r.concept_code as string,
    series_code_native: r.series_code_native as string,
    frequency: (r.frequency as string) ?? "monthly",
    unit: (r.unit as string) ?? "",
    min_history: (r.min_history as number | null) ?? null,
  }));
}

async function loadObservations(indicators: IndicatorRow[], asOf: string | null): Promise<IndicatorObservations[]> {
  if (indicators.length === 0) return [];
  // Page through results — a single PostgREST call caps at ~1000 rows and
  // would silently truncate the weekly ICSA series plus later indicators.
  const PAGE = 500;
  const rows: Array<{ indicator_id: string; observation_date: string; value_raw: any; retrieved_at: string }> = [];
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let q = supabaseAdmin
      .from("raw_observations")
      .select("indicator_id, observation_date, value_raw, retrieved_at")
      .in("indicator_id", indicators.map((i) => i.id))
      .order("indicator_id", { ascending: true })
      .order("observation_date", { ascending: true })
      .order("retrieved_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (asOf) {
      q = q.lte("observation_date", asOf).lte("retrieved_at", `${asOf}T23:59:59Z`);
    }
    const { data, error } = await q;
    if (error) throw new Error(`loadObservations: ${error.message}`);
    const batch = data ?? [];
    rows.push(...(batch as any));
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  const data = rows;

  // Collapse to latest vintage per (indicator, date). rows already sorted retrieved_at asc.
  const latest = new Map<string, { indicator_id: string; date: string; value: number | null }>();
  for (const o of data ?? []) {
    const dateStr = (o.observation_date as string).slice(0, 10);
    const key = `${o.indicator_id}|${dateStr}`;
    latest.set(key, {
      indicator_id: o.indicator_id as string,
      date: dateStr,
      value: o.value_raw === null ? null : Number(o.value_raw),
    });
  }

  const byIndicator = new Map<string, Array<{ date: string; value: number | null }>>();
  for (const row of latest.values()) {
    const arr = byIndicator.get(row.indicator_id) ?? [];
    arr.push({ date: row.date, value: row.value });
    byIndicator.set(row.indicator_id, arr);
  }
  for (const arr of byIndicator.values()) arr.sort((a, b) => a.date.localeCompare(b.date));

  return indicators.map((ind) => ({ indicator: ind, observations: byIndicator.get(ind.id) ?? [] }));
}

function computeInputHash(rows: IndicatorObservations[], mode: CalcMode, asOf: string | null): string {
  const triples: Array<[string, string, number | null]> = [];
  for (const { indicator, observations } of rows) {
    for (const o of observations) triples.push([indicator.id, o.date, o.value]);
  }
  triples.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  const payload = JSON.stringify({ model_key: MODEL_KEY, model_version: MODEL_VERSION, calculation_mode: mode, as_of_date: asOf, triples });
  return createHash("sha256").update(payload).digest("hex");
}

/** Public helper kept for the health panel / diagnostics that call it. */
export async function computeCurrentInputHash(): Promise<string | null> {
  const indicators = await loadIndicators();
  if (indicators.length === 0) return null;
  const obs = await loadObservations(indicators, null);
  const anyObs = obs.some((r) => r.observations.length > 0);
  if (!anyObs) return null;
  return computeInputHash(obs, "live", null);
}

async function lastSuccessfulInputHash(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("model_runs").select("input_hash")
    .eq("model_key", MODEL_KEY).eq("status", "success")
    .order("finished_at", { ascending: false }).limit(1);
  return (data?.[0]?.input_hash as string | null) ?? null;
}

async function insertModelRun(args: {
  inputHash: string; indicators: IndicatorObservations[]; mode: CalcMode; asOfDate: string | null;
}): Promise<string> {
  const totalObs = args.indicators.reduce((n, r) => n + r.observations.length, 0);
  const { data, error } = await supabaseAdmin.from("model_runs").insert({
    model_key: MODEL_KEY,
    model_version: MODEL_VERSION,
    status: "running",
    input_hash: args.inputHash,
    service_version: SERVICE_VERSION,
    started_at: new Date().toISOString(),
    output_summary: {
      engine: "growth", region: "US",
      indicators: args.indicators.length, observations: totalObs,
      as_of_date: args.asOfDate, calculation_mode: args.mode,
    },
  }).select("id").single();
  if (error) throw new Error(`insert model_run: ${error.message}`);
  return data!.id as string;
}

function emptyResult(status: "skipped", reason: string): KalmanPipelineResult {
  return {
    runId: null, status, inputHash: null, priorHash: null, dataChanged: false,
    indicatorsProcessed: 0, indicatorsSkipped: 0, outputRows: 0, reason,
  };
}