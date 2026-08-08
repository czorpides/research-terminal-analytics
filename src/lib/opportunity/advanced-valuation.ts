import type {
  InstitutionalAnalysis,
  InstitutionalFundamentals,
  InstitutionalPeriod,
} from "./institutional-model";

export const ADVANCED_VALUATION_CALC_VERSION = "opportunity.advanced-valuation.v0.1";

export interface HistoricalValuationPoint {
  assetId: string;
  periodEnd: string;
  priceDate: string | null;
  marketCap: number | null;
  evEbitda: number | null;
  fcfYield: number | null;
  evRevenue: number | null;
  ptbv: number | null;
}

export interface AdvancedValuationInput {
  industryCode: string | null;
  periods: InstitutionalPeriod[];
  fundamentals: InstitutionalFundamentals;
  history: HistoricalValuationPoint[];
}

export interface AdvancedValuationResult {
  metrics: Record<string, number | null>;
  warnings: string[];
  dataGaps: string[];
  calcVersion: string;
}

const FINANCIAL = "SEC_FIN";
const CYCLICAL = new Set(["SEC_ENE", "SEC_MAT"]);
const MIN_HISTORY_POINTS = 5;

/**
 * Adds the valuation evidence that deliberately sat outside institutional.v0.1:
 *
 * - observed own-history multiple percentiles (not synthetic back-casts)
 * - P/TBV versus ROTCE for financials
 * - mid-cycle normalized EBITDA/FCF for Energy and Materials
 *
 * Missing history remains missing. This helper never fills gaps with peer or
 * macro proxies because the fundamental gate treats those as separate lenses.
 */
export function computeAdvancedValuation(input: AdvancedValuationInput): AdvancedValuationResult {
  const periods = [...input.periods]
    .filter((period) => Boolean(period.periodEnd))
    .sort((left, right) => right.periodEnd.localeCompare(left.periodEnd));
  const current = periods[0] ?? null;
  const prior = periods[1] ?? null;
  const history = [...input.history]
    .filter((point) => Boolean(point.periodEnd))
    .sort((left, right) => right.periodEnd.localeCompare(left.periodEnd));

  const marketCap = positive(input.fundamentals.marketCap);
  const currentDebt = nonNegative(current?.totalDebt) ?? 0;
  const currentCash = nonNegative(current?.cashAndInvestments) ?? 0;
  const enterpriseValue = marketCap === null ? null : marketCap + currentDebt - currentCash;
  const currentRevenue = positive(current?.revenue);
  const evRevenue = ratio(enterpriseValue, currentRevenue);

  const tangibleEquity = tangibleCommonEquity(current);
  const priorTangibleEquity = tangibleCommonEquity(prior);
  const priceToTangibleBook = ratio(marketCap, positive(tangibleEquity));
  const rotce = ratio(current?.netIncome, averagePositive(tangibleEquity, priorTangibleEquity));

  const historyCount = new Set(history.map((point) => point.periodEnd)).size;
  const evEbitdaHistory = validSeries(history.map((point) => point.evEbitda), (value) => value > 0);
  const fcfYieldHistory = validSeries(history.map((point) => point.fcfYield));
  const evRevenueHistory = validSeries(history.map((point) => point.evRevenue), (value) => value > 0);
  const ptbvHistory = validSeries(history.map((point) => point.ptbv), (value) => value > 0);

  const currentEvEbitda = finite(input.fundamentals.evEbitda);
  const currentFcfYield = finite(input.fundamentals.fcfYield);
  const historicalEvEbitdaMedian = medianEnough(evEbitdaHistory, 3);
  const historicalFcfYieldMedian = medianEnough(fcfYieldHistory, 3);
  const historicalEvRevenueMedian = medianEnough(evRevenueHistory, 3);
  const historicalPtBvMedian = medianEnough(ptbvHistory, 3);

  const selfEvEbitdaPercentile = percentileEnough(
    currentEvEbitda,
    evEbitdaHistory,
    "lower",
    MIN_HISTORY_POINTS,
  );
  const selfFcfYieldPercentile = percentileEnough(
    currentFcfYield,
    fcfYieldHistory,
    "higher",
    MIN_HISTORY_POINTS,
  );
  const selfEvRevenuePercentile = percentileEnough(
    evRevenue,
    evRevenueHistory,
    "lower",
    MIN_HISTORY_POINTS,
  );
  const selfPtBvPercentile = percentileEnough(
    priceToTangibleBook,
    ptbvHistory,
    "lower",
    MIN_HISTORY_POINTS,
  );

  const ebitdaMargins = periods
    .map((period) => ratio(derivedEbitda(period), positive(period.revenue)))
    .filter(isNumber);
  const fcfMargins = periods
    .map((period) => ratio(derivedFcf(period), positive(period.revenue)))
    .filter(isNumber);
  const normalizedEbitdaMargin = medianEnough(ebitdaMargins, MIN_HISTORY_POINTS);
  const normalizedFcfMargin = medianEnough(fcfMargins, MIN_HISTORY_POINTS);
  const normalizedEbitda =
    currentRevenue !== null && normalizedEbitdaMargin !== null
      ? currentRevenue * normalizedEbitdaMargin
      : null;
  const normalizedFcf =
    currentRevenue !== null && normalizedFcfMargin !== null
      ? currentRevenue * normalizedFcfMargin
      : null;
  const normalizedEvEbitda = ratio(enterpriseValue, positive(normalizedEbitda));
  const normalizedFcfYield = ratio(normalizedFcf, marketCap);

  const warnings: string[] = [];
  const dataGaps: string[] = [];

  if (historyCount < MIN_HISTORY_POINTS) {
    dataGaps.push(
      `Historical self-valuation has ${historyCount} observed fiscal-year price/statement pairs; at least ${MIN_HISTORY_POINTS} are required before the own-history percentile can pass.`,
    );
  }

  if (input.industryCode === FINANCIAL) {
    if (priceToTangibleBook === null || rotce === null) {
      dataGaps.push("Financial valuation needs positive tangible common equity and current/prior earnings history for P/TBV versus ROTCE.");
    } else if (rotce <= 0) {
      warnings.push("ROTCE is non-positive, so a low P/TBV may reflect impaired economics rather than undervaluation.");
    }
  }

  if (CYCLICAL.has(input.industryCode ?? "")) {
    if (normalizedEvEbitda === null || normalizedFcfYield === null) {
      dataGaps.push(
        `Mid-cycle normalization needs at least ${MIN_HISTORY_POINTS} usable annual EBITDA and FCF margins.`,
      );
    }
  }

  return {
    metrics: {
      historicalValuationPeriods: historyCount,
      historicalEvEbitdaMedian,
      historicalFcfYieldMedian,
      historicalEvRevenueMedian,
      historicalPtBvMedian,
      selfEvEbitdaPercentile,
      selfFcfYieldPercentile,
      selfEvRevenuePercentile,
      selfPtBvPercentile,
      evRevenue,
      priceToTangibleBook,
      rotce,
      normalizedEbitdaMargin,
      normalizedFcfMargin,
      normalizedEvEbitda,
      normalizedFcfYield,
    },
    warnings,
    dataGaps,
    calcVersion: ADVANCED_VALUATION_CALC_VERSION,
  };
}

export function withAdvancedValuationContext(
  analysis: InstitutionalAnalysis,
  input: AdvancedValuationInput,
): InstitutionalAnalysis {
  const advanced = computeAdvancedValuation(input);
  return {
    ...analysis,
    rawMetrics: {
      ...analysis.rawMetrics,
      ...advanced.metrics,
    },
    warnings: unique([...analysis.warnings, ...advanced.warnings]),
    dataGaps: unique([...analysis.dataGaps, ...advanced.dataGaps]),
  };
}

function tangibleCommonEquity(period: InstitutionalPeriod | null): number | null {
  if (!period) return null;
  const equity = finite(period.totalEquity);
  if (equity === null) return null;
  const goodwill = nonNegative(period.goodwill) ?? 0;
  const intangible = nonNegative(period.intangibleAssets) ?? 0;
  const result = equity - goodwill - intangible;
  return Number.isFinite(result) ? result : null;
}

function derivedEbitda(period: InstitutionalPeriod | null): number | null {
  if (!period) return null;
  const direct = finite(period.ebitda);
  if (direct !== null) return direct;
  const ebit = finite(period.ebit ?? period.operatingIncome);
  const da = finite(period.depreciationAmortization);
  return ebit !== null && da !== null ? ebit + da : null;
}

function derivedFcf(period: InstitutionalPeriod | null): number | null {
  if (!period) return null;
  const direct = finite(period.freeCashFlow);
  if (direct !== null) return direct;
  const ocf = finite(period.operatingCashFlow);
  const capex = finite(period.capitalExpenditure);
  if (ocf === null || capex === null) return null;
  return ocf - Math.abs(capex);
}

function percentileEnough(
  current: number | null,
  history: number[],
  direction: "lower" | "higher",
  minimum: number,
): number | null {
  if (current === null || history.length < minimum) return null;
  const favourable = history.filter((value) =>
    direction === "lower" ? current <= value : current >= value,
  ).length;
  return round1((favourable / history.length) * 100);
}

function medianEnough(values: number[], minimum: number): number | null {
  if (values.length < minimum) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function validSeries(
  values: Array<number | null>,
  predicate: (value: number) => boolean = () => true,
): number[] {
  return values.filter((value): value is number => isNumber(value) && predicate(value));
}

function averagePositive(left: number | null, right: number | null): number | null {
  const a = positive(left);
  const b = positive(right);
  if (a !== null && b !== null) return (a + b) / 2;
  return a ?? b;
}

function ratio(numerator: number | null | undefined, denominator: number | null | undefined): number | null {
  const n = finite(numerator);
  const d = finite(denominator);
  if (n === null || d === null || d === 0) return null;
  const result = n / d;
  return Number.isFinite(result) ? result : null;
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positive(value: unknown): number | null {
  const parsed = finite(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function nonNegative(value: unknown): number | null {
  const parsed = finite(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
