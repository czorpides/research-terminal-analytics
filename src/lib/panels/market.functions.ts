import { createServerFn } from "@tanstack/react-start";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadUsEngineSeries } from "@/lib/macro/engine-data.server";
import {
  MARKET_COMPONENTS,
  scoreMarketStress,
  type MarketStressScore,
} from "@/lib/scoring/market-stress.server";
import { monthlyLast, transformSeries } from "@/lib/scoring/macro-series";

export interface MarketEnginePayload {
  score: MarketStressScore;
  indicators: Array<{
    concept: string;
    label: string;
    series: string;
    frequency: string;
    unit: string | null;
    latest: number | null;
    date: string | null;
    previous: number | null;
    history: Array<{ date: string; value: number }>;
    observationCount: number;
  }>;
  pca: {
    status: "shadow" | "not_run";
    version: string | null;
    explainedVariance: number | null;
    label: string;
  };
  note: string;
}

export const getMarketEngine = createServerFn({ method: "GET" }).handler(
  async (): Promise<MarketEnginePayload> => {
    const series = await loadUsEngineSeries("market");
    const score = scoreMarketStress(series);
    const { data: region } = await supabaseAdmin
      .from("regions")
      .select("id")
      .eq("code", "US")
      .maybeSingle();
    const { data: models } = region
      ? await supabaseAdmin
          .from("factor_models")
          .select("model_version,explained_variance,label,approved,created_at")
          .eq("region_id", region.id)
          .eq("engine", "market")
          .order("created_at", { ascending: false })
          .limit(1)
      : { data: [] };
    const model = models?.[0] ?? null;
    const variance = model?.explained_variance as { first_factor?: number } | null;
    const indicators = series.map((indicator) => {
      const config = MARKET_COMPONENTS[indicator.concept];
      const base =
        config?.transform === "volatility21" ? indicator.history : monthlyLast(indicator.history);
      const transformed = config ? transformSeries(base, config.transform) : base;
      return {
        concept: indicator.concept,
        label: config?.label ?? indicator.label,
        series: indicator.seriesCode,
        frequency: indicator.frequency,
        unit: config?.transform ?? indicator.unit,
        latest: transformed.at(-1)?.value ?? null,
        date: transformed.at(-1)?.date ?? null,
        previous: transformed.at(-2)?.value ?? null,
        history: transformed.slice(-36),
        observationCount: transformed.length,
      };
    });
    return {
      score,
      indicators,
      pca: {
        status: model ? "shadow" : "not_run",
        version: (model?.model_version as string | null) ?? null,
        explainedVariance: variance?.first_factor ?? null,
        label: (model?.label as string | null) ?? "Market co-movement factor",
      },
      note: "The transparent stress score is the live decision aid. The experimental common-movement model remains a comparison only until it proves stable across different data updates.",
    };
  },
);
