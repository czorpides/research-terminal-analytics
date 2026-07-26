export const INSTITUTIONAL_CALC_VERSION = "opportunity.institutional.v0.1";

export type InstitutionalLensKey =
  | "valuation_expectations"
  | "cash_earnings"
  | "returns_reinvestment"
  | "balance_distress"
  | "operating_trajectory"
  | "capital_allocation"
  | "accounting_risk";

export type InstitutionalTier = "priority" | "qualified" | "watch" | "avoid" | "insufficient";
export type InstitutionalSignal = "positive" | "neutral" | "warning" | "risk" | "missing";

export interface InstitutionalPeriod {
  periodEnd: string;
  knownAt: string | null;
  isRestatement: boolean;
  revenue: number | null;
  costOfRevenue: number | null;
  grossProfit: number | null;
  operatingIncome: number | null;
  ebit: number | null;
  ebitda: number | null;
  interestExpense: number | null;
  incomeBeforeTax: number | null;
  incomeTaxExpense: number | null;
  netIncome: number | null;
  dilutedShares: number | null;
  totalAssets: number | null;
  totalCurrentAssets: number | null;
  totalCurrentLiabilities: number | null;
  cashAndInvestments: number | null;
  totalDebt: number | null;
  shortTermDebt: number | null;
  longTermDebt: number | null;
  totalEquity: number | null;
  totalLiabilities: number | null;
  receivables: number | null;
  inventory: number | null;
  accountsPayable: number | null;
  netPpe: number | null;
  goodwill: number | null;
  intangibleAssets: number | null;
  operatingCashFlow: number | null;
  capitalExpenditure: number | null;
  freeCashFlow: number | null;
  depreciationAmortization: number | null;
  dividendsPaid: number | null;
  commonStockRepurchased: number | null;
  commonStockIssued: number | null;
  stockBasedCompensation: number | null;
  acquisitionsNet: number | null;
  debtRepayment: number | null;
  debtIssuance: number | null;
  changeInWorkingCapital: number | null;
  sellingGeneralAdministrative: number | null;
}

export interface InstitutionalFundamentals {
  marketCap: number | null;
  beta: number | null;
  fcfYield: number | null;
  roic: number | null;
  pe: number | null;
  pb: number | null;
  evEbitda: number | null;
  currentRatio: number | null;
  debtEquity: number | null;
  asOf: string | null;
}

export interface MarketAssumptions {
  riskFreeRate: number;
  equityRiskPremium: number;
  terminalGrowthRate: number;
  fallbackPreTaxCostOfDebt: number;
  label: string;
}

export interface InstitutionalModelInput {
  assetId: string;
  industryId: string | null;
  industryCode: string | null;
  currency: string | null;
  periods: InstitutionalPeriod[];
  fundamentals: InstitutionalFundamentals;
  assumptions: MarketAssumptions;
}

export interface InstitutionalMetric {
  id: string;
  label: string;
  value: number | null;
  display: string;
  score: number | null;
  weight: number;
  signal: InstitutionalSignal;
  detail: string;
}

export interface InstitutionalLens {
  key: InstitutionalLensKey;
  label: string;
  score: number | null;
  coverage: number;
  status: InstitutionalSignal;
  summary: string;
  metrics: InstitutionalMetric[];
}

export interface InstitutionalExpectations {
  enterpriseValue: number | null;
  modelledWacc: number | null;
  costOfEquity: number | null;
  preTaxCostOfDebt: number | null;
  currentFcff: number | null;
  impliedFcffGrowth5y: number | null;
  historicalRevenueCagr: number | null;
  historicalFcfCagr: number | null;
  expectationGap: number | null;
  economicProfit: number | null;
  roic: number | null;
  roicWaccSpread: number | null;
  incrementalRoic: number | null;
  sustainableGrowth: number | null;
  impliedExcessReturnYears: number | null;
  residualIncome: number | null;
  confidence: number;
  detail: string;
}

export interface InstitutionalAnalysis {
  assetId: string;
  industryId: string | null;
  industryCode: string | null;
  calcVersion: string;
  score: number;
  coverage: number;
  tier: InstitutionalTier;
  peerPercentile: number | null;
  periodCount: number;
  latestPeriodEnd: string | null;
  lenses: InstitutionalLens[];
  expectations: InstitutionalExpectations;
  strengths: string[];
  warnings: string[];
  hardRisks: string[];
  dataGaps: string[];
  nextProof: string[];
  researchCases: string[];
  rawMetrics: Record<string, number | null>;
}

interface MetricSpec {
  id: string;
  label: string;
  value: number | null;
  score: number | null;
  weight: number;
  signal: InstitutionalSignal;
  detail: string;
  display: string;
}

interface CostOfCapitalResult {
  wacc: number | null;
  costOfEquity: number | null;
  preTaxCostOfDebt: number | null;
  confidence: number;
}

const LENS_WEIGHTS: Record<InstitutionalLensKey, number> = {
  valuation_expectations: 20,
  cash_earnings: 20,
  returns_reinvestment: 15,
  balance_distress: 15,
  operating_trajectory: 10,
  capital_allocation: 10,
  accounting_risk: 10,
};

const LENS_LABELS: Record<InstitutionalLensKey, string> = {
  valuation_expectations: "Valuation & implied expectations",
  cash_earnings: "Cash generation & earnings quality",
  returns_reinvestment: "Returns & reinvestment",
  balance_distress: "Balance sheet & distress",
  operating_trajectory: "Operating trajectory",
  capital_allocation: "Capital allocation",
  accounting_risk: "Accounting & value-trap risk",
};

const FINANCIAL_INDUSTRIES = new Set(["SEC_FIN"]);
const REIT_INDUSTRIES = new Set(["SEC_RE"]);

export function computeInstitutionalAnalysis(input: InstitutionalModelInput): InstitutionalAnalysis {
  const periods = [...input.periods]
    .filter((period) => period.periodEnd)
    .sort((left, right) => right.periodEnd.localeCompare(left.periodEnd));
  const current = periods[0] ?? null;
  const prior = periods[1] ?? null;
  const oldest = periods.at(-1) ?? null;
  const periodCount = periods.length;
  const nonFinancial = !FINANCIAL_INDUSTRIES.has(input.industryCode ?? "");
  const isReit = REIT_INDUSTRIES.has(input.industryCode ?? "");

  const currentFcf = derivedFcf(current);
  const priorFcf = derivedFcf(prior);
  const fcfSeries = periods.map(derivedFcf).filter(isNumber);
  const positiveFcfYears = fcfSeries.length
    ? fcfSeries.filter((value) => value > 0).length / fcfSeries.length
    : null;
  const fcfMargin = ratio(currentFcf, current?.revenue);
  const fcfCagr = cagr(currentFcf, derivedFcf(oldest), Math.max(periodCount - 1, 1));
  const revenueCagr = cagr(current?.revenue, oldest?.revenue, Math.max(periodCount - 1, 1));
  const revenueGrowth = growth(current?.revenue, prior?.revenue);
  const cashConversion =
    isNumber(current?.netIncome) && current.netIncome > 0
      ? ratio(current?.operatingCashFlow, current.netIncome)
      : null;
  const accrualRatio = ratio(
    subtract(current?.netIncome, current?.operatingCashFlow),
    averagePair(current?.totalAssets, prior?.totalAssets),
  );
  const fcfVolatility = normalizedVolatility(fcfSeries);

  const grossMargin = ratio(current?.grossProfit, current?.revenue);
  const priorGrossMargin = ratio(prior?.grossProfit, prior?.revenue);
  const grossMarginChange = subtract(grossMargin, priorGrossMargin);
  const ebit = current?.ebit ?? current?.operatingIncome;
  const priorEbit = prior?.ebit ?? prior?.operatingIncome;
  const ebitMargin = ratio(ebit, current?.revenue);
  const priorEbitMargin = ratio(priorEbit, prior?.revenue);
  const ebitMarginChange = subtract(ebitMargin, priorEbitMargin);
  const assetTurnover = ratio(current?.revenue, averagePair(current?.totalAssets, prior?.totalAssets));
  const priorAssetTurnover = ratio(
    prior?.revenue,
    averagePair(prior?.totalAssets, periods[2]?.totalAssets),
  );
  const assetTurnoverChange = subtract(assetTurnover, priorAssetTurnover);
  const grossProfitability = ratio(
    current?.grossProfit,
    averagePair(current?.totalAssets, prior?.totalAssets),
  );
  const operatingLeverage = degreeOfOperatingLeverage(current, prior);

  const taxRate = normalizedTaxRate(current);
  const investedCapital = derivedInvestedCapital(current);
  const priorInvestedCapital = derivedInvestedCapital(prior);
  const oldestInvestedCapital = derivedInvestedCapital(oldest);
  const averageInvestedCapital = averagePair(investedCapital, priorInvestedCapital);
  const nopat = isNumber(ebit) ? ebit * (1 - taxRate) : null;
  const priorNopat = isNumber(priorEbit) ? priorEbit * (1 - normalizedTaxRate(prior)) : null;
  const oldestEbit = oldest?.ebit ?? oldest?.operatingIncome;
  const oldestNopat = isNumber(oldestEbit) ? oldestEbit * (1 - normalizedTaxRate(oldest)) : null;
  const roic = ratio(nopat, averageInvestedCapital);
  const incrementalRoic = incrementalReturn(
    nopat,
    oldestNopat,
    investedCapital,
    oldestInvestedCapital,
  );
  const reinvestmentRate = computeReinvestmentRate(current, prior, nopat);
  const sustainableGrowth =
    isNumber(reinvestmentRate) && isNumber(incrementalRoic)
      ? reinvestmentRate * incrementalRoic
      : null;

  const marketCap = positive(input.fundamentals.marketCap);
  const totalDebt = nonNegative(current?.totalDebt);
  const cash = nonNegative(current?.cashAndInvestments) ?? 0;
  const enterpriseValue =
    isNumber(marketCap) && isNumber(totalDebt) ? marketCap + totalDebt - cash : null;
  const costOfCapital = estimateCostOfCapital({
    marketCap,
    debt: totalDebt,
    beta: input.fundamentals.beta,
    interestExpense: current?.interestExpense,
    priorDebt: prior?.totalDebt,
    taxRate,
    assumptions: input.assumptions,
  });
  const roicWaccSpread =
    isNumber(roic) && isNumber(costOfCapital.wacc) ? roic - costOfCapital.wacc : null;
  const economicProfit =
    isNumber(roicWaccSpread) && isNumber(averageInvestedCapital)
      ? roicWaccSpread * averageInvestedCapital
      : null;
  const fcff = derivedFcff(current, prior, taxRate);
  const reverseDcf = solveImpliedFcffGrowth({
    enterpriseValue,
    fcff,
    wacc: costOfCapital.wacc,
    terminalGrowth: input.assumptions.terminalGrowthRate,
    years: 5,
  });
  const expectationGap =
    isNumber(revenueCagr) && isNumber(reverseDcf.growth) ? revenueCagr - reverseDcf.growth : null;
  const impliedExcessReturnYears = estimateExcessReturnDuration(
    enterpriseValue,
    averageInvestedCapital,
    economicProfit,
    costOfCapital.wacc,
  );
  const residualIncome = computeResidualIncome(
    current,
    prior,
    costOfCapital.costOfEquity,
  );

  const netDebt =
    isNumber(totalDebt) ? totalDebt - cash : null;
  const ebitda = positive(current?.ebitda) ?? add(ebit, current?.depreciationAmortization);
  const netDebtEbitda = ratio(netDebt, ebitda);
  const interestCoverage = ratio(ebit, absolutePositive(current?.interestExpense));
  const currentRatio = ratio(current?.totalCurrentAssets, current?.totalCurrentLiabilities);
  const debtChange = growth(current?.totalDebt, prior?.totalDebt);
  const debtReduction =
    isNumber(current?.totalDebt) && isNumber(prior?.totalDebt)
      ? prior.totalDebt - current.totalDebt
      : null;
  const debtReductionYield = ratio(positive(debtReduction), marketCap);
  const netDebtFcf = ratio(netDebt, positive(currentFcf));
  const stressedInterestCoverage = stressInterestCoverage(current);

  const shareCountChange = growth(current?.dilutedShares, oldest?.dilutedShares);
  const shareCountCagr = cagr(
    current?.dilutedShares,
    oldest?.dilutedShares,
    Math.max(periodCount - 1, 1),
  );
  const dividends = outflow(current?.dividendsPaid);
  const repurchases = outflow(current?.commonStockRepurchased);
  const issuance = inflow(current?.commonStockIssued);
  const netPayoutYield = ratio(add(add(dividends, repurchases), negate(issuance)), marketCap);
  const buybackYield = ratio(subtract(repurchases, issuance), marketCap);
  const shareholderYield = add(netPayoutYield, debtReductionYield);
  const stockCompFcf = ratio(nonNegative(current?.stockBasedCompensation), positive(currentFcf));
  const acquisitionIntensity = ratio(outflow(current?.acquisitionsNet), positive(current?.operatingCashFlow));
  const goodwillGrowth = growth(
    add(current?.goodwill, current?.intangibleAssets),
    add(prior?.goodwill, prior?.intangibleAssets),
  );

  const receivablesGrowth = growth(current?.receivables, prior?.receivables);
  const inventoryGrowth = growth(current?.inventory, prior?.inventory);
  const receivablesGrowthGap = subtract(receivablesGrowth, revenueGrowth);
  const inventoryGrowthGap = subtract(inventoryGrowth, revenueGrowth);
  const goodwillToEquity = ratio(
    add(current?.goodwill, current?.intangibleAssets),
    positive(current?.totalEquity),
  );
  const beneish = computeBeneish(current, prior);
  const restatementCount = periods.filter((period) => period.isRestatement).length;
  const softAssetRatio = ratio(
    subtract(
      subtract(current?.totalAssets, current?.cashAndInvestments),
      current?.netPpe,
    ),
    current?.totalAssets,
  );
  const financingIntensity = ratio(
    add(inflow(current?.debtIssuance), inflow(current?.commonStockIssued)),
    positive(current?.totalAssets),
  );
  const misstatementRiskProxy = weightedAvailable([
    { value: scoreHigher(accrualRatio, -0.05, 0.12), weight: 35 },
    { value: scoreHigher(softAssetRatio, 0.3, 0.8), weight: 25 },
    { value: scoreHigher(receivablesGrowthGap, 0, 0.2), weight: 20 },
    { value: scoreHigher(financingIntensity, 0, 0.2), weight: 20 },
  ]);

  const valuationLens = buildLens("valuation_expectations", [
    metric(
      "fcf_yield",
      "Trailing FCF yield",
      input.fundamentals.fcfYield,
      scoreHigher(input.fundamentals.fcfYield, 0.02, 0.1),
      24,
      "A high positive free-cash-flow yield provides cash-backed valuation support.",
      formatPct(input.fundamentals.fcfYield),
      signalHigher(input.fundamentals.fcfYield, 0.07, 0.02),
    ),
    metric(
      "ebit_ev_yield",
      "EBIT / enterprise value",
      ratio(ebit, enterpriseValue),
      scoreHigher(ratio(ebit, enterpriseValue), 0.03, 0.12),
      18,
      "Enterprise-value earnings yield is less distorted by capital structure than P/E.",
      formatPct(ratio(ebit, enterpriseValue)),
      signalHigher(ratio(ebit, enterpriseValue), 0.08, 0.03),
    ),
    metric(
      "reverse_dcf_growth",
      "Market-implied 5-year FCFF growth",
      reverseDcf.growth,
      scoreLower(reverseDcf.growth, 0.25, 0),
      28,
      reverseDcf.detail,
      formatPct(reverseDcf.growth),
      signalLower(reverseDcf.growth, 0.05, 0.2),
    ),
    metric(
      "expectation_gap",
      "Historical growth minus implied growth",
      expectationGap,
      scoreHigher(expectationGap, -0.1, 0.1),
      18,
      "A positive gap means the market is pricing weaker growth than the recent revenue record.",
      formatPct(expectationGap),
      signalHigher(expectationGap, 0.05, -0.08),
    ),
    metric(
      "ev_ebitda",
      "EV / EBITDA",
      input.fundamentals.evEbitda,
      scoreLower(input.fundamentals.evEbitda, 18, 7),
      12,
      "Used as supporting evidence only; low multiples cannot overcome cash or balance-sheet failures.",
      formatMultiple(input.fundamentals.evEbitda),
      signalLower(input.fundamentals.evEbitda, 9, 18),
    ),
  ]);

  const cashLens = buildLens("cash_earnings", [
    metric(
      "positive_fcf_years",
      "Positive FCF frequency",
      positiveFcfYears,
      scoreHigher(positiveFcfYears, 0.35, 1),
      24,
      "Measures how consistently accounting earnings convert into distributable cash across stored years.",
      formatPct(positiveFcfYears),
      signalHigher(positiveFcfYears, 0.75, 0.4),
    ),
    metric(
      "fcf_margin",
      "FCF margin",
      fcfMargin,
      scoreHigher(fcfMargin, 0, 0.15),
      20,
      "Free cash flow divided by revenue identifies businesses that retain cash after reinvestment.",
      formatPct(fcfMargin),
      signalHigher(fcfMargin, 0.08, 0),
    ),
    metric(
      "cash_conversion",
      "Operating cash flow / net income",
      cashConversion,
      scoreTarget(cashConversion, 0.85, 1.5, 0.3, 2.5),
      18,
      "Persistent cash conversion below earnings can indicate aggressive accruals or working-capital pressure.",
      formatMultiple(cashConversion),
      signalTarget(cashConversion, 0.8, 1.6, 0.5, 2.5),
    ),
    metric(
      "accrual_ratio",
      "Accrual ratio",
      accrualRatio,
      scoreLower(accrualRatio, 0.12, -0.05),
      18,
      "Net income less operating cash flow, scaled by average assets. Lower is normally better.",
      formatPct(accrualRatio),
      signalLower(accrualRatio, 0.02, 0.1),
    ),
    metric(
      "fcf_growth",
      "Multi-year FCF growth",
      fcfCagr,
      scoreHigher(fcfCagr, -0.15, 0.15),
      10,
      "Growth is only rewarded when the current and oldest observations are positive and comparable.",
      formatPct(fcfCagr),
      signalHigher(fcfCagr, 0.08, -0.1),
    ),
    metric(
      "fcf_stability",
      "FCF stability",
      fcfVolatility,
      scoreLower(fcfVolatility, 1.5, 0.25),
      10,
      "Coefficient-style dispersion penalises highly unstable cash generation.",
      formatMultiple(fcfVolatility),
      signalLower(fcfVolatility, 0.5, 1.2),
    ),
  ]);

  const returnsLens = buildLens("returns_reinvestment", [
    metric(
      "roic_wacc_spread",
      "ROIC minus modelled WACC",
      roicWaccSpread,
      scoreHigher(roicWaccSpread, -0.05, 0.12),
      30,
      "Positive spreads indicate economic value creation after the opportunity cost of capital.",
      formatPct(roicWaccSpread),
      signalHigher(roicWaccSpread, 0.04, 0),
    ),
    metric(
      "incremental_roic",
      "Incremental ROIC",
      incrementalRoic,
      scoreHigher(incrementalRoic, 0, 0.2),
      24,
      "Change in NOPAT divided by the change in invested capital across the stored history.",
      formatPct(incrementalRoic),
      signalHigher(incrementalRoic, 0.12, 0),
    ),
    metric(
      "gross_profitability",
      "Gross profit / average assets",
      grossProfitability,
      scoreHigher(grossProfitability, 0.1, 0.65),
      20,
      "Gross profitability captures underlying productive economics before financing and many discretionary costs.",
      formatPct(grossProfitability),
      signalHigher(grossProfitability, 0.35, 0.12),
    ),
    metric(
      "economic_profit_margin",
      "Economic profit / invested capital",
      ratio(economicProfit, averageInvestedCapital),
      scoreHigher(ratio(economicProfit, averageInvestedCapital), -0.05, 0.12),
      16,
      "Economic profit deducts a modelled capital charge from NOPAT.",
      formatPct(ratio(economicProfit, averageInvestedCapital)),
      signalHigher(ratio(economicProfit, averageInvestedCapital), 0.04, 0),
    ),
    metric(
      "sustainable_growth",
      "Reinvestment-supported growth",
      sustainableGrowth,
      scoreTarget(sustainableGrowth, 0.02, 0.18, -0.1, 0.35),
      10,
      "Reinvestment rate multiplied by incremental ROIC; extreme values receive less credit because they are often unstable.",
      formatPct(sustainableGrowth),
      signalTarget(sustainableGrowth, 0.03, 0.2, -0.05, 0.35),
    ),
  ]);

  const balanceLens = buildLens("balance_distress", [
    metric(
      "net_debt_ebitda",
      "Net debt / EBITDA",
      nonFinancial && !isReit ? netDebtEbitda : null,
      nonFinancial && !isReit ? scoreLower(netDebtEbitda, 5, 0.5) : null,
      26,
      nonFinancial && !isReit
        ? "Leverage is measured against operating cash earnings and stress-tested separately."
        : "Generic net-debt leverage is suppressed for this sector and should be replaced by sector capital rules.",
      formatMultiple(nonFinancial && !isReit ? netDebtEbitda : null),
      nonFinancial && !isReit ? signalLower(netDebtEbitda, 2, 4.5) : "missing",
    ),
    metric(
      "interest_coverage",
      "EBIT interest coverage",
      nonFinancial ? interestCoverage : null,
      nonFinancial ? scoreHigher(interestCoverage, 1, 8) : null,
      22,
      "Coverage below roughly 1.5× indicates limited protection against refinancing or operating shocks.",
      formatMultiple(nonFinancial ? interestCoverage : null),
      nonFinancial ? signalHigher(interestCoverage, 4, 1.5) : "missing",
    ),
    metric(
      "net_debt_fcf",
      "Net debt / FCF",
      nonFinancial ? netDebtFcf : null,
      nonFinancial ? scoreLower(netDebtFcf, 8, 1) : null,
      16,
      "Approximates the number of current FCF years needed to repay net debt.",
      formatMultiple(nonFinancial ? netDebtFcf : null),
      nonFinancial ? signalLower(netDebtFcf, 3, 7) : "missing",
    ),
    metric(
      "debt_change",
      "Year-on-year debt change",
      nonFinancial ? debtChange : null,
      nonFinancial ? scoreLower(debtChange, 0.2, -0.15) : null,
      14,
      "Falling debt strengthens recovery credibility; rising debt requires an explanation.",
      formatPct(nonFinancial ? debtChange : null),
      nonFinancial ? signalLower(debtChange, -0.05, 0.15) : "missing",
    ),
    metric(
      "current_ratio",
      "Current ratio",
      currentRatio ?? input.fundamentals.currentRatio,
      scoreTarget(currentRatio ?? input.fundamentals.currentRatio, 1.2, 2.5, 0.7, 5),
      10,
      "Liquidity receives supporting weight but cannot offset cash-flow or refinancing failures.",
      formatMultiple(currentRatio ?? input.fundamentals.currentRatio),
      signalTarget(currentRatio ?? input.fundamentals.currentRatio, 1.1, 3, 0.8, 5),
    ),
    metric(
      "stressed_interest_coverage",
      "Stressed interest coverage",
      nonFinancial ? stressedInterestCoverage : null,
      nonFinancial ? scoreHigher(stressedInterestCoverage, 0.8, 5) : null,
      12,
      "Assumes a 5% revenue decline and a two-percentage-point EBIT-margin contraction.",
      formatMultiple(nonFinancial ? stressedInterestCoverage : null),
      nonFinancial ? signalHigher(stressedInterestCoverage, 2.5, 1.2) : "missing",
    ),
  ]);

  const operatingLens = buildLens("operating_trajectory", [
    metric(
      "revenue_cagr",
      "Multi-year revenue CAGR",
      revenueCagr,
      scoreHigher(revenueCagr, -0.1, 0.15),
      28,
      "Growth is assessed across the full stored annual history rather than from one quarter.",
      formatPct(revenueCagr),
      signalHigher(revenueCagr, 0.07, -0.05),
    ),
    metric(
      "gross_margin_change",
      "Gross-margin change",
      grossMarginChange,
      scoreHigher(grossMarginChange, -0.05, 0.05),
      22,
      "Improving gross margins can indicate pricing power, mix improvement or easing input pressure.",
      formatBps(grossMarginChange),
      signalHigher(grossMarginChange, 0.01, -0.02),
    ),
    metric(
      "ebit_margin_change",
      "EBIT-margin change",
      ebitMarginChange,
      scoreHigher(ebitMarginChange, -0.05, 0.05),
      22,
      "Operating-margin inflection helps distinguish genuine recovery from a purely technical rebound.",
      formatBps(ebitMarginChange),
      signalHigher(ebitMarginChange, 0.01, -0.02),
    ),
    metric(
      "asset_turnover_change",
      "Asset-turnover change",
      assetTurnoverChange,
      scoreHigher(assetTurnoverChange, -0.15, 0.15),
      16,
      "Revenue generated per unit of assets is a useful check on reinvestment efficiency.",
      formatMultiple(assetTurnoverChange),
      signalHigher(assetTurnoverChange, 0.05, -0.08),
    ),
    metric(
      "operating_leverage",
      "Observed operating leverage",
      operatingLeverage,
      scoreTarget(operatingLeverage, 0.5, 3, -2, 8),
      12,
      "Very high sensitivity of EBIT to sales can make a low P/E a peak-cycle illusion.",
      formatMultiple(operatingLeverage),
      signalTarget(operatingLeverage, 0, 3.5, -2, 7),
    ),
  ]);

  const capitalLens = buildLens("capital_allocation", [
    metric(
      "net_payout_yield",
      "Net payout yield",
      netPayoutYield,
      scoreHigher(netPayoutYield, -0.03, 0.08),
      22,
      "Dividends plus repurchases less issuance, scaled by market value.",
      formatPct(netPayoutYield),
      signalHigher(netPayoutYield, 0.03, -0.02),
    ),
    metric(
      "share_count_cagr",
      "Diluted share-count CAGR",
      shareCountCagr,
      scoreLower(shareCountCagr, 0.08, -0.05),
      20,
      "Uses actual diluted shares so repurchases that merely offset compensation receive little credit.",
      formatPct(shareCountCagr),
      signalLower(shareCountCagr, -0.01, 0.05),
    ),
    metric(
      "debt_reduction_yield",
      "Debt-reduction yield",
      debtReductionYield,
      scoreHigher(debtReductionYield, 0, 0.08),
      18,
      "Debt reduction is shown separately from shareholder distributions because the economics differ.",
      formatPct(debtReductionYield),
      signalHigher(debtReductionYield, 0.025, 0),
    ),
    metric(
      "shareholder_yield",
      "Shareholder yield incl. deleveraging",
      shareholderYield,
      scoreHigher(shareholderYield, -0.03, 0.12),
      14,
      "Combines net payout with debt reduction for a broad capital-return view.",
      formatPct(shareholderYield),
      signalHigher(shareholderYield, 0.05, -0.02),
    ),
    metric(
      "stock_comp_fcf",
      "Stock compensation / FCF",
      stockCompFcf,
      scoreLower(stockCompFcf, 0.5, 0.05),
      14,
      "High stock compensation can make stated FCF overstate the cash economics reaching existing shareholders.",
      formatPct(stockCompFcf),
      signalLower(stockCompFcf, 0.15, 0.4),
    ),
    metric(
      "acquisition_intensity",
      "Acquisition spend / OCF",
      acquisitionIntensity,
      scoreLower(acquisitionIntensity, 0.8, 0),
      12,
      "Heavy acquisition dependence is penalised unless subsequent returns and margins confirm value creation.",
      formatPct(acquisitionIntensity),
      signalLower(acquisitionIntensity, 0.2, 0.6),
    ),
  ]);

  const accountingLens = buildLens("accounting_risk", [
    metric(
      "beneish_m_score",
      "Beneish M-Score",
      beneish.score,
      scoreLower(beneish.score, -1.2, -2.5),
      24,
      beneish.detail,
      formatNumber(beneish.score, 2),
      signalLower(beneish.score, -2.2, -1.78),
    ),
    metric(
      "accrual_quality",
      "Accrual quality",
      accrualRatio,
      scoreLower(accrualRatio, 0.12, -0.05),
      18,
      "High income relative to operating cash flow can signal fragile earnings quality.",
      formatPct(accrualRatio),
      signalLower(accrualRatio, 0.02, 0.1),
    ),
    metric(
      "receivables_growth_gap",
      "Receivables growth minus sales growth",
      receivablesGrowthGap,
      scoreLower(receivablesGrowthGap, 0.2, -0.05),
      16,
      "Receivables materially outgrowing sales can indicate collection pressure or aggressive recognition.",
      formatPct(receivablesGrowthGap),
      signalLower(receivablesGrowthGap, 0.03, 0.15),
    ),
    metric(
      "inventory_growth_gap",
      "Inventory growth minus sales growth",
      inventoryGrowthGap,
      scoreLower(inventoryGrowthGap, 0.25, -0.05),
      12,
      "Inventory growing faster than sales can precede markdowns, obsolescence or weaker demand.",
      formatPct(inventoryGrowthGap),
      signalLower(inventoryGrowthGap, 0.05, 0.2),
    ),
    metric(
      "goodwill_to_equity",
      "Goodwill & intangibles / equity",
      goodwillToEquity,
      scoreLower(goodwillToEquity, 1.5, 0.1),
      10,
      "A large acquired-asset balance increases impairment and acquisition-allocation risk.",
      formatPct(goodwillToEquity),
      signalLower(goodwillToEquity, 0.5, 1.2),
    ),
    metric(
      "restatement_count",
      "Stored restatement count",
      restatementCount,
      scoreLower(restatementCount, 2, 0),
      8,
      "Restatements are an investigation trigger, not automatic evidence of misconduct.",
      String(restatementCount),
      restatementCount === 0 ? "positive" : restatementCount >= 2 ? "risk" : "warning",
    ),
    metric(
      "dechow_core_proxy",
      "Dechow-style core risk proxy",
      misstatementRiskProxy,
      isNumber(misstatementRiskProxy) ? 100 - misstatementRiskProxy : null,
      12,
      "Coverage-aware proxy using accruals, soft assets, receivables divergence and external financing. It is not presented as the formal Dechow F-Score because employee, lease and complete market inputs are not consistently stored.",
      isNumber(misstatementRiskProxy) ? `${misstatementRiskProxy.toFixed(0)}/100 risk` : "—",
      isNumber(misstatementRiskProxy)
        ? misstatementRiskProxy <= 35
          ? "positive"
          : misstatementRiskProxy >= 70
            ? "risk"
            : "warning"
        : "missing",
    ),
  ]);

  const lenses = [
    valuationLens,
    cashLens,
    returnsLens,
    balanceLens,
    operatingLens,
    capitalLens,
    accountingLens,
  ];

  const rawScore = weightedAvailable(
    lenses.map((lens) => ({ value: lens.score, weight: LENS_WEIGHTS[lens.key] })),
  );
  const coverage = weightedAvailable(
    lenses.map((lens) => ({ value: lens.coverage, weight: LENS_WEIGHTS[lens.key] })),
  );

  const strengths: string[] = [];
  const warnings: string[] = [];
  const hardRisks: string[] = [];
  const dataGaps: string[] = [];

  for (const lens of lenses) {
    if (isNumber(lens.score) && lens.score >= 68 && lens.coverage >= 45) {
      strengths.push(`${lens.label}: ${lens.summary}`);
    }
    if (isNumber(lens.score) && lens.score < 38 && lens.coverage >= 45) {
      warnings.push(`${lens.label}: ${lens.summary}`);
    }
    if (lens.coverage < 35) dataGaps.push(`${lens.label} has only ${lens.coverage.toFixed(0)}% coverage.`);
  }

  if (isNumber(currentFcf) && currentFcf <= 0) warnings.push("Latest free cash flow is not positive.");
  if (isNumber(current?.operatingCashFlow) && current.operatingCashFlow <= 0) {
    warnings.push("Latest operating cash flow is not positive.");
  }
  if (isNumber(netDebtEbitda) && netDebtEbitda > 4) warnings.push(`Net debt / EBITDA is elevated at ${netDebtEbitda.toFixed(1)}×.`);
  if (isNumber(interestCoverage) && interestCoverage < 1.5) warnings.push(`EBIT interest cover is thin at ${interestCoverage.toFixed(1)}×.`);
  if (isNumber(shareCountCagr) && shareCountCagr > 0.04) warnings.push(`Diluted shares are increasing at ${formatPct(shareCountCagr)} annually.`);
  if (isNumber(beneish.score) && beneish.score > -1.78) warnings.push("Beneish indicators are elevated and require filing-level forensic review.");
  if (isNumber(receivablesGrowthGap) && receivablesGrowthGap > 0.15) warnings.push("Receivables are materially outgrowing revenue.");
  if (isNumber(inventoryGrowthGap) && inventoryGrowthGap > 0.2) warnings.push("Inventory is materially outgrowing revenue.");
  if (isNumber(reverseDcf.growth) && reverseDcf.growth > 0.25) warnings.push("The current valuation requires unusually high five-year FCFF growth.");
  if (isNumber(roicWaccSpread) && roicWaccSpread < 0) warnings.push("Modelled ROIC is below the estimated cost of capital.");
  if (isNumber(acquisitionIntensity) && acquisitionIntensity > 0.6) warnings.push("Acquisition spending consumes a large share of operating cash flow.");
  if (isNumber(stockCompFcf) && stockCompFcf > 0.4) warnings.push("Stock compensation consumes a large share of stated free cash flow.");

  if (isNumber(current?.totalEquity) && current.totalEquity <= 0) hardRisks.push("Negative book equity requires a sector-specific solvency assessment.");
  if (
    nonFinancial &&
    isNumber(netDebtEbitda) &&
    netDebtEbitda > 6 &&
    isNumber(interestCoverage) &&
    interestCoverage < 1.25
  ) {
    hardRisks.push("Extreme leverage is combined with inadequate interest coverage.");
  }
  if (
    isNumber(currentFcf) &&
    currentFcf < 0 &&
    isNumber(current?.operatingCashFlow) &&
    current.operatingCashFlow < 0 &&
    isNumber(revenueCagr) &&
    revenueCagr < 0
  ) {
    hardRisks.push("Revenue decline is combined with negative operating and free cash flow.");
  }
  if (
    isNumber(stressedInterestCoverage) &&
    stressedInterestCoverage < 0.8 &&
    isNumber(netDebt) &&
    netDebt > 0
  ) {
    hardRisks.push("A moderate operating stress would leave EBIT unable to cover interest.");
  }
  if (isNumber(shareCountChange) && shareCountChange > 0.25) hardRisks.push("Cumulative diluted-share growth exceeds 25% across the stored history.");
  if (isReit) dataGaps.push("REIT candidates still require FFO, AFFO, NAV and debt-maturity data before a high-conviction classification.");
  if (FINANCIAL_INDUSTRIES.has(input.industryCode ?? "")) {
    dataGaps.push("Financial companies use residual-income evidence, but regulatory capital, asset quality and funding-liquidity data are still required.");
  }

  const warningPenalty = Math.min(unique(warnings).length * 1.5, 12);
  let score = clamp((rawScore ?? 0) - warningPenalty);
  if (hardRisks.length) score = Math.min(score, 34);
  const finalCoverage = clamp(coverage ?? 0);
  const tier = classifyInstitutional(score, finalCoverage, hardRisks);

  const researchCases = unique([
    isNumber(expectationGap) && expectationGap >= 0.05 ? "expectations_mismatch" : null,
    isNumber(positiveFcfYears) && positiveFcfYears >= 0.75 && isNumber(fcfMargin) && fcfMargin >= 0.06
      ? "cash_compounder"
      : null,
    isNumber(debtChange) && debtChange <= -0.08 && isNumber(revenueCagr) && revenueCagr >= -0.02
      ? "deleveraging_recovery"
      : null,
    isNumber(roicWaccSpread) && roicWaccSpread >= 0.03 && (input.fundamentals.fcfYield ?? 0) >= 0.05
      ? "quality_at_value"
      : null,
    isNumber(shareholderYield) && shareholderYield >= 0.05 ? "capital_return" : null,
    isNumber(ebitMarginChange) && ebitMarginChange >= 0.01 && isNumber(revenueGrowth) && revenueGrowth >= 0
      ? "operational_inflection"
      : null,
    isNumber(beneish.score) && beneish.score > -1.78 ? "forensic_watch" : null,
  ].filter((value): value is string => Boolean(value)));

  const nextProof = unique([
    ...hardRisks.slice(0, 2).map((risk) => `Resolve hard risk: ${risk}`),
    ...warnings.slice(0, 3).map((warning) => `Test warning: ${warning}`),
    ...dataGaps.slice(0, 2).map((gap) => `Fill evidence gap: ${gap}`),
    researchCases.includes("expectations_mismatch")
      ? "Pressure-test whether management guidance and industry demand support the gap between historical and market-implied growth."
      : null,
    researchCases.includes("deleveraging_recovery")
      ? "Confirm the debt reduction is funded by recurring cash generation rather than asset sales or temporary working-capital release."
      : null,
  ].filter((value): value is string => Boolean(value)));

  return {
    assetId: input.assetId,
    industryId: input.industryId,
    industryCode: input.industryCode,
    calcVersion: INSTITUTIONAL_CALC_VERSION,
    score: round1(score),
    coverage: round1(finalCoverage),
    tier,
    peerPercentile: null,
    periodCount,
    latestPeriodEnd: current?.periodEnd ?? null,
    lenses,
    expectations: {
      enterpriseValue,
      modelledWacc: costOfCapital.wacc,
      costOfEquity: costOfCapital.costOfEquity,
      preTaxCostOfDebt: costOfCapital.preTaxCostOfDebt,
      currentFcff: fcff,
      impliedFcffGrowth5y: reverseDcf.growth,
      historicalRevenueCagr: revenueCagr,
      historicalFcfCagr: fcfCagr,
      expectationGap,
      economicProfit,
      roic,
      roicWaccSpread,
      incrementalRoic,
      sustainableGrowth,
      impliedExcessReturnYears,
      residualIncome,
      confidence: costOfCapital.confidence,
      detail: `${reverseDcf.detail} Cost of capital uses ${input.assumptions.label} assumptions and company-specific beta, leverage and observed interest cost where available.`,
    },
    strengths: unique(strengths).slice(0, 6),
    warnings: unique(warnings).slice(0, 10),
    hardRisks: unique(hardRisks),
    dataGaps: unique(dataGaps).slice(0, 10),
    nextProof: nextProof.slice(0, 8),
    researchCases,
    rawMetrics: {
      fcf: currentFcf,
      fcfMargin,
      fcfCagr,
      positiveFcfYears,
      cashConversion,
      accrualRatio,
      revenueCagr,
      revenueGrowth,
      grossMargin,
      grossMarginChange,
      ebitMargin,
      ebitMarginChange,
      grossProfitability,
      assetTurnover,
      assetTurnoverChange,
      operatingLeverage,
      roic,
      roicWaccSpread,
      incrementalRoic,
      reinvestmentRate,
      sustainableGrowth,
      economicProfit,
      enterpriseValue,
      fcff,
      impliedFcffGrowth5y: reverseDcf.growth,
      expectationGap,
      impliedExcessReturnYears,
      residualIncome,
      netDebt,
      netDebtEbitda,
      netDebtFcf,
      interestCoverage,
      stressedInterestCoverage,
      currentRatio,
      debtChange,
      debtReductionYield,
      netPayoutYield,
      buybackYield,
      shareholderYield,
      shareCountCagr,
      stockCompFcf,
      acquisitionIntensity,
      goodwillGrowth,
      receivablesGrowthGap,
      inventoryGrowthGap,
      goodwillToEquity,
      beneishMScore: beneish.score,
      misstatementRiskProxy,
    },
  };
}

export function withInstitutionalPeerContext(
  analyses: InstitutionalAnalysis[],
): InstitutionalAnalysis[] {
  const groups = new Map<string, InstitutionalAnalysis[]>();
  for (const analysis of analyses) {
    const key = analysis.industryId ?? "unmapped";
    groups.set(key, [...(groups.get(key) ?? []), analysis]);
  }
  return analyses.map((analysis) => {
    const peers = groups.get(analysis.industryId ?? "unmapped") ?? [];
    const pool = peers.length >= 5 ? peers : analyses;
    const values = pool
      .filter((item) => item.assetId !== analysis.assetId && item.coverage >= 35)
      .map((item) => item.score);
    return {
      ...analysis,
      peerPercentile: values.length >= 3 ? round1(percentileRank(analysis.score, values)) : null,
    };
  });
}

function buildLens(key: InstitutionalLensKey, specs: MetricSpec[]): InstitutionalLens {
  const totalWeight = specs.reduce((sum, item) => sum + item.weight, 0);
  const available = specs.filter((item) => isNumber(item.score));
  const availableWeight = available.reduce((sum, item) => sum + item.weight, 0);
  const score = weightedAvailable(available.map((item) => ({ value: item.score, weight: item.weight })));
  const coverage = totalWeight ? (availableWeight / totalWeight) * 100 : 0;
  const status = !isNumber(score)
    ? "missing"
    : score >= 68
      ? "positive"
      : score < 38
        ? "risk"
        : score < 50
          ? "warning"
          : "neutral";
  const strongest = available
    .filter((item) => item.signal === "positive")
    .sort((left, right) => right.weight - left.weight)[0];
  const weakest = available
    .filter((item) => item.signal === "risk" || item.signal === "warning")
    .sort((left, right) => right.weight - left.weight)[0];
  const summary = strongest
    ? strongest.detail
    : weakest
      ? weakest.detail
      : coverage < 35
        ? "Insufficient underlying data for a reliable lens score."
        : "Evidence is mixed and does not yet provide a decisive confirmation.";
  return {
    key,
    label: LENS_LABELS[key],
    score: isNumber(score) ? round1(score) : null,
    coverage: round1(coverage),
    status,
    summary,
    metrics: specs.map((item) => ({ ...item })),
  };
}

function metric(
  id: string,
  label: string,
  value: number | null,
  score: number | null,
  weight: number,
  detail: string,
  display: string,
  signal: InstitutionalSignal,
): MetricSpec {
  return { id, label, value, score, weight, detail, display, signal };
}

function classifyInstitutional(
  score: number,
  coverage: number,
  hardRisks: string[],
): InstitutionalTier {
  if (hardRisks.length) return "avoid";
  if (coverage < 30) return "insufficient";
  if (score >= 72 && coverage >= 65) return "priority";
  if (score >= 61 && coverage >= 52) return "qualified";
  if (score >= 48 && coverage >= 38) return "watch";
  return score < 38 ? "avoid" : "insufficient";
}

function estimateCostOfCapital(input: {
  marketCap: number | null;
  debt: number | null;
  beta: number | null;
  interestExpense: number | null | undefined;
  priorDebt: number | null | undefined;
  taxRate: number;
  assumptions: MarketAssumptions;
}): CostOfCapitalResult {
  const beta = isNumber(input.beta) && input.beta > 0 ? clampRange(input.beta, 0.4, 2.5) : 1;
  const costOfEquity = input.assumptions.riskFreeRate + beta * input.assumptions.equityRiskPremium;
  const averageDebt = averagePair(input.debt, input.priorDebt);
  const observedCost = ratio(absolutePositive(input.interestExpense), positive(averageDebt));
  const preTaxCostOfDebt = isNumber(observedCost) && observedCost >= 0.01 && observedCost <= 0.25
    ? observedCost
    : input.assumptions.fallbackPreTaxCostOfDebt;
  const marketCap = positive(input.marketCap);
  const debt = nonNegative(input.debt);
  if (!isNumber(marketCap) || !isNumber(debt)) {
    return {
      wacc: null,
      costOfEquity,
      preTaxCostOfDebt,
      confidence: isNumber(input.beta) ? 45 : 30,
    };
  }
  const total = marketCap + debt;
  const equityWeight = total > 0 ? marketCap / total : 1;
  const debtWeight = total > 0 ? debt / total : 0;
  const wacc =
    costOfEquity * equityWeight + preTaxCostOfDebt * (1 - input.taxRate) * debtWeight;
  let confidence = 55;
  if (isNumber(input.beta)) confidence += 15;
  if (isNumber(observedCost)) confidence += 15;
  if (isNumber(input.marketCap) && isNumber(input.debt)) confidence += 10;
  return {
    wacc: clampRange(wacc, 0.035, 0.25),
    costOfEquity,
    preTaxCostOfDebt,
    confidence: clamp(confidence),
  };
}

function solveImpliedFcffGrowth(input: {
  enterpriseValue: number | null;
  fcff: number | null;
  wacc: number | null;
  terminalGrowth: number;
  years: number;
}): { growth: number | null; detail: string } {
  if (!isNumber(input.enterpriseValue) || input.enterpriseValue <= 0) {
    return { growth: null, detail: "Reverse DCF unavailable because enterprise value is missing or non-positive." };
  }
  if (!isNumber(input.fcff) || input.fcff <= 0) {
    return { growth: null, detail: "Reverse DCF unavailable because current unlevered free cash flow is not positive." };
  }
  if (!isNumber(input.wacc) || input.wacc <= input.terminalGrowth + 0.005) {
    return { growth: null, detail: "Reverse DCF unavailable because the discount-rate spread is not economically valid." };
  }
  const low = -0.5;
  const high = 0.5;
  const lowValue = dcfValue(input.fcff, low, input.wacc, input.terminalGrowth, input.years);
  const highValue = dcfValue(input.fcff, high, input.wacc, input.terminalGrowth, input.years);
  if (input.enterpriseValue <= lowValue) {
    return { growth: low, detail: "Current enterprise value implies FCFF contraction beyond the model's -50% lower bound." };
  }
  if (input.enterpriseValue >= highValue) {
    return { growth: high, detail: "Current enterprise value implies FCFF growth beyond the model's 50% upper bound." };
  }
  let left = low;
  let right = high;
  for (let iteration = 0; iteration < 80; iteration++) {
    const mid = (left + right) / 2;
    const value = dcfValue(input.fcff, mid, input.wacc, input.terminalGrowth, input.years);
    if (value < input.enterpriseValue) left = mid;
    else right = mid;
  }
  const growth = (left + right) / 2;
  return {
    growth,
    detail: "Reverse DCF solves for the constant five-year unlevered FCF growth rate implied by current enterprise value, followed by the market terminal-growth assumption.",
  };
}

function dcfValue(
  baseFcff: number,
  growth: number,
  wacc: number,
  terminalGrowth: number,
  years: number,
): number {
  let pv = 0;
  let fcff = baseFcff;
  for (let year = 1; year <= years; year++) {
    fcff *= 1 + growth;
    pv += fcff / (1 + wacc) ** year;
  }
  const terminal = (fcff * (1 + terminalGrowth)) / (wacc - terminalGrowth);
  return pv + terminal / (1 + wacc) ** years;
}

function estimateExcessReturnDuration(
  enterpriseValue: number | null,
  investedCapital: number | null,
  economicProfit: number | null,
  wacc: number | null,
): number | null {
  if (
    !isNumber(enterpriseValue) ||
    !isNumber(investedCapital) ||
    !isNumber(economicProfit) ||
    economicProfit <= 0 ||
    !isNumber(wacc) ||
    wacc <= 0
  ) {
    return null;
  }
  const premium = enterpriseValue - investedCapital;
  if (premium <= 0) return 0;
  const perpetuity = economicProfit / wacc;
  if (premium >= perpetuity * 0.995) return 30;
  const inside = 1 - (premium * wacc) / economicProfit;
  if (inside <= 0 || inside >= 1) return null;
  return clampRange(-Math.log(inside) / Math.log(1 + wacc), 0, 30);
}

function computeResidualIncome(
  current: InstitutionalPeriod | null,
  prior: InstitutionalPeriod | null,
  costOfEquity: number | null,
): number | null {
  const equity = averagePair(current?.totalEquity, prior?.totalEquity);
  if (!isNumber(current?.netIncome) || !isNumber(equity) || !isNumber(costOfEquity)) return null;
  return current.netIncome - costOfEquity * equity;
}

function computeReinvestmentRate(
  current: InstitutionalPeriod | null,
  prior: InstitutionalPeriod | null,
  nopat: number | null,
): number | null {
  if (!current || !prior || !isNumber(nopat) || Math.abs(nopat) < 1e-9) return null;
  const capex = outflow(current.capitalExpenditure);
  const depreciation = nonNegative(current.depreciationAmortization);
  const netCapex = subtract(capex, depreciation);
  const currentNwc = subtract(current.totalCurrentAssets, current.totalCurrentLiabilities);
  const priorNwc = subtract(prior.totalCurrentAssets, prior.totalCurrentLiabilities);
  const changeNwc = subtract(currentNwc, priorNwc) ?? current.changeInWorkingCapital;
  const acquisitions = outflow(current.acquisitionsNet);
  const reinvestment = add(add(netCapex, changeNwc), acquisitions);
  return ratio(reinvestment, nopat);
}

function derivedFcff(
  current: InstitutionalPeriod | null,
  prior: InstitutionalPeriod | null,
  taxRate: number,
): number | null {
  if (!current) return null;
  const ebit = current.ebit ?? current.operatingIncome;
  if (!isNumber(ebit)) return null;
  const nopat = ebit * (1 - taxRate);
  const depreciation = nonNegative(current.depreciationAmortization) ?? 0;
  const capex = outflow(current.capitalExpenditure);
  const currentNwc = subtract(current.totalCurrentAssets, current.totalCurrentLiabilities);
  const priorNwc = subtract(prior?.totalCurrentAssets, prior?.totalCurrentLiabilities);
  const changeNwc = subtract(currentNwc, priorNwc) ?? current.changeInWorkingCapital ?? 0;
  if (!isNumber(capex)) return null;
  return nopat + depreciation - capex - changeNwc;
}

function derivedFcf(period: InstitutionalPeriod | null | undefined): number | null {
  if (!period) return null;
  if (isNumber(period.freeCashFlow)) return period.freeCashFlow;
  const capex = outflow(period.capitalExpenditure);
  if (!isNumber(period.operatingCashFlow) || !isNumber(capex)) return null;
  return period.operatingCashFlow - capex;
}

function derivedInvestedCapital(period: InstitutionalPeriod | null | undefined): number | null {
  if (!period) return null;
  const debt = nonNegative(period.totalDebt);
  const equity = period.totalEquity;
  const cash = nonNegative(period.cashAndInvestments) ?? 0;
  if (isNumber(debt) && isNumber(equity)) return debt + equity - cash;
  const operatingNwc = subtract(period.totalCurrentAssets, period.totalCurrentLiabilities);
  const acquiredAssets = add(period.goodwill, period.intangibleAssets) ?? 0;
  if (isNumber(operatingNwc) && isNumber(period.netPpe)) {
    return operatingNwc + period.netPpe + acquiredAssets;
  }
  return null;
}

function normalizedTaxRate(period: InstitutionalPeriod | null | undefined): number {
  const observed = ratio(period?.incomeTaxExpense, period?.incomeBeforeTax);
  return isNumber(observed) && observed >= 0 && observed <= 0.45 ? observed : 0.25;
}

function incrementalReturn(
  currentNopat: number | null,
  oldestNopat: number | null,
  currentCapital: number | null,
  oldestCapital: number | null,
): number | null {
  const deltaNopat = subtract(currentNopat, oldestNopat);
  const deltaCapital = subtract(currentCapital, oldestCapital);
  if (!isNumber(deltaNopat) || !isNumber(deltaCapital) || deltaCapital <= 0) return null;
  return deltaNopat / deltaCapital;
}

function degreeOfOperatingLeverage(
  current: InstitutionalPeriod | null,
  prior: InstitutionalPeriod | null,
): number | null {
  const revenueGrowth = growth(current?.revenue, prior?.revenue);
  const currentEbit = current?.ebit ?? current?.operatingIncome;
  const priorEbit = prior?.ebit ?? prior?.operatingIncome;
  const ebitGrowth = growth(currentEbit, priorEbit);
  if (!isNumber(revenueGrowth) || Math.abs(revenueGrowth) < 0.02 || !isNumber(ebitGrowth)) return null;
  return ebitGrowth / revenueGrowth;
}

function stressInterestCoverage(period: InstitutionalPeriod | null): number | null {
  if (!period) return null;
  const revenue = positive(period.revenue);
  const ebit = period.ebit ?? period.operatingIncome;
  const interest = absolutePositive(period.interestExpense);
  if (!isNumber(revenue) || !isNumber(ebit) || !isNumber(interest)) return null;
  const margin = ebit / revenue;
  const stressedRevenue = revenue * 0.95;
  const stressedEbit = stressedRevenue * (margin - 0.02);
  return stressedEbit / interest;
}

function computeBeneish(
  current: InstitutionalPeriod | null,
  prior: InstitutionalPeriod | null,
): { score: number | null; detail: string } {
  if (!current || !prior) return { score: null, detail: "Beneish M-Score requires two comparable annual periods." };
  const currentGrossMargin = ratio(current.grossProfit, current.revenue);
  const priorGrossMargin = ratio(prior.grossProfit, prior.revenue);
  const currentDepRate = ratio(
    current.depreciationAmortization,
    add(current.depreciationAmortization, current.netPpe),
  );
  const priorDepRate = ratio(
    prior.depreciationAmortization,
    add(prior.depreciationAmortization, prior.netPpe),
  );
  const dsri = ratio(ratio(current.receivables, current.revenue), ratio(prior.receivables, prior.revenue));
  const gmi = ratio(priorGrossMargin, currentGrossMargin);
  const currentAssetQuality = subtract(
    1,
    ratio(add(current.totalCurrentAssets, current.netPpe), current.totalAssets),
  );
  const priorAssetQuality = subtract(
    1,
    ratio(add(prior.totalCurrentAssets, prior.netPpe), prior.totalAssets),
  );
  const aqi = ratio(currentAssetQuality, priorAssetQuality);
  const sgi = ratio(current.revenue, prior.revenue);
  const depi = ratio(priorDepRate, currentDepRate);
  const sgai = ratio(
    ratio(current.sellingGeneralAdministrative, current.revenue),
    ratio(prior.sellingGeneralAdministrative, prior.revenue),
  );
  const currentLeverage = ratio(add(current.totalCurrentLiabilities, current.longTermDebt), current.totalAssets);
  const priorLeverage = ratio(add(prior.totalCurrentLiabilities, prior.longTermDebt), prior.totalAssets);
  const lvgi = ratio(currentLeverage, priorLeverage);
  const tata = ratio(subtract(current.netIncome, current.operatingCashFlow), current.totalAssets);
  const values = [dsri, gmi, aqi, sgi, depi, sgai, lvgi, tata];
  if (!values.every(isNumber)) {
    return {
      score: null,
      detail: "Beneish M-Score is withheld because one or more receivables, margins, asset-quality, depreciation, SG&A, leverage or accrual inputs are missing.",
    };
  }
  const [safeDsri, safeGmi, safeAqi, safeSgi, safeDepi, safeSgai, safeLvgi, safeTata] =
    values as number[];
  const score =
    -4.84 +
    0.92 * safeDsri +
    0.528 * safeGmi +
    0.404 * safeAqi +
    0.892 * safeSgi +
    0.115 * safeDepi -
    0.172 * safeSgai +
    4.679 * safeTata -
    0.327 * safeLvgi;
  return {
    score,
    detail: "Eight-variable Beneish M-Score. Values above -1.78 are treated as an elevated forensic signal, not proof of manipulation.",
  };
}

function percentileRank(value: number, peers: number[]): number {
  if (!peers.length) return 50;
  const below = peers.filter((peer) => peer < value).length;
  const equal = peers.filter((peer) => peer === value).length;
  return ((below + equal * 0.5) / peers.length) * 100;
}

function scoreHigher(value: number | null, bad: number, good: number): number | null {
  if (!isNumber(value)) return null;
  if (good === bad) return 50;
  return clamp(((value - bad) / (good - bad)) * 100);
}

function scoreLower(value: number | null, bad: number, good: number): number | null {
  if (!isNumber(value)) return null;
  if (good === bad) return 50;
  return clamp(((bad - value) / (bad - good)) * 100);
}

function scoreTarget(
  value: number | null,
  idealLow: number,
  idealHigh: number,
  outerLow: number,
  outerHigh: number,
): number | null {
  if (!isNumber(value)) return null;
  if (value >= idealLow && value <= idealHigh) return 100;
  if (value < idealLow) return clamp(((value - outerLow) / (idealLow - outerLow)) * 100);
  return clamp(((outerHigh - value) / (outerHigh - idealHigh)) * 100);
}

function signalHigher(
  value: number | null,
  positiveThreshold: number,
  riskThreshold: number,
): InstitutionalSignal {
  if (!isNumber(value)) return "missing";
  if (value >= positiveThreshold) return "positive";
  if (value <= riskThreshold) return "risk";
  return "neutral";
}

function signalLower(
  value: number | null,
  positiveThreshold: number,
  riskThreshold: number,
): InstitutionalSignal {
  if (!isNumber(value)) return "missing";
  if (value <= positiveThreshold) return "positive";
  if (value >= riskThreshold) return "risk";
  return "neutral";
}

function signalTarget(
  value: number | null,
  idealLow: number,
  idealHigh: number,
  riskLow: number,
  riskHigh: number,
): InstitutionalSignal {
  if (!isNumber(value)) return "missing";
  if (value >= idealLow && value <= idealHigh) return "positive";
  if (value <= riskLow || value >= riskHigh) return "risk";
  return "neutral";
}

function weightedAvailable(items: Array<{ value: number | null; weight: number }>): number | null {
  const available = items.filter((item): item is { value: number; weight: number } => isNumber(item.value));
  const weight = available.reduce((sum, item) => sum + item.weight, 0);
  if (!weight) return null;
  return available.reduce((sum, item) => sum + item.value * item.weight, 0) / weight;
}

function normalizedVolatility(values: number[]): number | null {
  if (values.length < 3) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const scale = Math.max(Math.abs(mean), values.reduce((sum, value) => sum + Math.abs(value), 0) / values.length, 1);
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / scale;
}

function cagr(current: number | null | undefined, oldest: number | null | undefined, years: number): number | null {
  if (!isNumber(current) || !isNumber(oldest) || current <= 0 || oldest <= 0 || years <= 0) return null;
  return (current / oldest) ** (1 / years) - 1;
}

function growth(current: number | null | undefined, prior: number | null | undefined): number | null {
  if (!isNumber(current) || !isNumber(prior) || prior === 0) return null;
  return current / prior - 1;
}

function ratio(
  numerator: number | null | undefined,
  denominator: number | null | undefined,
): number | null {
  if (!isNumber(numerator) || !isNumber(denominator) || denominator === 0) return null;
  return numerator / denominator;
}

function averagePair(
  left: number | null | undefined,
  right: number | null | undefined,
): number | null {
  if (isNumber(left) && isNumber(right)) return (left + right) / 2;
  return isNumber(left) ? left : isNumber(right) ? right : null;
}

function add(
  left: number | null | undefined,
  right: number | null | undefined,
): number | null {
  if (!isNumber(left) && !isNumber(right)) return null;
  return (isNumber(left) ? left : 0) + (isNumber(right) ? right : 0);
}

function subtract(
  left: number | null | undefined,
  right: number | null | undefined,
): number | null {
  if (!isNumber(left) || !isNumber(right)) return null;
  return left - right;
}

function negate(value: number | null | undefined): number | null {
  return isNumber(value) ? -value : null;
}

function positive(value: number | null | undefined): number | null {
  return isNumber(value) && value > 0 ? value : null;
}

function nonNegative(value: number | null | undefined): number | null {
  return isNumber(value) && value >= 0 ? value : null;
}

function absolutePositive(value: number | null | undefined): number | null {
  return isNumber(value) && value !== 0 ? Math.abs(value) : null;
}

function outflow(value: number | null | undefined): number | null {
  return isNumber(value) ? Math.abs(value) : null;
}

function inflow(value: number | null | undefined): number | null {
  return isNumber(value) ? Math.max(value, 0) : null;
}

function formatPct(value: number | null): string {
  return isNumber(value) ? `${(value * 100).toFixed(1)}%` : "—";
}

function formatBps(value: number | null): string {
  return isNumber(value) ? `${value >= 0 ? "+" : ""}${(value * 10_000).toFixed(0)} bps` : "—";
}

function formatMultiple(value: number | null): string {
  return isNumber(value) ? `${value.toFixed(2)}×` : "—";
}

function formatNumber(value: number | null, digits = 1): string {
  return isNumber(value) ? value.toFixed(digits) : "—";
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function clampRange(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
