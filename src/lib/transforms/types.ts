/**
 * Reusable transformation framework — shared by Growth, Inflation, Liquidity,
 * Labour and Market Confirmation engines.
 *
 * A transform is a pure function that takes an ordered (date, value) series
 * and produces another ordered series. Every transform run is stamped with
 * its calc_version, inputs_hash, computed_at, frequency and (optional)
 * seasonal-adjustment flag so results are fully auditable and reproducible.
 */
export type Frequency = "daily" | "weekly" | "monthly" | "quarterly" | "annual";

export type TransformName =
  | "level"
  | "mom"
  | "wow"
  | "qoq"
  | "yoy"
  | "chg3m"
  | "chg6m"
  | "chg3mAnn"
  | "chg6mAnn"
  | "chg12m"
  | "diffAbs"
  | "diffPct"
  | "momentum" // 3-period rolling mean
  | "momentum6" // 6-period rolling mean
  | "acceleration" // 1st difference of mom
  | "ewma"
  | "rollingStd"
  | "zscoreHistorical"
  | "percentileHistorical"
  | "kalmanLevel"
  | "kalmanSlope"
  | "kalmanCI";

export const ALL_TRANSFORMS: TransformName[] = [
  "level","mom","wow","qoq","yoy","chg3m","chg6m","chg3mAnn","chg6mAnn","chg12m",
  "diffAbs","diffPct","momentum","momentum6","acceleration","ewma","rollingStd",
  "zscoreHistorical","percentileHistorical","kalmanLevel","kalmanSlope","kalmanCI",
];

export interface SeriesPoint { date: string; value: number | null }

export interface TransformSpec {
  name: TransformName;
  formula: string;
  unit: "level" | "pct" | "pct_annualised" | "index" | "zscore" | "percentile" | "abs";
  minHistory: number;
  needsFrequency?: boolean;
  computedByKalman?: boolean;
}

export interface TransformResult {
  name: TransformName;
  spec: TransformSpec;
  points: SeriesPoint[];
  calcVersion: string;
  computedAt: string;
  inputsHash: string;
  frequency: Frequency;
  seasonalAdjusted: boolean;
  lookback: number | null;
}

export interface TargetRange { value: number; band: [number, number]; unit: string }

/**
 * Directionality context — feeds `zoneFor` traffic-light rules. Some series
 * (CPI, PCE) are best when close to a target band; others (unemployment)
 * are simply lower-is-better; others (retail sales YoY) higher-is-better.
 */
export type Directionality = "higher_is_better" | "lower_is_better" | "context";
export type Zone = "green" | "yellow" | "red" | "gray";