import { FUNDAMENTAL_METRICS } from "@/lib/ingestion/fundamentals/metrics";

export const HISTORICAL_SELF_VALUATION_CALC_VERSION = "opportunity.historical-self-valuation.v0.1";

export const HISTORICAL_SELF_VALUATION_CODES = [
  FUNDAMENTAL_METRICS.evEbitda,
  FUNDAMENTAL_METRICS.fcfYield,
  FUNDAMENTAL_METRICS.pe,
  FUNDAMENTAL_METRICS.pb,
  FUNDAMENTAL_METRICS.ps,
] as const;

export type HistoricalSelfValuationMetricCode = (typeof HISTORICAL_SELF_VALUATION_CODES)[number];

export interface HistoricalValuationObservation {
  metricCode: string;
  periodEnd: string;
  value: number;
}

export interface CurrentValuationSnapshot {
  evEbitda: number | null;
  fcfYield: number | null;
  pe: number | null;
  pb: number | null;
  ps: number | null;
}

export interface HistoricalMetricAssessment {
  metricCode: HistoricalSelfValuationMetricCode;
  label: string;
  direction: "lower" | "higher";
  currentValue: number;
  sampleCount: number;
  oldestPeriodEnd: string;
  newestPeriodEnd: string;
  cheapnessPercentile: number;
  median: number;
  detail: string;
}

export interface HistoricalSelfValuationAssessment {
  state: "strong" | "supportive" | "neutral" | "expensive" | "insufficient";
  score: number | null;
  coverage: number;
  yearsCovered: number;
  metrics: HistoricalMetricAssessment[];
  warnings: string[];
  calcVersion: string;
}

interface MetricSpec {
  code: HistoricalSelfValuationMetricCode;
  label: string;
  direction: "lower" | "higher";
  current: number | null;
  weight: number;
}

const MIN_OBSERVATIONS = 5;
const IDEAL_OBSERVATIONS = 8;
const MAX_LOOKBACK_YEARS = 10;

/**
 * Compares today's observed valuation with the company's own genuine annual
 * historical valuation observations. No historical value is reconstructed
 * from today's price, today's market cap or today's share count.
 */
export function assessHistoricalSelfValuation(
  current: CurrentValuationSnapshot,
  observations: HistoricalValuationObservation[],
  asOf = new Date().toISOString().slice(0, 10),
): HistoricalSelfValuationAssessment {
  const specs: MetricSpec[] = [
    {
      code: FUNDAMENTAL_METRICS.evEbitda,
      label: "EV / EBITDA",
      direction: "lower",
      current: validPositive(current.evEbitda),
      weight: 35,
    },
    {
      code: FUNDAMENTAL_METRICS.fcfYield,
      label: "FCF yield",
      direction: "higher",
      current: validPositive(current.fcfYield),
      weight: 30,
    },
    {
      code: FUNDAMENTAL_METRICS.pe,
      label: "P/E",
      direction: "lower",
      current: validPositive(current.pe),
      weight: 15,
    },
    {
      code: FUNDAMENTAL_METRICS.pb,
      label: "P/B",
      direction: "lower",
      current: validPositive(current.pb),
      weight: 10,
    },
    {
      code: FUNDAMENTAL_METRICS.ps,
      label: "P/S",
      direction: "lower",
      current: validPositive(current.ps),
      weight: 10,
    },
  ];

  const cutoff = yearShift(asOf, -MAX_LOOKBACK_YEARS);
  const usable = observations
    .filter((item) => HISTORICAL_SELF_VALUATION_CODES.includes(item.metricCode as HistoricalSelfValuationMetricCode))
    .filter((item) => item.periodEnd >= cutoff && item.periodEnd <= asOf)
    .filter((item) => validPositive(item.value) !== null);

  const metrics: HistoricalMetricAssessment[] = [];
  let availableWeight = 0;
  let weightedScore = 0;

  for (const spec of specs) {
    if (spec.current === null) continue;
    const series = dedupeByPeriod(
      usable
        .filter((item) => item.metricCode === spec.code)
        .map((item) => ({ periodEnd: item.periodEnd, value: item.value })),
    ).sort((left, right) => left.periodEnd.localeCompare(right.periodEnd));

    if (series.length < MIN_OBSERVATIONS) continue;
    const values = series.map((item) => item.value);
    const cheapnessPercentile = percentileCheapness(spec.current, values, spec.direction);
    metrics.push({
      metricCode: spec.code,
      label: spec.label,
      direction: spec.direction,
      currentValue: spec.current,
      sampleCount: series.length,
      oldestPeriodEnd: series[0].periodEnd,
      newestPeriodEnd: series.at(-1)!.periodEnd,
      cheapnessPercentile: round1(cheapnessPercentile),
      median: round4(median(values)),
      detail: `${spec.label} is cheaper than ${round1(cheapnessPercentile)}% of the usable annual observations in its own stored history.`,
    });
    availableWeight += spec.weight;
    weightedScore += cheapnessPercentile * spec.weight;
  }

  if (!availableWeight) {
    return {
      state: "insufficient",
      score: null,
      coverage: 0,
      yearsCovered: 0,
      metrics: [],
      warnings: [
        `At least ${MIN_OBSERVATIONS} genuine annual observations for one valuation metric are required before historical self-valuation can influence the Radar.`,
      ],
      calcVersion: HISTORICAL_SELF_VALUATION_CALC_VERSION,
    };
  }

  const score = weightedScore / availableWeight;
  const dates = metrics.flatMap((metric) => [metric.oldestPeriodEnd, metric.newestPeriodEnd]).sort();
  const yearsCovered = dates.length >= 2 ? yearDistance(dates[0], dates.at(-1)!) : 0;
  const coverage = Math.min(100, (availableWeight / 100) * 100);
  const warnings: string[] = [];
  if (metrics.every((metric) => metric.sampleCount < IDEAL_OBSERVATIONS)) {
    warnings.push(
      `History is usable but still short of the preferred ${IDEAL_OBSERVATIONS}+ annual observations per metric.`,
    );
  }
  if (yearsCovered < 5) {
    warnings.push("The stored history spans less than five years, so the percentile may not include a full valuation cycle.");
  }

  const state =
    score >= 80
      ? "strong"
      : score >= 65
        ? "supportive"
        : score < 30
          ? "expensive"
          : "neutral";

  return {
    state,
    score: round1(score),
    coverage: round1(coverage),
    yearsCovered: round1(yearsCovered),
    metrics,
    warnings,
    calcVersion: HISTORICAL_SELF_VALUATION_CALC_VERSION,
  };
}

function percentileCheapness(
  current: number,
  history: number[],
  direction: "lower" | "higher",
): number {
  if (!history.length) return 0;
  const cheaperOrEqual = history.filter((value) =>
    direction === "lower" ? current <= value : current >= value,
  ).length;
  return (cheaperOrEqual / history.length) * 100;
}

function dedupeByPeriod<T extends { periodEnd: string }>(rows: T[]): T[] {
  const byPeriod = new Map<string, T>();
  for (const row of rows) byPeriod.set(row.periodEnd, row);
  return [...byPeriod.values()];
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[midpoint]
    : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}

function validPositive(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function yearShift(date: string, years: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCFullYear(parsed.getUTCFullYear() + years);
  return parsed.toISOString().slice(0, 10);
}

function yearDistance(start: string, end: string): number {
  const milliseconds = new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime();
  return milliseconds / (365.25 * 24 * 60 * 60 * 1000);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
