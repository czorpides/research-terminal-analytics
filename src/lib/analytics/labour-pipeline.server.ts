import { createHash } from "node:crypto";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadUsEngineSeries } from "@/lib/macro/engine-data.server";
import { calculateKalmanLlt, type KalmanCalculationRequest } from "./client.server";

const MODEL_KEY = "labour_engine.us.kalman_llt";
const MODEL_VERSION = "kalman.llt.v0.2";

export interface LabourPipelineSummary {
  runId: string | null;
  status: "success" | "partial" | "failed" | "skipped";
  processed: number;
  skipped: number;
  outputRows: number;
  errors: string[];
  reason?: string;
}

export async function runUsLabourKalmanPipeline(): Promise<LabourPipelineSummary> {
  if (!process.env.ANALYTICS_SERVICE_URL || !process.env.ANALYTICS_SERVICE_TOKEN)
    return {
      runId: null,
      status: "skipped",
      processed: 0,
      skipped: 0,
      outputRows: 0,
      errors: [],
      reason: "analytics service not configured",
    };
  const { data: region } = await supabaseAdmin
    .from("regions")
    .select("id")
    .eq("code", "US")
    .maybeSingle();
  if (!region) throw new Error("US region missing");
  const series = await loadUsEngineSeries("labour");
  const inputHash = createHash("sha256")
    .update(JSON.stringify(series.map((item) => [item.id, item.history])))
    .digest("hex");
  const { data: run, error: runError } = await supabaseAdmin
    .from("model_runs")
    .insert({
      model_key: MODEL_KEY,
      model_version: MODEL_VERSION,
      region_id: region.id,
      status: "running",
      input_hash: inputHash,
    })
    .select("id")
    .single();
  if (runError) throw runError;
  const outputs: Record<string, unknown>[] = [];
  const errors: string[] = [];
  let processed = 0;
  let skipped = 0;
  for (const indicator of series) {
    if (indicator.history.length < (indicator.minHistory ?? 24)) {
      skipped += 1;
      continue;
    }
    const request: KalmanCalculationRequest = {
      model_key: MODEL_KEY,
      model_version: MODEL_VERSION,
      calculation_mode: "live",
      as_of_date: null,
      training_start: indicator.history[0].date,
      training_end: indicator.history.at(-1)!.date,
      input_hash: inputHash,
      indicator_id: indicator.id,
      indicator_frequency: indicator.frequency as KalmanCalculationRequest["indicator_frequency"],
      indicator_unit: indicator.unit ?? "unknown",
      observations: indicator.history,
      model_config_params: { min_history: indicator.minHistory },
    };
    try {
      const response = await calculateKalmanLlt(request);
      if (
        response.model_key !== MODEL_KEY ||
        response.model_version !== MODEL_VERSION ||
        response.input_hash !== inputHash ||
        response.indicator_id !== indicator.id
      )
        throw new Error("analytics response identity mismatch");
      if (response.status !== "ok") {
        skipped += 1;
        continue;
      }
      const meta = {
        concept_code: indicator.concept,
        converged: response.converged,
        log_likelihood: response.log_likelihood,
        training_start: response.training_start,
        training_end: response.training_end,
        input_hash: inputHash,
      };
      for (const point of response.points) {
        outputs.push({
          model_key: MODEL_KEY,
          model_version: MODEL_VERSION,
          run_id: run.id,
          indicator_id: indicator.id,
          ts: point.date,
          output_type: "kalman_level",
          value: point.level,
          uncertainty: (point.level_ci_high - point.level_ci_low) / 2,
          meta,
        });
        outputs.push({
          model_key: MODEL_KEY,
          model_version: MODEL_VERSION,
          run_id: run.id,
          indicator_id: indicator.id,
          ts: point.date,
          output_type: "kalman_slope",
          value: point.slope,
          uncertainty: null,
          meta,
        });
        outputs.push({
          model_key: MODEL_KEY,
          model_version: MODEL_VERSION,
          run_id: run.id,
          indicator_id: indicator.id,
          ts: point.date,
          output_type: "kalman_level_ci_low",
          value: point.level_ci_low,
          uncertainty: null,
          meta,
        });
        outputs.push({
          model_key: MODEL_KEY,
          model_version: MODEL_VERSION,
          run_id: run.id,
          indicator_id: indicator.id,
          ts: point.date,
          output_type: "kalman_level_ci_high",
          value: point.level_ci_high,
          uncertainty: null,
          meta,
        });
      }
      processed += 1;
    } catch (error) {
      errors.push(`${indicator.concept}: ${(error as Error).message}`);
    }
  }
  for (let from = 0; from < outputs.length; from += 500) {
    const { error } = await supabaseAdmin
      .from("model_outputs")
      .upsert(outputs.slice(from, from + 500) as never, {
        onConflict: "model_key,model_version,indicator_id,ts,output_type",
      });
    if (error) errors.push(`model_outputs: ${error.message}`);
  }
  const status = errors.length ? (processed ? "partial" : "failed") : "success";
  await supabaseAdmin
    .from("model_runs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      output_summary: { processed, skipped, output_rows: outputs.length },
      error: errors.length ? errors.join(" | ").slice(0, 1_000) : null,
    })
    .eq("id", run.id);
  return {
    runId: run.id as string,
    status,
    processed,
    skipped,
    outputRows: outputs.length,
    errors,
  };
}
