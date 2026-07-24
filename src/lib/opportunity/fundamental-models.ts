export const PIOTROSKI_CALC_VERSION = "opportunity.piotroski.v0.1";
export const MAGIC_FORMULA_CALC_VERSION = "opportunity.magic-formula.v0.1";

export const STATEMENT_METRICS = {
  netIncome: "STMT_NET_INCOME",
  operatingCashFlow: "STMT_OPERATING_CASH_FLOW",
  totalAssets: "STMT_TOTAL_ASSETS",
  longTermDebt: "STMT_LONG_TERM_DEBT",
  currentAssets: "STMT_CURRENT_ASSETS",
  currentLiabilities: "STMT_CURRENT_LIABILITIES",
  sharesOutstanding: "STMT_WEIGHTED_AVG_SHARES",
  revenue: "STMT_REVENUE",
  grossProfit: "STMT_GROSS_PROFIT",
  ebit: "STMT_EBIT",
  cashAndEquivalents: "STMT_CASH_AND_EQUIVALENTS",
  totalDebt: "STMT_TOTAL_DEBT",
  netFixedAssets: "STMT_NET_PROPERTY_PLANT_EQUIPMENT",
} as const;

export type StatementMetricKey = keyof typeof STATEMENT_METRICS;
export type StatementMetricCode = (typeof STATEMENT_METRICS)[StatementMetricKey];

export interface AnnualFinancialPeriod {
  periodEnd: string;
  knownAt: string;
  revision: number;
  isRestatement: boolean;
  values: Partial<Record<StatementMetricKey, number>>;
}

export type PiotroskiTestKey =
  | "positiveNetIncome"
  | "positiveOperatingCashFlow"
  | "higherReturnOnAssets"
  | "cashFlowExceedsNetIncome"
  | "lowerLongTermDebtToAssets"
  | "higherCurrentRatio"
  | "noNewShares"
  | "higherGrossMargin"
  | "higherAssetTurnover";

export interface PiotroskiTest {
  key: PiotroskiTestKey;
  label: string;
  passed: boolean | null;
  currentValue: number | null;
  priorValue: number | null;
  detail: string;
}

export interface PiotroskiResult {
  score: number | null;
  provisionalScore: number;
  availableTests: number;
  coverage: number;
  complete: boolean;
  tests: PiotroskiTest[];
  currentPeriodEnd: string | null;
  priorPeriodEnd: string | null;
  knownAt: string | null;
  calcVersion: string;
}

export interface MagicFormulaRawInput {
  assetId: string;
  industryId: string | null;
  industryCode: string | null;
  period: AnnualFinancialPeriod | null;
  marketCap: number | null;
}

export interface MagicFormulaRawResult {
  assetId: string;
  industryId: string | null;
  eligible: boolean;
  exclusionReason: string | null;
  returnOnCapital: number | null;
  earningsYield: number | null;
  enterpriseValue: number | null;
  capitalEmployed: number | null;
  ebit: number | null;
  periodEnd: string | null;
  knownAt: string | null;
}

export interface MagicFormulaRank extends MagicFormulaRawResult {
  returnOnCapitalRank: number | null;
  earningsYieldRank: number | null;
  combinedRankScore: number | null;
  universeRank: number | null;
  universeSize: number;
  universePercentile: number | null;
  industryRank: number | null;
  industrySize: number;
  industryPercentile: number | null;
  calcVersion: string;
}

const PIOTROSKI_LABELS: Record<PiotroskiTestKey, string> = {
  positiveNetIncome: "Positive net income",
  positiveOperatingCashFlow: "Positive operating cash flow",
  higherReturnOnAssets: "Higher return on assets",
  cashFlowExceedsNetIncome: "Operating cash flow exceeds net income",
  lowerLongTermDebtToAssets: "Lower long-term debt to assets",
  higherCurrentRatio: "Higher current ratio",
  noNewShares: "No increase in shares outstanding",
  higherGrossMargin: "Higher gross margin",
  higherAssetTurnover: "Higher asset turnover",
};

const MAGIC_FORMULA_EXCLUDED_INDUSTRIES = new Set(["SEC_FIN", "SEC_RE", "SEC_UTL"]);

/**
 * Calculate the nine Piotroski tests from three consecutive annual periods.
 *
 * The third period is required because prior-year ROA and asset turnover need
 * a beginning asset balance. A formal 0–9 score is returned only when all nine
 * tests are available. Partial evidence remains visible as a provisional score
 * and coverage percentage, but cannot be treated as a complete F-Score.
 */
export function computePiotroski(periods: AnnualFinancialPeriod[]): PiotroskiResult {
  const sorted = [...periods].sort((left, right) => right.periodEnd.localeCompare(left.periodEnd));
  const current = sorted[0] ?? null;
  const prior = sorted[1] ?? null;
  const priorPrior = sorted[2] ?? null;

  const currentRoa = ratio(current?.values.netIncome, prior?.values.totalAssets);
  const priorRoa = ratio(prior?.values.netIncome, priorPrior?.values.totalAssets);
  const currentLeverage = ratio(current?.values.longTermDebt, current?.values.totalAssets);
  const priorLeverage = ratio(prior?.values.longTermDebt, prior?.values.totalAssets);
  const currentRatio = ratio(current?.values.currentAssets, current?.values.currentLiabilities);
  const priorCurrentRatio = ratio(prior?.values.currentAssets, prior?.values.currentLiabilities);
  const currentGrossMargin = ratio(current?.values.grossProfit, current?.values.revenue);
  const priorGrossMargin = ratio(prior?.values.grossProfit, prior?.values.revenue);
  const currentAssetTurnover = ratio(
    current?.values.revenue,
    averagePair(current?.values.totalAssets, prior?.values.totalAssets),
  );
  const priorAssetTurnover = ratio(
    prior?.values.revenue,
    averagePair(prior?.values.totalAssets, priorPrior?.values.totalAssets),
  );

  const tests: PiotroskiTest[] = [
    test(
      "positiveNetIncome",
      current?.values.netIncome,
      null,
      unary(current?.values.netIncome, (value) => value > 0),
      "Latest annual net income must be positive.",
    ),
    test(
      "positiveOperatingCashFlow",
      current?.values.operatingCashFlow,
      null,
      unary(current?.values.operatingCashFlow, (value) => value > 0),
      "Latest annual operating cash flow must be positive.",
    ),
    test(
      "higherReturnOnAssets",
      currentRoa,
      priorRoa,
      compare(currentRoa, priorRoa, (left, right) => left > right),
      "ROA uses net income divided by beginning total assets for both years.",
    ),
    test(
      "cashFlowExceedsNetIncome",
      current?.values.operatingCashFlow,
      current?.values.netIncome,
      compare(
        current?.values.operatingCashFlow,
        current?.values.netIncome,
        (left, right) => left > right,
      ),
      "Positive accrual quality requires operating cash flow above net income.",
    ),
    test(
      "lowerLongTermDebtToAssets",
      currentLeverage,
      priorLeverage,
      compare(currentLeverage, priorLeverage, (left, right) => left < right),
      "Long-term debt divided by total assets must fall year on year.",
    ),
    test(
      "higherCurrentRatio",
      currentRatio,
      priorCurrentRatio,
      compare(currentRatio, priorCurrentRatio, (left, right) => left > right),
      "Current assets divided by current liabilities must rise year on year.",
    ),
    test(
      "noNewShares",
      current?.values.sharesOutstanding,
      prior?.values.sharesOutstanding,
      compare(
        current?.values.sharesOutstanding,
        prior?.values.sharesOutstanding,
        (left, right) => left <= right,
      ),
      "Split-adjusted weighted average shares must not increase year on year.",
    ),
    test(
      "higherGrossMargin",
      currentGrossMargin,
      priorGrossMargin,
      compare(currentGrossMargin, priorGrossMargin, (left, right) => left > right),
      "Gross profit divided by revenue must rise year on year.",
    ),
    test(
      "higherAssetTurnover",
      currentAssetTurnover,
      priorAssetTurnover,
      compare(currentAssetTurnover, priorAssetTurnover, (left, right) => left > right),
      "Revenue divided by average total assets must rise year on year.",
    ),
  ];

  const availableTests = tests.filter((item) => item.passed !== null).length;
  const provisionalScore = tests.filter((item) => item.passed === true).length;
  const complete = availableTests === tests.length;

  return {
    score: complete ? provisionalScore : null,
    provisionalScore,
    availableTests,
    coverage: round1((availableTests / tests.length) * 100),
    complete,
    tests,
    currentPeriodEnd: current?.periodEnd ?? null,
    priorPeriodEnd: prior?.periodEnd ?? null,
    knownAt: current?.knownAt ?? null,
    calcVersion: PIOTROSKI_CALC_VERSION,
  };
}

/**
 * Greenblatt-style operating return and earnings yield.
 *
 * ROC = EBIT / (net working capital + net fixed assets)
 * Earnings yield = EBIT / enterprise value
 */
export function computeMagicFormulaRaw(input: MagicFormulaRawInput): MagicFormulaRawResult {
  const period = input.period;
  const excluded = input.industryCode
    ? MAGIC_FORMULA_EXCLUDED_INDUSTRIES.has(input.industryCode)
    : false;
  if (excluded) {
    return magicIneligible(input, "Financials, REITs and utilities require sector-specific rules.");
  }
  if (!period) return magicIneligible(input, "No annual point-in-time statement is available.");

  const ebit = finite(period.values.ebit);
  const currentAssets = finite(period.values.currentAssets);
  const currentLiabilities = finite(period.values.currentLiabilities);
  const netFixedAssets = finite(period.values.netFixedAssets);
  const totalDebt = finite(period.values.totalDebt);
  const cash = finite(period.values.cashAndEquivalents);
  const marketCap = finite(input.marketCap);

  if (
    ebit === null ||
    currentAssets === null ||
    currentLiabilities === null ||
    netFixedAssets === null ||
    totalDebt === null ||
    cash === null ||
    marketCap === null
  ) {
    return magicIneligible(
      input,
      "One or more EBIT, enterprise-value or capital inputs are missing.",
    );
  }

  const capitalEmployed = currentAssets - currentLiabilities + netFixedAssets;
  const enterpriseValue = marketCap + totalDebt - cash;
  if (ebit <= 0) return magicIneligible(input, "EBIT is not positive.");
  if (capitalEmployed <= 0) {
    return magicIneligible(input, "Net working capital plus net fixed assets is not positive.");
  }
  if (enterpriseValue <= 0) return magicIneligible(input, "Enterprise value is not positive.");

  return {
    assetId: input.assetId,
    industryId: input.industryId,
    eligible: true,
    exclusionReason: null,
    returnOnCapital: ebit / capitalEmployed,
    earningsYield: ebit / enterpriseValue,
    enterpriseValue,
    capitalEmployed,
    ebit,
    periodEnd: period.periodEnd,
    knownAt: period.knownAt,
  };
}

export function rankMagicFormula(results: MagicFormulaRawResult[]): MagicFormulaRank[] {
  const eligible = results.filter(
    (
      result,
    ): result is MagicFormulaRawResult & {
      returnOnCapital: number;
      earningsYield: number;
    } =>
      result.eligible &&
      result.returnOnCapital !== null &&
      result.earningsYield !== null &&
      Number.isFinite(result.returnOnCapital) &&
      Number.isFinite(result.earningsYield),
  );
  const rocRanks = descendingRanks(eligible, (item) => item.returnOnCapital);
  const yieldRanks = descendingRanks(eligible, (item) => item.earningsYield);
  const combined = eligible
    .map((item) => ({
      assetId: item.assetId,
      score:
        (rocRanks.get(item.assetId) ?? eligible.length) +
        (yieldRanks.get(item.assetId) ?? eligible.length),
    }))
    .sort((left, right) => left.score - right.score || left.assetId.localeCompare(right.assetId));
  const universeRanks = ordinalRanks(combined.map((item) => item.assetId));

  const byIndustry = new Map<string, typeof eligible>();
  for (const item of eligible) {
    const industryKey = item.industryId ?? "unmapped";
    byIndustry.set(industryKey, [...(byIndustry.get(industryKey) ?? []), item]);
  }
  const industryRankings = new Map<string, { rank: number; size: number; percentile: number }>();
  for (const members of byIndustry.values()) {
    const industryRocRanks = descendingRanks(members, (item) => item.returnOnCapital);
    const industryYieldRanks = descendingRanks(members, (item) => item.earningsYield);
    const sorted = members
      .map((member) => ({
        assetId: member.assetId,
        score:
          (industryRocRanks.get(member.assetId) ?? members.length) +
          (industryYieldRanks.get(member.assetId) ?? members.length),
      }))
      .sort((left, right) => left.score - right.score || left.assetId.localeCompare(right.assetId));
    sorted.forEach((item, index) => {
      industryRankings.set(item.assetId, {
        rank: index + 1,
        size: sorted.length,
        percentile: percentile(index + 1, sorted.length),
      });
    });
  }

  return results.map((result) => {
    const universeRank = universeRanks.get(result.assetId) ?? null;
    const industry = industryRankings.get(result.assetId);
    return {
      ...result,
      returnOnCapitalRank: rocRanks.get(result.assetId) ?? null,
      earningsYieldRank: yieldRanks.get(result.assetId) ?? null,
      combinedRankScore:
        result.eligible && rocRanks.has(result.assetId) && yieldRanks.has(result.assetId)
          ? (rocRanks.get(result.assetId) ?? 0) + (yieldRanks.get(result.assetId) ?? 0)
          : null,
      universeRank,
      universeSize: eligible.length,
      universePercentile: universeRank === null ? null : percentile(universeRank, eligible.length),
      industryRank: industry?.rank ?? null,
      industrySize: industry?.size ?? 0,
      industryPercentile: industry?.percentile ?? null,
      calcVersion: MAGIC_FORMULA_CALC_VERSION,
    };
  });
}

function test(
  key: PiotroskiTestKey,
  currentValue: number | undefined | null,
  priorValue: number | undefined | null,
  passed: boolean | null,
  detail: string,
): PiotroskiTest {
  return {
    key,
    label: PIOTROSKI_LABELS[key],
    passed,
    currentValue: finite(currentValue),
    priorValue: finite(priorValue),
    detail,
  };
}

function unary(
  value: number | undefined | null,
  predicate: (value: number) => boolean,
): boolean | null {
  const parsed = finite(value);
  return parsed === null ? null : predicate(parsed);
}

function compare(
  left: number | undefined | null,
  right: number | undefined | null,
  predicate: (left: number, right: number) => boolean,
): boolean | null {
  const parsedLeft = finite(left);
  const parsedRight = finite(right);
  return parsedLeft === null || parsedRight === null ? null : predicate(parsedLeft, parsedRight);
}

function ratio(
  numerator: number | undefined | null,
  denominator: number | undefined | null,
): number | null {
  const parsedNumerator = finite(numerator);
  const parsedDenominator = finite(denominator);
  if (parsedNumerator === null || parsedDenominator === null || parsedDenominator === 0)
    return null;
  return parsedNumerator / parsedDenominator;
}

function averagePair(
  left: number | undefined | null,
  right: number | undefined | null,
): number | null {
  const parsedLeft = finite(left);
  const parsedRight = finite(right);
  if (parsedLeft === null || parsedRight === null) return null;
  return (parsedLeft + parsedRight) / 2;
}

function magicIneligible(
  input: MagicFormulaRawInput,
  exclusionReason: string,
): MagicFormulaRawResult {
  return {
    assetId: input.assetId,
    industryId: input.industryId,
    eligible: false,
    exclusionReason,
    returnOnCapital: null,
    earningsYield: null,
    enterpriseValue: null,
    capitalEmployed: null,
    ebit: input.period ? finite(input.period.values.ebit) : null,
    periodEnd: input.period?.periodEnd ?? null,
    knownAt: input.period?.knownAt ?? null,
  };
}

function descendingRanks<T extends { assetId: string }>(
  values: T[],
  selector: (value: T) => number,
): Map<string, number> {
  const sorted = [...values].sort(
    (left, right) => selector(right) - selector(left) || left.assetId.localeCompare(right.assetId),
  );
  return ordinalRanks(sorted.map((item) => item.assetId));
}

function ordinalRanks(assetIds: string[]): Map<string, number> {
  return new Map(assetIds.map((assetId, index) => [assetId, index + 1]));
}

function percentile(rank: number, size: number): number {
  if (size <= 0) return 0;
  return round1(((size - rank + 1) / size) * 100);
}

function finite(value: number | undefined | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
