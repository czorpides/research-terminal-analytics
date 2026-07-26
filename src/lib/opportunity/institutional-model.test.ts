import assert from "node:assert/strict";
import test from "node:test";

import {
  computeInstitutionalAnalysis,
  type InstitutionalModelInput,
  type InstitutionalPeriod,
} from "./institutional-model.ts";

const assumptions = {
  riskFreeRate: 0.04,
  equityRiskPremium: 0.05,
  terminalGrowthRate: 0.02,
  fallbackPreTaxCostOfDebt: 0.065,
  label: "test market",
};

const fundamentals = {
  marketCap: 1_200,
  beta: 1,
  fcfYield: 0.09,
  roic: 0.16,
  pe: 10,
  pb: 1.8,
  evEbitda: 7,
  currentRatio: 1.6,
  debtEquity: 0.45,
  asOf: "2026-01-01",
};

function period(
  periodEnd: string,
  overrides: Partial<InstitutionalPeriod> = {},
): InstitutionalPeriod {
  return {
    periodEnd,
    knownAt: `${periodEnd}T00:00:00Z`,
    isRestatement: false,
    revenue: 1_000,
    costOfRevenue: 600,
    grossProfit: 400,
    operatingIncome: 150,
    ebit: 150,
    ebitda: 190,
    interestExpense: 20,
    incomeBeforeTax: 130,
    incomeTaxExpense: 26,
    netIncome: 104,
    dilutedShares: 100,
    totalAssets: 1_100,
    totalCurrentAssets: 420,
    totalCurrentLiabilities: 230,
    cashAndInvestments: 180,
    totalDebt: 360,
    shortTermDebt: 40,
    longTermDebt: 320,
    totalEquity: 520,
    totalLiabilities: 580,
    receivables: 140,
    inventory: 100,
    accountsPayable: 90,
    netPpe: 430,
    goodwill: 80,
    intangibleAssets: 40,
    operatingCashFlow: 155,
    capitalExpenditure: -50,
    freeCashFlow: 105,
    depreciationAmortization: 40,
    dividendsPaid: -20,
    commonStockRepurchased: -35,
    commonStockIssued: 0,
    stockBasedCompensation: 8,
    acquisitionsNet: -5,
    debtRepayment: -45,
    debtIssuance: 0,
    changeInWorkingCapital: -5,
    sellingGeneralAdministrative: 150,
    ...overrides,
  };
}

function input(periods: InstitutionalPeriod[]): InstitutionalModelInput {
  return {
    assetId: "asset-1",
    industryId: "industry-1",
    industryCode: "SEC_IND",
    currency: "USD",
    periods,
    fundamentals,
    assumptions,
  };
}

test("cash-backed growth and deleveraging produce a researchable institutional candidate", () => {
  const result = computeInstitutionalAnalysis(
    input([
      period("2025-12-31", {
        revenue: 1_250,
        grossProfit: 525,
        ebit: 205,
        operatingIncome: 205,
        ebitda: 250,
        netIncome: 145,
        operatingCashFlow: 220,
        freeCashFlow: 155,
        totalAssets: 1_180,
        totalDebt: 260,
        cashAndInvestments: 210,
        totalEquity: 610,
        receivables: 150,
        inventory: 105,
        dilutedShares: 96,
      }),
      period("2024-12-31", {
        revenue: 1_120,
        grossProfit: 459,
        ebit: 175,
        operatingIncome: 175,
        ebitda: 215,
        netIncome: 120,
        operatingCashFlow: 185,
        freeCashFlow: 130,
        totalAssets: 1_140,
        totalDebt: 320,
        cashAndInvestments: 195,
        totalEquity: 565,
        dilutedShares: 98,
      }),
      period("2023-12-31", {
        revenue: 1_000,
        grossProfit: 400,
        ebit: 145,
        operatingIncome: 145,
        ebitda: 185,
        netIncome: 98,
        operatingCashFlow: 150,
        freeCashFlow: 100,
        totalAssets: 1_100,
        totalDebt: 390,
        cashAndInvestments: 175,
        totalEquity: 515,
        dilutedShares: 100,
      }),
    ]),
  );

  assert.ok(["priority", "qualified", "watch"].includes(result.tier));
  assert.ok(result.score >= 55);
  assert.ok((result.rawMetrics.roicWaccSpread ?? -1) > 0);
  assert.ok((result.rawMetrics.debtChange ?? 1) < 0);
  assert.ok(result.hardRisks.length === 0);
  assert.ok(result.researchCases.includes("deleveraging_recovery"));
});

test("a low-multiple company with cash burn and refinancing risk is classified as avoid", () => {
  const result = computeInstitutionalAnalysis({
    ...input([
      period("2025-12-31", {
        revenue: 650,
        grossProfit: 130,
        ebit: 25,
        operatingIncome: 25,
        ebitda: 45,
        interestExpense: 40,
        netIncome: -45,
        operatingCashFlow: -20,
        freeCashFlow: -70,
        totalDebt: 420,
        cashAndInvestments: 30,
        totalEquity: 120,
        receivables: 170,
        inventory: 190,
        dilutedShares: 135,
      }),
      period("2024-12-31", {
        revenue: 780,
        grossProfit: 195,
        ebit: 60,
        operatingIncome: 60,
        ebitda: 80,
        interestExpense: 32,
        netIncome: 5,
        operatingCashFlow: 25,
        freeCashFlow: -15,
        totalDebt: 360,
        cashAndInvestments: 45,
        totalEquity: 180,
        receivables: 140,
        inventory: 145,
        dilutedShares: 110,
      }),
      period("2023-12-31", {
        revenue: 900,
        grossProfit: 270,
        ebit: 100,
        operatingIncome: 100,
        ebitda: 120,
        interestExpense: 25,
        netIncome: 40,
        operatingCashFlow: 70,
        freeCashFlow: 20,
        totalDebt: 300,
        cashAndInvestments: 60,
        totalEquity: 230,
        receivables: 120,
        inventory: 115,
        dilutedShares: 100,
      }),
    ]),
    fundamentals: {
      ...fundamentals,
      marketCap: 300,
      fcfYield: -0.2,
      pe: 5,
      evEbitda: 6,
    },
  });

  assert.equal(result.tier, "avoid");
  assert.ok(result.hardRisks.length > 0);
  assert.ok((result.rawMetrics.netDebtEbitda ?? 0) > 6);
  assert.ok(result.score <= 34);
});

test("reverse DCF exposes when the market embeds modest expectations", () => {
  const result = computeInstitutionalAnalysis(
    input([
      period("2025-12-31", { revenue: 1_180, freeCashFlow: 145, operatingCashFlow: 200, ebit: 190 }),
      period("2024-12-31", { revenue: 1_090, freeCashFlow: 125, operatingCashFlow: 180, ebit: 170 }),
      period("2023-12-31", { revenue: 1_000, freeCashFlow: 105, operatingCashFlow: 155, ebit: 150 }),
    ]),
  );

  assert.notEqual(result.expectations.impliedFcffGrowth5y, null);
  assert.ok((result.expectations.modelledWacc ?? 0) > assumptions.terminalGrowthRate);
  assert.ok(result.lenses.some((lens) => lens.key === "valuation_expectations"));
});

test("elevated forensic indicators remain warnings rather than allegations", () => {
  const result = computeInstitutionalAnalysis(
    input([
      period("2025-12-31", {
        revenue: 1_300,
        grossProfit: 390,
        receivables: 310,
        inventory: 180,
        netIncome: 155,
        operatingCashFlow: 55,
        totalAssets: 1_300,
        totalCurrentAssets: 500,
        netPpe: 360,
        depreciationAmortization: 20,
        sellingGeneralAdministrative: 250,
      }),
      period("2024-12-31", {
        revenue: 1_000,
        grossProfit: 400,
        receivables: 120,
        inventory: 100,
        netIncome: 100,
        operatingCashFlow: 120,
        totalAssets: 1_050,
        totalCurrentAssets: 410,
        netPpe: 420,
        depreciationAmortization: 42,
        sellingGeneralAdministrative: 150,
      }),
    ]),
  );

  assert.ok(result.warnings.some((warning) => warning.includes("Beneish") || warning.includes("Receivables")));
  assert.ok(result.lenses.find((lens) => lens.key === "accounting_risk"));
  assert.ok(result.hardRisks.every((risk) => !risk.toLowerCase().includes("manipulation")));
});
