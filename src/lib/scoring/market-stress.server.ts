import type { MacroIndicatorSeries } from "@/lib/macro/engine-data.server";
import { latestZScore, monthlyLast, transformSeries, type SeriesTransform } from "./macro-series";

export type MarketFamily = "equity" | "volatility" | "credit" | "rates" | "fx" | "commodities";
export interface MarketStressComponent {
  key: string;
  label: string;
  family: MarketFamily;
  latest: number | null;
  date: string | null;
  zScore: number | null;
  configuredWeight: number;
  effectiveWeight: number;
  contribution: number | null;
}
export interface MarketStressScore {
  score: number | null;
  regime: "risk_on" | "neutral" | "fragile" | "risk_off" | "insufficient";
  confidence: number;
  methodology: string;
  components: MarketStressComponent[];
}
interface Config {
  label: string;
  family: MarketFamily;
  weight: number;
  sign: 1 | -1;
  transform: SeriesTransform;
  minHistory: number;
}
export const MARKET_COMPONENTS: Record<string, Config> = {
  sp500: {
    label: "S&P 500 monthly return",
    family: "equity",
    weight: 0.18,
    sign: -1,
    transform: "pct_change",
    minHistory: 36,
  },
  nasdaq: {
    label: "Nasdaq monthly return",
    family: "equity",
    weight: 0.1,
    sign: -1,
    transform: "pct_change",
    minHistory: 36,
  },
  equity_volatility: {
    label: "VIX",
    family: "volatility",
    weight: 0.18,
    sign: 1,
    transform: "level",
    minHistory: 60,
  },
  high_yield_spread: {
    label: "High-yield spread",
    family: "credit",
    weight: 0.18,
    sign: 1,
    transform: "level",
    minHistory: 60,
  },
  real_yield_10y: {
    label: "10Y real yield",
    family: "rates",
    weight: 0.1,
    sign: 1,
    transform: "level",
    minHistory: 60,
  },
  broad_dollar: {
    label: "Broad dollar monthly return",
    family: "fx",
    weight: 0.08,
    sign: 1,
    transform: "pct_change",
    minHistory: 36,
  },
  crude_oil: {
    label: "Oil volatility",
    family: "commodities",
    weight: 0.08,
    sign: 1,
    transform: "volatility21",
    minHistory: 60,
  },
  national_fci: {
    label: "Chicago Fed NFCI",
    family: "credit",
    weight: 0.1,
    sign: 1,
    transform: "level",
    minHistory: 52,
  },
};

export function scoreMarketStress(series: MacroIndicatorSeries[]): MarketStressScore {
  const prepared = series.flatMap((indicator) => {
    const config = MARKET_COMPONENTS[indicator.concept];
    if (!config) return [];
    const base =
      config.transform === "volatility21" ? indicator.history : monthlyLast(indicator.history);
    const transformed = transformSeries(base, config.transform);
    const latest = transformed.at(-1) ?? null;
    const raw = latestZScore(transformed, config.minHistory);
    return [{ indicator, config, latest, z: raw === null ? null : raw * config.sign }];
  });
  const activeWeight = prepared.reduce(
    (sum, item) => sum + (item.z === null ? 0 : item.config.weight),
    0,
  );
  const components = prepared.map(({ indicator, config, latest, z }): MarketStressComponent => {
    const effectiveWeight = z === null || !activeWeight ? 0 : config.weight / activeWeight;
    return {
      key: indicator.concept,
      label: config.label,
      family: config.family,
      latest: latest?.value ?? null,
      date: latest?.date ?? null,
      zScore: z,
      configuredWeight: config.weight,
      effectiveWeight,
      contribution: z === null ? null : z * effectiveWeight,
    };
  });
  if (activeWeight < 0.55)
    return {
      score: null,
      regime: "insufficient",
      confidence: Math.round(activeWeight * 100),
      methodology: "market.stress.zscore.v1",
      components,
    };
  const score = components.reduce((sum, item) => sum + (item.contribution ?? 0), 0);
  const regime =
    score >= 1 ? "risk_off" : score >= 0.35 ? "fragile" : score <= -0.6 ? "risk_on" : "neutral";
  return {
    score: Math.round(score * 100) / 100,
    regime,
    confidence: Math.round(activeWeight * 100),
    methodology: "market.stress.zscore.v1",
    components,
  };
}
