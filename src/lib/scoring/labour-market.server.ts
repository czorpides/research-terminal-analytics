import type { MacroIndicatorSeries } from "@/lib/macro/engine-data.server";
import { latestZScore, monthlyLast, transformSeries, type SeriesTransform } from "./macro-series";

export type LabourFamily = "employment" | "slack" | "demand" | "wages";
export interface LabourComponent {
  key: string;
  label: string;
  family: LabourFamily;
  latest: number | null;
  date: string | null;
  zScore: number | null;
  configuredWeight: number;
  effectiveWeight: number;
  contribution: number | null;
}
export interface LabourMarketScore {
  score: number | null;
  regime: "hot" | "balanced" | "cooling" | "stressed" | "insufficient";
  confidence: number;
  methodology: string;
  familyScores: Partial<Record<LabourFamily, number>>;
  components: LabourComponent[];
}

interface Config {
  label: string;
  family: LabourFamily;
  weight: number;
  sign: 1 | -1;
  transform: SeriesTransform;
  minHistory: number;
}
export const LABOUR_COMPONENTS: Record<string, Config> = {
  unemployment_rate: {
    label: "Unemployment rate",
    family: "slack",
    weight: 0.16,
    sign: -1,
    transform: "level",
    minHistory: 36,
  },
  underemployment_rate: {
    label: "U-6 underemployment",
    family: "slack",
    weight: 0.08,
    sign: -1,
    transform: "level",
    minHistory: 36,
  },
  nonfarm_payrolls: {
    label: "Payroll growth",
    family: "employment",
    weight: 0.16,
    sign: 1,
    transform: "change",
    minHistory: 24,
  },
  private_payrolls: {
    label: "Private payroll growth",
    family: "employment",
    weight: 0.08,
    sign: 1,
    transform: "change",
    minHistory: 24,
  },
  initial_claims: {
    label: "Initial claims, 4-week mean",
    family: "employment",
    weight: 0.12,
    sign: -1,
    transform: "mean4",
    minHistory: 52,
  },
  continued_claims: {
    label: "Continued claims",
    family: "employment",
    weight: 0.08,
    sign: -1,
    transform: "level",
    minHistory: 52,
  },
  job_openings: {
    label: "Job openings",
    family: "demand",
    weight: 0.1,
    sign: 1,
    transform: "level",
    minHistory: 36,
  },
  quits_rate: {
    label: "Quits rate",
    family: "demand",
    weight: 0.06,
    sign: 1,
    transform: "level",
    minHistory: 36,
  },
  participation_rate: {
    label: "Participation rate",
    family: "slack",
    weight: 0.06,
    sign: 1,
    transform: "level",
    minHistory: 36,
  },
  wage_growth: {
    label: "Average hourly earnings YoY",
    family: "wages",
    weight: 0.1,
    sign: 1,
    transform: "yoy_pct",
    minHistory: 36,
  },
};

export function scoreLabourMarket(series: MacroIndicatorSeries[]): LabourMarketScore {
  const prepared = series.flatMap((indicator) => {
    const config = LABOUR_COMPONENTS[indicator.concept];
    if (!config) return [];
    const frequencyAdjusted =
      indicator.frequency === "daily" || indicator.frequency === "weekly"
        ? indicator.history
        : monthlyLast(indicator.history);
    const transformed = transformSeries(frequencyAdjusted, config.transform);
    const latest = transformed.at(-1) ?? null;
    const z = latestZScore(transformed, config.minHistory);
    return [{ indicator, config, transformed, latest, z: z === null ? null : z * config.sign }];
  });
  const activeWeight = prepared.reduce(
    (sum, item) => sum + (item.z === null ? 0 : item.config.weight),
    0,
  );
  const components: LabourComponent[] = prepared.map(({ indicator, config, latest, z }) => {
    const effectiveWeight = z === null || activeWeight === 0 ? 0 : config.weight / activeWeight;
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
  if (activeWeight < 0.5)
    return {
      score: null,
      regime: "insufficient",
      confidence: Math.round(activeWeight * 100),
      methodology: "labour.heat.zscore.v1",
      familyScores: {},
      components,
    };
  const score = components.reduce((sum, item) => sum + (item.contribution ?? 0), 0);
  const familyScores: Partial<Record<LabourFamily, number>> = {};
  for (const family of ["employment", "slack", "demand", "wages"] as LabourFamily[]) {
    const familyComponents = components.filter(
      (item) => item.family === family && item.zScore !== null,
    );
    const weight = familyComponents.reduce((sum, item) => sum + item.configuredWeight, 0);
    if (weight)
      familyScores[family] = familyComponents.reduce(
        (sum, item) => sum + (item.zScore! * item.configuredWeight) / weight,
        0,
      );
  }
  const employment = familyScores.employment ?? 0;
  const regime =
    score > 0.75
      ? "hot"
      : score < -0.9
        ? "stressed"
        : score < -0.25 || employment < -0.5
          ? "cooling"
          : "balanced";
  return {
    score: Math.round(score * 100) / 100,
    regime,
    confidence: Math.round(activeWeight * 100),
    methodology: "labour.heat.zscore.v1",
    familyScores,
    components,
  };
}
