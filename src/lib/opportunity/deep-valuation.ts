export const DEEP_VALUATION_CALC_VERSION = "opportunity.deep-valuation.v0.1";

export interface DeepValuationPeriod {
  periodEnd: string;
  revenue: number | null;
  ebit: number | null;
  ebitda: number | null;
  depreciationAmortization: number | null;
  freeCashFlow: number | null;
  operatingCashFlow: number | null;
  capitalExpenditure: number | null;
  netIncome: number | null;
  netIncomeToCommon: number | null;
  totalEquity: number | null;
  goodwill: number | null;
  intangibleAssets: number | null;
  preferredStock: number | null;
  historicalMarketCap: number | null;
  historicalEnterpriseValue: number | null;
  historicalEvEbitda: number | null;
  historicalEvRevenue: number | null;
  historicalFcfYield: number | null;
}

export interface CurrentValuationSnapshot {
  marketCap: number | null;
  evEbitda: number | null;
  fcfYield: number | null;
}

export interface DeepValuationEvidence {
  historyYears: number;
  currentEvRevenue: number | null;
  selfEvEbitdaCheapness: number | null;
  selfEvRevenueCheapness: number | null;
  selfFcfYieldCheapness: number | null;
  priceToTangibleBook: number | null;
  rotce: number | null;
  rotceToPtbv: number | null;
  rotceQuality: number | null;
  selfPtbvCheapness: number | null;
  normalizedEbitda: number | null;
  normalizedEvEbitda: number | null;
  normalizedFcf: number | null;
  normalizedFcfYield: number | null;
  cycleHistoryYears: number;
}

/**
 * Compute the historical/self and sector-specific valuation evidence required
 * by the Opportunity Radar. Missing history stays null: this helper never
 * manufactures a historical multiple from the current price.
 */
export function computeDeepValuationEvidence(input: {
  periods: DeepValuationPeriod[];
  current: CurrentValuationSnapshot;
  currentEnterpriseValue: number | null;
}): DeepValuationEvidence {
  const periods = [...input.periods].sort((left, right) =>
    right.periodEnd.localeCompare(left.periodEnd),
  );
  const currentPeriod = periods[0] ?? null;
  const priorPeriod = periods[1] ?? null;

  const evEbitdaHistory = finiteSeries(periods.map((period) => period.historicalEvEbitda));
  const evRevenueHistory = finiteSeries(periods.map((period) => period.historicalEvRevenue));
  const fcfYieldHistory = finiteSeries(periods.map((period) => period.historicalFcfYield));

  const currentEvRevenue = ratio(input.currentEnterpriseValue, currentPeriod?.revenue);
  const selfEvEbitdaCheapness = cheapnessLower(input.current.evEbitda, evEbitdaHistory, 5);
  const selfEvRevenueCheapness = cheapnessLower(currentEvRevenue, evRevenueHistory, 5);
  const selfFcfYieldCheapness = cheapnessHigher(input.current.fcfYield, fcfYieldHistory, 5);

  const tangibleCommonEquity = tangibleEquity(currentPeriod);
  const priorTangibleCommonEquity = tangibleEquity(priorPeriod);
  const commonIncome = finite(currentPeriod?.netIncomeToCommon) ?? finite(currentPeriod?.netIncome);
  const averageTangibleEquity = averagePositive(tangibleCommonEquity, priorTangibleCommonEquity);
  const rotce = ratio(commonIncome, averageTangibleEquity);
  const priceToTangibleBook = ratio(input.current.marketCap, tangibleCommonEquity);
  const rotceToPtbv = ratio(rotce, priceToTangibleBook);
  // A provider-supplied common-income numerator is stronger evidence. A net
  // income fallback remains usable but cannot be mistaken for perfect ROTCE.
  const rotceQuality = currentPeriod
    ? finite(currentPeriod.netIncomeToCommon) !== null
      ? 1
      : commonIncome !== null && tangibleCommonEquity !== null
        ? 0.75
        : null
    : null;

  const historicalPtbv = finiteSeries(
    periods.map((period) => ratio(period.historicalMarketCap, tangibleEquity(period))),
  );
  const selfPtbvCheapness = cheapnessLower(priceToTangibleBook, historicalPtbv, 5);

  const ebitdaSeries = finiteSeries(periods.map(derivedEbitda));
  const fcfSeries = finiteSeries(periods.map(derivedFcf));
  const cycleHistoryYears = Math.min(ebitdaSeries.length, periods.length);
  const normalizedEbitda = ebitdaSeries.length >= 7 ? median(ebitdaSeries) : null;
  const normalizedFcf = fcfSeries.length >= 7 ? median(fcfSeries) : null;
  const normalizedEvEbitda = ratio(input.currentEnterpriseValue, positive(normalizedEbitda));
  const normalizedFcfYield = ratio(normalizedFcf, input.current.marketCap);

  return {
    historyYears: Math.max(evEbitdaHistory.length, evRevenueHistory.length, fcfYieldHistory.length),
    currentEvRevenue,
    selfEvEbitdaCheapness,
    selfEvRevenueCheapness,
    selfFcfYieldCheapness,
    priceToTangibleBook,
    rotce,
    rotceToPtbv,
    rotceQuality,
    selfPtbvCheapness,
    normalizedEbitda,
    normalizedEvEbitda,
    normalizedFcf,
    normalizedFcfYield,
    cycleHistoryYears,
  };
}

/** 0..100 where 100 means the current multiple is at the cheap end of history. */
export function cheapnessLower(
  current: number | null | undefined,
  history: number[],
  minimumObservations = 5,
): number | null {
  const value = finite(current);
  const usable = history.filter(Number.isFinite);
  if (value === null || usable.length < minimumObservations) return null;
  const atOrAbove = usable.filter((observation) => observation >= value).length;
  return round1((atOrAbove / usable.length) * 100);
}

/** 0..100 where 100 means the current yield is at the cheap end of history. */
export function cheapnessHigher(
  current: number | null | undefined,
  history: number[],
  minimumObservations = 5,
): number | null {
  const value = finite(current);
  const usable = history.filter(Number.isFinite);
  if (value === null || usable.length < minimumObservations) return null;
  const atOrBelow = usable.filter((observation) => observation <= value).length;
  return round1((atOrBelow / usable.length) * 100);
}

function tangibleEquity(period: DeepValuationPeriod | null | undefined): number | null {
  if (!period) return null;
  const equity = finite(period.totalEquity);
  if (equity === null) return null;
  const tangible =
    equity -
    (nonNegative(period.goodwill) ?? 0) -
    (nonNegative(period.intangibleAssets) ?? 0) -
    (nonNegative(period.preferredStock) ?? 0);
  return tangible > 0 ? tangible : null;
}

function derivedEbitda(period: DeepValuationPeriod): number | null {
  const direct = positive(period.ebitda);
  if (direct !== null) return direct;
  const ebit = finite(period.ebit);
  const da = nonNegative(period.depreciationAmortization);
  return ebit !== null && da !== null ? positive(ebit + da) : null;
}

function derivedFcf(period: DeepValuationPeriod): number | null {
  const direct = finite(period.freeCashFlow);
  if (direct !== null) return direct;
  const ocf = finite(period.operatingCashFlow);
  const capex = finite(period.capitalExpenditure);
  if (ocf === null || capex === null) return null;
  return ocf + (capex <= 0 ? capex : -capex);
}

function finiteSeries(values: Array<number | null | undefined>): number[] {
  return values.flatMap((value) => {
    const parsed = finite(value);
    return parsed === null ? [] : [parsed];
  });
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function averagePositive(left: number | null, right: number | null): number | null {
  if (left === null) return null;
  if (right === null) return left > 0 ? left : null;
  const value = (left + right) / 2;
  return value > 0 ? value : null;
}

function ratio(
  numerator: number | null | undefined,
  denominator: number | null | undefined,
): number | null {
  const left = finite(numerator);
  const right = finite(denominator);
  if (left === null || right === null || right === 0) return null;
  const value = left / right;
  return Number.isFinite(value) ? value : null;
}

function finite(value: number | null | undefined): number | null {
  return value !== null && value !== undefined && Number.isFinite(value) ? value : null;
}

function positive(value: number | null | undefined): number | null {
  const parsed = finite(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function nonNegative(value: number | null | undefined): number | null {
  const parsed = finite(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
