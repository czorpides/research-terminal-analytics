import assert from "node:assert/strict";
import test from "node:test";

import {
  computeAdvancedValuation,
  type HistoricalValuationPoint,
} from "./advanced-valuation.ts";
import type {
  InstitutionalFundamentals,
  InstitutionalPeriod,
} from "./institutional-model.ts";

function period(
  year: number,
  overrides: Partial<InstitutionalPeriod> = {},
): InstitutionalPeriod {
  return {
    periodEnd: `${year}-12-31`,
    knownAt: `${year + 1}-02-15T00:00:00Z`,
    isRestatement: false,
    revenue: 1_000,
    costOfRevenue: 600,
    grossProfit: 400,
    operatingIncome: 180,
    ebit: 180,
    ebitda: 200,
    interestExpense: 20,
    incomeBeforeTax: 160,
    incomeTaxExpense: 32,
    netIncome: 120,
    dilutedShares: 100,
    totalAssets: 2_000,
    totalCurrentAssets: 700,
    totalCurrentLiabilities: 450,
    cashAndInvestments: 100,
    totalDebt: 200,
    shortTermDebt: 40,
    longTermDebt: 160,
    totalEquity: 1_000,
    totalLiabilities: 1_000,
    receivables: 180,
    inventory: 120,
    accountsPayable: 140,
    netPpe: 700,
    goodwill: 100,
    intangibleAssets: 50,
    operatingCashFlow: 150,
    capitalExpenditure: -70,
    freeCashFlow: 80,
    depreciationAmortization: 20,
    dividendsPaid: -20,
    commonStockRepurchased: -10,
    commonStockIssued: 0,
    stockBasedCompensation: 5,
    acquisitionsNet: 0,
    debtRepayment: -20,
    debtIssuance: 0,
    changeInWorkingCapital: -5,
    sellingGeneralAdministrative: 150,
    ...overrides,
  };
}

function fundamentals(overrides: Partial<InstitutionalFundamentals> = {}): InstitutionalFundamentals {
  return {
    marketCap: 900,
    beta: 1,
    fcfYield: 0.09,
    roic: 0.15,
    pe: 10,
    pb: 1.1,
    evEbitda: 5.5,
    currentRatio: 1.5,
    debtEquity: 0.2,
    asOf: "2026-08-08T00:00:00Z",
    ...overrides,
  };
}

function history(values: Partial<HistoricalValuationPoint>[]): HistoricalValuationPoint[] {
  return values.map((value, index) => ({
    assetId: "asset-1",
    periodEnd: `${2025 - index}-12-31`,
    priceDate: `${2025 - index}-12-31`,
    marketCap: 1_000,
    evEbitda: 8 + index * 0.5,
    fcfYield: 0.04 + index * 0.005,
    evRevenue: 2.5 + index * 0.2,
    ptbv: 1.6 + index * 0.1,
    ...value,
  }));
}

test("observed own-history percentiles reward current multiples below their five-year range", () => {
  const result = computeAdvancedValuation({
    industryCode: "SEC_IND",
    periods: [period(2025), period(2024), period(2023), period(2022), period(2021), period(2020)],
    fundamentals: fundamentals(),
    history: history([{}, {}, {}, {}, {}, {}]),
  });

  assert.equal(result.metrics.historicalValuationPeriods, 6);
  assert.equal(result.metrics.selfEvEbitdaPercentile, 100);
  assert.equal(result.metrics.selfFcfYieldPercentile, 100);
  assert.ok((result.metrics.historicalEvEbitdaMedian ?? 0) > 8);
});

test("financials calculate P/TBV and ROTCE from tangible common equity rather than generic leverage", () => {
  const result = computeAdvancedValuation({
    industryCode: "SEC_FIN",
    periods: [
      period(2025, { totalEquity: 1_000, goodwill: 100, intangibleAssets: 50, netIncome: 120 }),
      period(2024, { totalEquity: 900, goodwill: 90, intangibleAssets: 40, netIncome: 105 }),
      period(2023),
      period(2022),
      period(2021),
      period(2020),
    ],
    fundamentals: fundamentals({ marketCap: 900 }),
    history: history([{}, {}, {}, {}, {}, {}]),
  });

  assert.ok(Math.abs((result.metrics.priceToTangibleBook ?? 0) - 900 / 850) < 0.001);
  assert.ok((result.metrics.rotce ?? 0) > 0.14);
  assert.equal(result.metrics.selfPtBvPercentile, 100);
});

test("cyclicals normalize valuation using the median multi-year EBITDA and FCF margins", () => {
  const periods = [
    period(2025, { revenue: 1_000, ebitda: 320, freeCashFlow: 160 }),
    period(2024, { revenue: 900, ebitda: 180, freeCashFlow: 72 }),
    period(2023, { revenue: 850, ebitda: 127.5, freeCashFlow: 51 }),
    period(2022, { revenue: 800, ebitda: 200, freeCashFlow: 80 }),
    period(2021, { revenue: 780, ebitda: 156, freeCashFlow: 62.4 }),
    period(2020, { revenue: 760, ebitda: 76, freeCashFlow: 30.4 }),
  ];
  const result = computeAdvancedValuation({
    industryCode: "SEC_ENE",
    periods,
    fundamentals: fundamentals({ marketCap: 1_000 }),
    history: history([{}, {}, {}, {}, {}, {}]),
  });

  assert.ok((result.metrics.normalizedEbitdaMargin ?? 0) > 0.17);
  assert.ok((result.metrics.normalizedEbitdaMargin ?? 0) < 0.23);
  assert.ok((result.metrics.normalizedEvEbitda ?? 99) < 7);
  assert.ok((result.metrics.normalizedFcfYield ?? 0) > 0.06);
});

test("fewer than five observed history points stays explicit instead of manufacturing a percentile", () => {
  const result = computeAdvancedValuation({
    industryCode: "SEC_IND",
    periods: [period(2025), period(2024), period(2023)],
    fundamentals: fundamentals(),
    history: history([{}, {}, {}]),
  });

  assert.equal(result.metrics.selfEvEbitdaPercentile, null);
  assert.ok(result.dataGaps.some((gap) => gap.includes("at least 5")));
});
