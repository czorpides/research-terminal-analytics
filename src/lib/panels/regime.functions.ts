import { createServerFn } from "@tanstack/react-start";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadUsEngineSeries, type MacroIndicatorSeries } from "@/lib/macro/engine-data.server";
import { scoreFinancialConditions } from "@/lib/scoring/financial-conditions.server";
import {
  buildGrowthComposite,
  type GrowthCompositeInput,
} from "@/lib/scoring/growth-composite.server";
import { scoreLabourMarket } from "@/lib/scoring/labour-market.server";
import { classifyMacroRegime, type MacroRegimeResult } from "@/lib/scoring/macro-regime.server";
import { latestZScore, monthlyLast, transformSeries } from "@/lib/scoring/macro-series";
import { scoreMarketStress } from "@/lib/scoring/market-stress.server";

const LIQUIDITY: Record<
  string,
  {
    label: string;
    family: "rates" | "credit" | "liquidity";
    higherIsTighter: boolean;
    weight: number;
  }
> = {
  fed_funds: { label: "Federal funds rate", family: "rates", higherIsTighter: true, weight: 0.15 },
  treasury_2y: { label: "2Y Treasury", family: "rates", higherIsTighter: true, weight: 0.1 },
  treasury_10y: { label: "10Y Treasury", family: "rates", higherIsTighter: true, weight: 0.05 },
  yield_curve_10y2y: {
    label: "10Y-2Y curve",
    family: "rates",
    higherIsTighter: false,
    weight: 0.1,
  },
  bbb_credit_spread: { label: "BBB spread", family: "credit", higherIsTighter: true, weight: 0.15 },
  high_yield_spread: { label: "HY spread", family: "credit", higherIsTighter: true, weight: 0.2 },
  financial_stress: {
    label: "Financial stress",
    family: "credit",
    higherIsTighter: true,
    weight: 0.15,
  },
  broad_money_m2: { label: "M2", family: "liquidity", higherIsTighter: false, weight: 0.03 },
  bank_credit: { label: "Bank credit", family: "liquidity", higherIsTighter: false, weight: 0.04 },
  reserve_balances: {
    label: "Reserves",
    family: "liquidity",
    higherIsTighter: false,
    weight: 0.03,
  },
};

export interface RegimeMonitorPayload {
  current: MacroRegimeResult;
  inputs: {
    growth: number | null;
    inflation: number | null;
    liquidityStress: number | null;
    labourHeat: number | null;
    marketStress: number | null;
  };
  hmm: {
    status: "shadow" | "not_run";
    label: string | null;
    probabilities: Record<string, number>;
    version: string | null;
    asOf: string | null;
  };
  note: string;
}

export const getRegimeMonitor = createServerFn({ method: "GET" }).handler(
  async (): Promise<RegimeMonitorPayload> => {
    const [growthSeries, inflationSeries, liquiditySeries, labourSeries, marketSeries] =
      await Promise.all([
        loadUsEngineSeries("growth"),
        loadUsEngineSeries("inflation"),
        loadUsEngineSeries("liquidity"),
        loadUsEngineSeries("labour"),
        loadUsEngineSeries("market"),
      ]);
    const growth = growthInput(growthSeries);
    const inflation = inflationInput(inflationSeries);
    const liquidity = scoreFinancialConditions(
      liquiditySeries.flatMap((indicator) => {
        const config = LIQUIDITY[indicator.concept];
        return config
          ? [
              {
                key: indicator.concept,
                ...config,
                values: indicator.history.map((point) => point.value),
                current: indicator.history.at(-1)?.value ?? null,
              },
            ]
          : [];
      }),
    ).score;
    const labour = scoreLabourMarket(labourSeries).score;
    const market = scoreMarketStress(marketSeries).score;
    const inputs = {
      growth,
      inflation,
      liquidityStress: liquidity,
      labourHeat: labour,
      marketStress: market,
    };
    const current = classifyMacroRegime(inputs);

    const { data: region } = await supabaseAdmin
      .from("regions")
      .select("id")
      .eq("code", "US")
      .maybeSingle();
    const { data: states } = region
      ? await supabaseAdmin
          .from("regime_states")
          .select("ts,model_version,state_label,probabilities,status")
          .eq("region_id", region.id)
          .order("ts", { ascending: false })
          .limit(1)
      : { data: [] };
    const state = states?.[0] ?? null;
    return {
      current,
      inputs,
      hmm: {
        status: state ? "shadow" : "not_run",
        label: (state?.state_label as string | null) ?? null,
        probabilities: (state?.probabilities as Record<string, number> | null) ?? {},
        version: (state?.model_version as string | null) ?? null,
        asOf: (state?.ts as string | null) ?? null,
      },
      note: "The transparent rules-based regime is live. The experimental probability model remains a comparison only until its behaviour is stable on data it was not trained on.",
    };
  },
);

function growthInput(series: MacroIndicatorSeries[]): number | null {
  const transforms: Record<string, "yoy_pct" | "change" | "mean4"> = {
    industrial_production: "yoy_pct",
    retail_sales: "yoy_pct",
    housing_starts: "yoy_pct",
    nonfarm_payrolls: "change",
    initial_jobless_claims: "mean4",
  };
  const inputs: GrowthCompositeInput[] = series.flatMap((indicator) =>
    transforms[indicator.concept]
      ? [
          {
            conceptCode: indicator.concept,
            points: monthlyLast(transformSeries(indicator.history, transforms[indicator.concept])),
          },
        ]
      : [],
  );
  return buildGrowthComposite(inputs).at(-1)?.value ?? null;
}

function inflationInput(series: MacroIndicatorSeries[]): number | null {
  const core =
    series.find((indicator) => indicator.concept === "cpi_core") ??
    series.find((indicator) => indicator.concept === "cpi_headline");
  if (!core) return null;
  const yoy = transformSeries(monthlyLast(core.history), "yoy_pct");
  const levelZ = latestZScore(yoy, 36);
  if (levelZ === null) return null;
  const momentum = yoy.length >= 4 ? yoy.at(-1)!.value - yoy.at(-4)!.value : 0;
  return Math.max(-3, Math.min(3, levelZ + Math.max(-1, Math.min(1, momentum)) * 0.35));
}
