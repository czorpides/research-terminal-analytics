import assert from "node:assert/strict";
import test from "node:test";

import { assessDiscoveryRoutes } from "./discovery-routes.ts";
import type { ConvictionV2Result } from "./conviction-v2.ts";
import type { InstitutionalAnalysis } from "./institutional-model.ts";
import type { OpportunityCandidate } from "./workspace.functions.ts";

const conviction = {
  score: 61,
  tier: "qualified",
  agreement: 58,
  coverage: 68,
  confirmingCount: 3,
  contradictingCount: 1,
  availableCount: 6,
  primaryCase: "quality_value",
  researchCases: ["quality_value"],
  confirmations: [],
  warnings: [],
  hardRisks: [],
  nextProof: [],
  lenses: [],
  calcVersion: "test",
} satisfies ConvictionV2Result;

function candidate(overrides: Partial<OpportunityCandidate> = {}): OpportunityCandidate {
  return {
    assetId: "asset-1",
    symbol: "TEST",
    name: "Test Software",
    exchange: "XNAS",
    currency: "USD",
    countryCode: "US",
    industryCode: "SEC_TECH",
    industryName: "Technology",
    price: 100,
    priceAsOf: "2026-07-30",
    return12mPct: -18,
    drawdownPct: -31,
    sectorAdjustedReturnPct: -15,
    sectorBreadthPct: 20,
    latestEarningsSurprisePct: 2,
    evidence: {
      priceDislocation: { key: "priceDislocation", label: "Price dislocation", value: 58, confidence: 80, status: "observed", detail: "", asOf: null, source: "" },
      fundamentalResilience: { key: "fundamentalResilience", label: "Quality", value: 72, confidence: 80, status: "proxy", detail: "", asOf: null, source: "" },
      valuationCompression: { key: "valuationCompression", label: "Valuation", value: 52, confidence: 80, status: "proxy", detail: "", asOf: null, source: "" },
      recoveryConfirmation: { key: "recoveryConfirmation", label: "Recovery", value: 45, confidence: 70, status: "observed", detail: "", asOf: null, source: "" },
      balanceSheetDurability: { key: "balanceSheetDurability", label: "Balance", value: 66, confidence: 70, status: "proxy", detail: "", asOf: null, source: "" },
      impairmentRisk: { key: "impairmentRisk", label: "Impairment", value: 32, confidence: 65, status: "proxy", detail: "", asOf: null, source: "" },
    },
    horizons: {} as OpportunityCandidate["horizons"],
    fundamentalModels: {
      piotroski: {
        state: "complete",
        score: 7,
        provisionalScore: 7,
        availableTests: 9,
        coverage: 100,
        tests: [],
        knownAt: null,
      },
      magicFormula: {
        state: "ranked",
        eligible: true,
        exclusionReason: null,
        returnOnCapital: 0.18,
        earningsYield: 0.06,
        universeRank: 120,
        universeSize: 1000,
        universePercentile: 88,
        industryRank: 8,
        industrySize: 90,
        industryPercentile: 91,
        periodEnd: null,
        knownAt: null,
      },
    },
    funnel: {} as OpportunityCandidate["funnel"],
    narrative: { summary: "", detail: "", watch: [] },
    macroControl: { status: "context_only", detail: "" },
    ...overrides,
  };
}

function institutional(overrides: Partial<InstitutionalAnalysis> = {}): InstitutionalAnalysis {
  return {
    assetId: "asset-1",
    industryId: "industry-1",
    industryCode: "SEC_TECH",
    calcVersion: "test",
    score: 72,
    coverage: 76,
    tier: "qualified",
    peerPercentile: 80,
    periodCount: 4,
    latestPeriodEnd: "2025-12-31",
    lenses: [
      { key: "cash_earnings", label: "Cash", score: 76, coverage: 90, status: "positive", summary: "", metrics: [] },
      { key: "returns_reinvestment", label: "Returns", score: 82, coverage: 80, status: "positive", summary: "", metrics: [] },
      { key: "operating_trajectory", label: "Operating", score: 78, coverage: 90, status: "positive", summary: "", metrics: [] },
      { key: "capital_allocation", label: "Capital", score: 62, coverage: 70, status: "neutral", summary: "", metrics: [] },
    ],
    expectations: {
      enterpriseValue: null,
      modelledWacc: 0.09,
      costOfEquity: 0.1,
      preTaxCostOfDebt: 0.05,
      currentFcff: null,
      impliedFcffGrowth5y: 0.07,
      historicalRevenueCagr: 0.15,
      historicalFcfCagr: 0.18,
      expectationGap: 0.08,
      economicProfit: null,
      roic: 0.22,
      roicWaccSpread: 0.13,
      incrementalRoic: 0.24,
      sustainableGrowth: 0.12,
      impliedExcessReturnYears: null,
      residualIncome: null,
      confidence: 75,
      detail: "",
    },
    strengths: [],
    warnings: [],
    hardRisks: [],
    dataGaps: [],
    nextProof: [],
    researchCases: [],
    rawMetrics: {
      revenueCagr: 0.15,
      revenueGrowth: 0.16,
      fcfMargin: 0.18,
      positiveFcfYears: 1,
      roicWaccSpread: 0.13,
      incrementalRoic: 0.24,
      expectationGap: 0.08,
      ebitMarginChange: 0.025,
      debtChange: -0.08,
      shareholderYield: 0.03,
      buybackYield: 0.02,
      shareCountCagr: -0.01,
      debtReductionYield: 0.01,
      residualIncome: 0.08,
    },
    ...overrides,
  };
}

test("quality-growth businesses can qualify without a deep-value score", () => {
  const result = assessDiscoveryRoutes({ candidate: candidate(), conviction, institutional: institutional() });
  const route = result.routes.find((item) => item.key === "quality_growth");
  assert.ok(route);
  assert.equal(route.qualifies, true);
  assert.equal(result.readiness, "ready");
});

test("financial companies receive a sector route rather than a blanket exclusion", () => {
  const financial = candidate({
    symbol: "PYPL",
    name: "PayPal Holdings",
    industryCode: "SEC_FIN",
    industryName: "Credit Services and Payments",
  });
  const result = assessDiscoveryRoutes({
    candidate: financial,
    conviction,
    institutional: institutional({ industryCode: "SEC_FIN" }),
  });
  assert.equal(result.financialModel?.kind, "payments_fintech");
  assert.ok(result.routes.some((item) => item.key === "sector_specific"));
});

test("a credible preliminary route remains emerging when statement coverage is absent", () => {
  const result = assessDiscoveryRoutes({ candidate: candidate(), conviction, institutional: null });
  assert.ok(["emerging", "coverage_gap"].includes(result.readiness));
  assert.ok(result.routeScore > 0);
});
