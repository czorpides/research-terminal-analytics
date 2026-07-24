import assert from "node:assert/strict";
import test from "node:test";

import {
  computeMagicFormulaRaw,
  computePiotroski,
  rankMagicFormula,
  type AnnualFinancialPeriod,
} from "./fundamental-models.ts";

function period(periodEnd: string, values: AnnualFinancialPeriod["values"]): AnnualFinancialPeriod {
  return {
    periodEnd,
    knownAt: `${periodEnd}T12:00:00.000Z`,
    revision: 1,
    isRestatement: false,
    values,
  };
}

const strongPeriods = [
  period("2025-12-31", {
    netIncome: 150,
    operatingCashFlow: 190,
    totalAssets: 1_000,
    longTermDebt: 120,
    currentAssets: 400,
    currentLiabilities: 180,
    sharesOutstanding: 99,
    revenue: 1_200,
    grossProfit: 600,
    ebit: 210,
    cashAndEquivalents: 100,
    totalDebt: 150,
    netFixedAssets: 350,
  }),
  period("2024-12-31", {
    netIncome: 100,
    operatingCashFlow: 120,
    totalAssets: 900,
    longTermDebt: 150,
    currentAssets: 330,
    currentLiabilities: 180,
    sharesOutstanding: 100,
    revenue: 900,
    grossProfit: 405,
    ebit: 150,
    cashAndEquivalents: 80,
    totalDebt: 180,
    netFixedAssets: 330,
  }),
  period("2023-12-31", {
    netIncome: 70,
    operatingCashFlow: 90,
    totalAssets: 850,
    longTermDebt: 170,
    currentAssets: 280,
    currentLiabilities: 175,
    sharesOutstanding: 100,
    revenue: 780,
    grossProfit: 335,
    ebit: 120,
    cashAndEquivalents: 70,
    totalDebt: 200,
    netFixedAssets: 310,
  }),
];

test("calculates all nine Piotroski tests from three annual periods", () => {
  const result = computePiotroski(strongPeriods);

  assert.equal(result.complete, true);
  assert.equal(result.availableTests, 9);
  assert.equal(result.score, 9);
  assert.equal(result.coverage, 100);
  assert.ok(result.tests.every((item) => item.passed === true));
});

test("refuses to present a formal F-Score when a test is unavailable", () => {
  const incomplete = strongPeriods.map((item, index) =>
    index === 0
      ? {
          ...item,
          values: { ...item.values, operatingCashFlow: undefined },
        }
      : item,
  );
  const result = computePiotroski(incomplete);

  assert.equal(result.complete, false);
  assert.equal(result.score, null);
  assert.equal(result.availableTests, 7);
  assert.ok(result.coverage < 100);
});

test("calculates Greenblatt ROC and EBIT-to-enterprise-value yield", () => {
  const result = computeMagicFormulaRaw({
    assetId: "alpha",
    industryId: "software",
    industryCode: "SEC_TECH",
    period: strongPeriods[0],
    marketCap: 2_000,
  });

  assert.equal(result.eligible, true);
  assert.equal(result.capitalEmployed, 570);
  assert.equal(result.enterpriseValue, 2_050);
  assert.ok(Math.abs((result.returnOnCapital ?? 0) - 210 / 570) < 1e-10);
  assert.ok(Math.abs((result.earningsYield ?? 0) - 210 / 2_050) < 1e-10);
});

test("excludes financial companies and invalid operating values", () => {
  const financial = computeMagicFormulaRaw({
    assetId: "bank",
    industryId: "financials",
    industryCode: "SEC_FIN",
    period: strongPeriods[0],
    marketCap: 2_000,
  });
  const lossMaker = computeMagicFormulaRaw({
    assetId: "loss",
    industryId: "software",
    industryCode: "SEC_TECH",
    period: {
      ...strongPeriods[0],
      values: { ...strongPeriods[0].values, ebit: -10 },
    },
    marketCap: 2_000,
  });

  assert.equal(financial.eligible, false);
  assert.match(financial.exclusionReason ?? "", /sector-specific/);
  assert.equal(lossMaker.eligible, false);
  assert.match(lossMaker.exclusionReason ?? "", /EBIT/);
});

test("ranks capital efficiency and earnings yield separately before combining them", () => {
  const raw = [
    {
      assetId: "alpha",
      industryId: "software",
      eligible: true,
      exclusionReason: null,
      returnOnCapital: 0.5,
      earningsYield: 0.08,
      enterpriseValue: 1,
      capitalEmployed: 1,
      ebit: 1,
      periodEnd: "2025-12-31",
      knownAt: "2026-02-01",
    },
    {
      assetId: "beta",
      industryId: "software",
      eligible: true,
      exclusionReason: null,
      returnOnCapital: 0.3,
      earningsYield: 0.12,
      enterpriseValue: 1,
      capitalEmployed: 1,
      ebit: 1,
      periodEnd: "2025-12-31",
      knownAt: "2026-02-01",
    },
    {
      assetId: "gamma",
      industryId: "industrial",
      eligible: true,
      exclusionReason: null,
      returnOnCapital: 0.2,
      earningsYield: 0.05,
      enterpriseValue: 1,
      capitalEmployed: 1,
      ebit: 1,
      periodEnd: "2025-12-31",
      knownAt: "2026-02-01",
    },
  ];

  const ranked = rankMagicFormula(raw);
  const alpha = ranked.find((item) => item.assetId === "alpha");
  const beta = ranked.find((item) => item.assetId === "beta");
  const gamma = ranked.find((item) => item.assetId === "gamma");

  assert.equal(alpha?.returnOnCapitalRank, 1);
  assert.equal(beta?.earningsYieldRank, 1);
  assert.equal(alpha?.universeRank, 1);
  assert.equal(beta?.universeRank, 2);
  assert.equal(gamma?.universeRank, 3);
  assert.equal(alpha?.industryRank, 1);
  assert.equal(beta?.industryRank, 2);
  assert.equal(gamma?.industryRank, 1);
});
