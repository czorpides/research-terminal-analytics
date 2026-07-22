import { createServerFn } from "@tanstack/react-start";

import { loadUsEngineSeries } from "@/lib/macro/engine-data.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  LABOUR_COMPONENTS,
  scoreLabourMarket,
  type LabourMarketScore,
} from "@/lib/scoring/labour-market.server";
import { transformSeries } from "@/lib/scoring/macro-series";

export interface LabourEnginePayload {
  score: LabourMarketScore;
  indicators: Array<{
    concept: string;
    label: string;
    series: string;
    frequency: string;
    latest: number | null;
    date: string | null;
    previous: number | null;
  }>;
  kalman: { status: string; version: string | null; asOf: string | null };
  note: string;
}

export const getLabourEngine = createServerFn({ method: "GET" }).handler(
  async (): Promise<LabourEnginePayload> => {
    const series = await loadUsEngineSeries("labour");
    const score = scoreLabourMarket(series);
    const { data: runs } = await supabaseAdmin
      .from("model_runs")
      .select("status,model_version,finished_at,started_at")
      .eq("model_key", "labour_engine.us.kalman_llt")
      .order("started_at", { ascending: false })
      .limit(1);
    const run = runs?.[0] ?? null;
    const indicators = series.map((indicator) => {
      const config = LABOUR_COMPONENTS[indicator.concept];
      const transformed = config
        ? transformSeries(indicator.history, config.transform)
        : indicator.history;
      return {
        concept: indicator.concept,
        label: config?.label ?? indicator.label,
        series: indicator.seriesCode,
        frequency: indicator.frequency,
        latest: transformed.at(-1)?.value ?? null,
        date: transformed.at(-1)?.date ?? null,
        previous: transformed.at(-2)?.value ?? null,
      };
    });
    return {
      score,
      kalman: {
        status: (run?.status as string | null) ?? "not_run",
        version: (run?.model_version as string | null) ?? null,
        asOf: (run?.finished_at as string | null) ?? (run?.started_at as string | null) ?? null,
      },
      indicators,
      note: "The Labour Heat Score standardises employment, slack, demand and wage indicators against their own history. It measures labour-cycle heat, not the probability of a specific payroll print.",
    };
  },
);
