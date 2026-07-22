import { createServerFn } from "@tanstack/react-start";

import { loadUsEngineSeries } from "@/lib/macro/engine-data.server";
import {
  scoreFinancialConditions,
  type FinancialConditionsScore,
} from "@/lib/scoring/financial-conditions.server";

export interface LiquidityEnginePayload {
  score: FinancialConditionsScore;
  indicators: Array<{
    concept: string;
    label: string;
    series: string;
    frequency: string;
    unit: string | null;
    latest: number | null;
    previous: number | null;
    date: string | null;
    change1m: number | null;
    history: Array<{ date: string; value: number }>;
    observationCount: number;
  }>;
  note: string;
}

const META: Record<
  string,
  {
    label: string;
    family: "rates" | "credit" | "liquidity";
    higherIsTighter: boolean;
    weight: number;
  }
> = {
  fed_funds: {
    label: "Federal funds rate",
    family: "rates",
    higherIsTighter: true,
    weight: 0.15,
  },
  treasury_2y: {
    label: "2Y Treasury yield",
    family: "rates",
    higherIsTighter: true,
    weight: 0.1,
  },
  treasury_10y: {
    label: "10Y Treasury yield",
    family: "rates",
    higherIsTighter: true,
    weight: 0.05,
  },
  yield_curve_10y2y: {
    label: "10Y–2Y curve",
    family: "rates",
    higherIsTighter: false,
    weight: 0.1,
  },
  bbb_credit_spread: {
    label: "BBB credit spread",
    family: "credit",
    higherIsTighter: true,
    weight: 0.15,
  },
  high_yield_spread: {
    label: "High-yield spread",
    family: "credit",
    higherIsTighter: true,
    weight: 0.2,
  },
  financial_stress: {
    label: "St. Louis Fed stress",
    family: "credit",
    higherIsTighter: true,
    weight: 0.15,
  },
  broad_money_m2: {
    label: "M2 money stock",
    family: "liquidity",
    higherIsTighter: false,
    weight: 0.03,
  },
  bank_credit: {
    label: "Bank credit",
    family: "liquidity",
    higherIsTighter: false,
    weight: 0.04,
  },
  reserve_balances: {
    label: "Reserve balances",
    family: "liquidity",
    higherIsTighter: false,
    weight: 0.03,
  },
};

export const getLiquidityEngine = createServerFn({ method: "GET" }).handler(
  async (): Promise<LiquidityEnginePayload> => {
    const series = await loadUsEngineSeries("liquidity");
    const indicators = series.map((indicator) => {
      const history = indicator.history;
      const latest = history.at(-1) ?? null;
      const previous = history.at(-2) ?? null;
      const meta = META[indicator.concept];
      return {
        concept: indicator.concept,
        label: meta?.label ?? indicator.concept,
        series: indicator.seriesCode,
        frequency: indicator.frequency,
        unit: indicator.unit,
        latest: latest?.value ?? null,
        previous: previous?.value ?? null,
        date: latest?.date ?? null,
        change1m: latest && previous ? latest.value - previous.value : null,
        history: history.slice(-36),
        observationCount: history.length,
      };
    });
    const score = scoreFinancialConditions(
      series.flatMap((indicator) => {
        const meta = META[indicator.concept];
        return meta
          ? [
              {
                ...meta,
                key: indicator.concept,
                values: indicator.history.map((point) => point.value),
                current: indicator.history.at(-1)?.value ?? null,
              },
            ]
          : [];
      }),
    );
    return {
      score,
      indicators,
      note: "Stage 3 uses a transparent, direction-adjusted z-score composite. It is a financial-conditions monitor, not a credit forecast or a validated PCA factor.",
    };
  },
);
