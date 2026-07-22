import { createHash } from "node:crypto";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadUsEngineSeries } from "@/lib/macro/engine-data.server";
import { MARKET_COMPONENTS } from "@/lib/scoring/market-stress.server";
import { monthlyLast, rollingZSeries, transformSeries } from "@/lib/scoring/macro-series";
import { calculateHmmRegime, calculatePcaFactor } from "./client.server";

export interface MarketRegimeRunSummary {
  runId: string;
  status: "success" | "failed";
  observations: number;
  features: number;
  pcaExplainedVariance: number[];
  hmmConverged: boolean;
  latestState: string | null;
}

export async function runUsMarketRegimePipeline(): Promise<MarketRegimeRunSummary> {
  const { data: region } = await supabaseAdmin
    .from("regions")
    .select("id")
    .eq("code", "US")
    .maybeSingle();
  if (!region) throw new Error("US region missing");
  const { data: run, error: runError } = await supabaseAdmin
    .from("model_runs")
    .insert({
      model_key: "market_regime.us.pipeline",
      model_version: "v1.0",
      region_id: region.id,
      status: "running",
    })
    .select("id")
    .single();
  if (runError) throw runError;
  try {
    const series = await loadUsEngineSeries("market");
    const transformed = series.flatMap((indicator) => {
      const config = MARKET_COMPONENTS[indicator.concept];
      if (!config) return [];
      const base =
        config.transform === "volatility21" ? indicator.history : monthlyLast(indicator.history);
      const values = monthlyLast(transformSeries(base, config.transform));
      return [{ concept: indicator.concept, config, z: rollingZSeries(values, 24, 120) }];
    });
    const featureNames = transformed.map((item) => item.concept);
    const byFeature = transformed.map(
      (item) => new Map(item.z.map((point) => [point.date.slice(0, 7), point])),
    );
    const months = Array.from(
      new Set(transformed.flatMap((item) => item.z.map((point) => point.date.slice(0, 7)))),
    ).sort();
    const matrix = months.map((month) =>
      byFeature.map((feature) => feature.get(month)?.value ?? null),
    );
    const kept = matrix
      .map((row, index) => ({ row, month: months[index] }))
      .filter(
        ({ row }) => row.filter((value) => value !== null).length / Math.max(1, row.length) >= 0.8,
      );
    if (kept.length < 36 || featureNames.length < 4)
      throw new Error("At least 36 aligned months and four market features are required");
    const dates = kept.map(({ month }) => `${month}-01`);
    const observations = kept.map(({ row }) => row);
    const inputHash = createHash("sha256")
      .update(JSON.stringify({ dates, featureNames, observations }))
      .digest("hex");
    const pca = await calculatePcaFactor({
      model_key: "market_engine.us.pca_factor",
      model_version: "pca.v1.0",
      input_hash: inputHash,
      dates,
      feature_names: featureNames,
      observations,
      n_components: 2,
      max_missing_fraction: 0.2,
    });
    if (pca.status !== "ok") throw new Error(pca.detail ?? "PCA calculation failed");

    const pcaByDate = new Map(pca.points.map((point) => [point.date.slice(0, 7), point.values]));
    const complete = kept.flatMap(({ row, month }) => {
      const pcaPoint = pcaByDate.get(month);
      if (!pcaPoint) return [];
      const active = row.flatMap((value, index) =>
        value === null ? [] : [{ value, config: transformed[index].config }],
      );
      const activeWeight = active.reduce((sum, item) => sum + item.config.weight, 0);
      if (!activeWeight) return [];
      const stress = active.reduce(
        (sum, item) => sum + (item.value * item.config.sign * item.config.weight) / activeWeight,
        0,
      );
      const equityIndex = featureNames.indexOf("sp500");
      const equityStress =
        equityIndex >= 0 && row[equityIndex] !== null ? -row[equityIndex]! : stress;
      return [{ date: `${month}-01`, values: [stress, pcaPoint[0] ?? 0, equityStress] }];
    });
    const hmmHash = createHash("sha256").update(JSON.stringify(complete)).digest("hex");
    const hmm = await calculateHmmRegime({
      model_key: "regime_monitor.us.hmm",
      model_version: "hmm.v1.0-shadow",
      input_hash: hmmHash,
      dates: complete.map((point) => point.date),
      feature_names: ["market_stress", "pca_factor_1", "equity_stress"],
      observations: complete.map((point) => point.values),
      n_states: 3,
      max_iter: 150,
    });
    if (hmm.status !== "ok") throw new Error(hmm.detail ?? "HMM calculation failed");

    const { error: factorError } = await supabaseAdmin.from("factor_models").upsert(
      {
        engine: "market",
        region_id: region.id,
        model_version: pca.model_version,
        loadings: pca.loadings,
        explained_variance: {
          ratios: pca.explained_variance_ratio,
          first_factor: pca.explained_variance_ratio[0] ?? null,
        },
        approved: false,
        label: "US market co-movement factor (shadow)",
      },
      { onConflict: "engine,region_id,model_version" },
    );
    if (factorError) throw factorError;

    const stateRows = hmm.points.map((point) => ({
      region_id: region.id,
      ts: point.date,
      model_version: hmm.model_version,
      state_index: point.state_index,
      state_label: hmm.state_labels[point.state_index] ?? `state_${point.state_index}`,
      probabilities: Object.fromEntries(
        hmm.state_labels.map((label, index) => [label, point.probabilities[index] ?? 0]),
      ),
      status: "shadow",
    }));
    for (let from = 0; from < stateRows.length; from += 500) {
      const { error } = await supabaseAdmin
        .from("regime_states")
        .upsert(stateRows.slice(from, from + 500), { onConflict: "region_id,ts,model_version" });
      if (error) throw error;
    }
    const latest = stateRows.at(-1) ?? null;
    await supabaseAdmin
      .from("model_runs")
      .update({
        status: "success",
        finished_at: new Date().toISOString(),
        input_hash: inputHash,
        output_summary: {
          observations: complete.length,
          features: featureNames.length,
          pca_explained_variance: pca.explained_variance_ratio,
          hmm_converged: hmm.converged,
          latest_state: latest?.state_label ?? null,
        },
        diagnostics: {
          pca_missing_fraction: pca.missing_fraction,
          hmm_iterations: hmm.iterations,
          hmm_log_likelihood: hmm.log_likelihood,
          transition_matrix: hmm.transition_matrix,
        },
      })
      .eq("id", run.id);
    return {
      runId: run.id as string,
      status: "success",
      observations: complete.length,
      features: featureNames.length,
      pcaExplainedVariance: pca.explained_variance_ratio,
      hmmConverged: hmm.converged,
      latestState: latest?.state_label ?? null,
    };
  } catch (error) {
    await supabaseAdmin
      .from("model_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error: (error as Error).message,
      })
      .eq("id", run.id);
    throw error;
  }
}
