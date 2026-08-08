import assert from "node:assert/strict";
import test from "node:test";

import {
  cheapnessLower,
  computeDeepValuationEvidence,
  type DeepValuationPeriod,
} from "./deep-valuation.ts";

function period(
  year: number,
  overrides: Partial<DeepValuationPeriod> = {},
): DeepValuationPeriod {
  return {
    periodEnd: `${year}-12-31`,
    revenue: 100,
    ebit: 15,
    ebitda: 20,
    depreciationAmortization: 5,
    freeCashFlow: 12,
    operatingCashFlow: 17,
    capitalExpenditure: -5,
    netIncome: 10,
    netIncomeToCommon: 10,
    totalEquity: 80,
    goodwill: 5,
    intangibleAssets: 5,
    preferredStock: 0,
    historicalMarketCap: 100,
    historicalEnterpriseValue: 120,
    historicalEvEbitda: 8,
    historicalEvRevenue: 1.5,
    historicalFcfYield: 0.06,
    ...overrides,
  };
}

test("self valuation requires at least five observed historical multiples", () => {
  assert.equal(cheapnessLower(7, [8, 9, 10, 11], 5), null);
  assert.equal(cheapnessLower(7, [6, 8, 9, 10, 11], 5), 80);
});

test("high-ROTCE financial at a reasonable tangible-book multiple is not confused with low-return cheap book", () => {
  const strong = computeDeepValuationEvidence({
    periods: [
      period(2025, { netIncomeToCommon: 18, totalEquity: 105, goodwill: 0, intangibleAssets: 0, historicalMarketCap: 120 }),
      period(2024, { totalEquity: 95, goodwill: 0, intangibleAssets: 0, historicalMarketCap: 110 }),
      period(2023, { totalEquity: 90, goodwill: 0, intangibleAssets: 0, historicalMarketCap: 100 }),
      period(2022, { totalEquity: 85, goodwill: 0, intangibleAssets: 0, historicalMarketCap: 95 }),
      period(2021, { totalEquity: 80, goodwill: 0, intangibleAssets: 0, historicalMarketCap: 90 }),
    ],
    current: { marketCap: 120, evEbitda: 8, fcfYield: 0.06 },
    currentEnterpriseValue: 140,
  });
  const weak = computeDeepValuationEvidence({
    periods: [
      period(2025, { netIncomeToCommon: 6, totalEquity: 100, goodwill: 0, intangibleAssets: 0, historicalMarketCap: 80 }),
      period(2024, { totalEquity: 100, goodwill: 0, intangibleAssets: 0, historicalMarketCap: 90 }),
      period(2023, { totalEquity: 100, goodwill: 0, intangibleAssets: 0, historicalMarketCap: 95 }),
      period(2022, { totalEquity: 100, goodwill: 0, intangibleAssets: 0, historicalMarketCap: 100 }),
      period(2021, { totalEquity: 100, goodwill: 0, intangibleAssets: 0, historicalMarketCap: 105 }),
    ],
    current: { marketCap: 80, evEbitda: 8, fcfYield: 0.06 },
    currentEnterpriseValue: 100,
  });

  assert.ok((strong.rotce ?? 0) > 0.17);
  assert.ok((strong.rotceToPtbv ?? 0) > (weak.rotceToPtbv ?? 0));
  assert.ok((weak.rotce ?? 1) < 0.08);
});

test("cyclical normalization uses the median across a full cycle rather than peak EBITDA", () => {
  const periods = [
    period(2025, { ebitda: 50, freeCashFlow: 30 }),
    period(2024, { ebitda: 45, freeCashFlow: 28 }),
    period(2023, { ebitda: 18, freeCashFlow: 10 }),
    period(2022, { ebitda: 16, freeCashFlow: 9 }),
    period(2021, { ebitda: 14, freeCashFlow: 8 }),
    period(2020, { ebitda: 12, freeCashFlow: 6 }),
    period(2019, { ebitda: 10, freeCashFlow: 5 }),
    period(2018, { ebitda: 9, freeCashFlow: 4 }),
  ];
  const result = computeDeepValuationEvidence({
    periods,
    current: { marketCap: 200, evEbitda: 4, fcfYield: 0.15 },
    currentEnterpriseValue: 220,
  });

  assert.equal(result.normalizedEbitda, 15);
  assert.ok((result.normalizedEvEbitda ?? 0) > 14);
  assert.ok((result.normalizedEvEbitda ?? 0) > 4);
  assert.equal(result.cycleHistoryYears, 8);
});
