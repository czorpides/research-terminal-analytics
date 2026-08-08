import assert from "node:assert/strict";
import test from "node:test";

import type { InstitutionalAnalysis } from "./institutional-model.ts";
import type { OpportunityCandidate } from "./workspace.functions.ts";
import {
  assessFundamentalOpportunity,
  assessTechnicalTiming,
} from "./fundamental-timing.ts";

function candidate(
  overrides: Partial<OpportunityCandidate> = {},
): OpportunityCandidate {
  return {
    industryCode: "SEC_IND",
    drawdownPct: -28,
    return12mPct: -18,
    latestEarningsSurprisePct: 4,
    evidence: {
      valuationCompression: {
        key: "valuationCompression",
        label: "Valuation",
        value: 76,
        confidence: 80,
        status: "proxy",
        detail: "test",
      },
      fundamentalResilience: {
        key: "fundamentalResilience",
        label: "Quality",
        value: 72,
        confidence: 80,
        status: "proxy",
        detail: "test",
      },
      recoveryConfirmation: {
        key: "recoveryConfirmation",
        label: "Recovery",
        value: 61,
        confidence: 85,
        status: "observed",
        detail: "test",
      },
    },
    ...overrides,
  } as OpportunityCandidate;
}

function institutional(
  overrides: Partial<InstitutionalAnalysis> = {},
): InstitutionalAnalysis {
  return {
    periodCount: 6,
    hardRisks: [],
    warnings: [],
    researchCases: ["operational_inflection"],
    rawMetrics: {
      revenueCagr: 0.06,
      revenueGrowth: 0.08,
      fcf: 120,
      fcfMargin: 0.12,
      positiveFcfYears: 1,
      roicWaccSpread: 0.06,
      incrementalRoic: 0.18,
      grossMarginChange: 0.01,
      shareCountCagr: -0.01,
      netDebtEbitda: 1.6,
      interestCoverage: 9,
      expectationGap: 0.07,
      residualIncome: 0.08,
      historicalValuationPeriods: 6,
      selfEvEbitdaPercentile: 84,
      selfFcfYieldPercentile: 82,
      selfEvRevenuePercentile: 80,
      selfPtBvPercentile: null,
      evRevenue: 4.5,
      priceToTangibleBook: null,
      rotce: null,
      normalizedEvEbitda: null,
      normalizedFcfYield: null,
    },
    lenses: [
      {
        key: "valuation_expectations",
        metrics: [
          { id: "fcf_yield", value: 0.08 },
          { id: "ev_ebitda", value: 7.5 },
        ],
      },
    ],
    ...overrides,
  } as InstitutionalAnalysis;
}

test("strong cash-backed economics qualify only when peer and own-history valuation agree", () => {
  const assessment = assessFundamentalOpportunity(candidate(), institutional());

  assert.equal(assessment.state, "qualified");
  assert.ok(assessment.score >= 60);
  assert.equal(
    assessment.gates.find((gate) => gate.key === "valuation")?.state,
    "pass",
  );
  assert.equal(
    assessment.gates.find((gate) => gate.key === "value_trap")?.state,
    "pass",
  );
  assert.equal(
    assessment.gates.find((gate) => gate.key === "catalyst")?.state,
    "pass",
  );
});

test("missing own-history valuation leaves an otherwise attractive company on watch", () => {
  const base = institutional();
  const assessment = assessFundamentalOpportunity(
    candidate(),
    institutional({
      rawMetrics: {
        ...base.rawMetrics,
        historicalValuationPeriods: 3,
        selfEvEbitdaPercentile: null,
        selfFcfYieldPercentile: null,
      },
    }),
  );

  assert.equal(assessment.state, "watch");
  assert.equal(assessment.gates.find((gate) => gate.key === "valuation")?.state, "watch");
});

test("cheapness cannot rescue a deteriorating leveraged value trap", () => {
  const assessment = assessFundamentalOpportunity(
    candidate(),
    institutional({
      researchCases: [],
      rawMetrics: {
        revenueCagr: -0.12,
        revenueGrowth: -0.15,
        fcf: -50,
        fcfMargin: -0.08,
        positiveFcfYears: 0.25,
        roicWaccSpread: -0.06,
        incrementalRoic: -0.12,
        grossMarginChange: -0.04,
        shareCountCagr: 0.12,
        netDebtEbitda: 6.2,
        interestCoverage: 1.1,
        expectationGap: 0.08,
        residualIncome: -0.08,
        historicalValuationPeriods: 6,
        selfEvEbitdaPercentile: 95,
        selfFcfYieldPercentile: 95,
      },
    }),
  );

  assert.equal(assessment.state, "risk");
  assert.equal(
    assessment.gates.find((gate) => gate.key === "value_trap")?.state,
    "fail",
  );
  assert.ok(assessment.score <= 34);
});

test("technical markdown blocks entry readiness without changing fundamental qualification", () => {
  const base = candidate({
    evidence: {
      ...candidate().evidence,
      recoveryConfirmation: {
        key: "recoveryConfirmation",
        label: "Recovery",
        value: 24,
        confidence: 85,
        status: "observed",
        detail: "test",
      },
    },
  });
  const fundamental = assessFundamentalOpportunity(base, institutional());
  const timing = assessTechnicalTiming(base);

  assert.equal(fundamental.state, "qualified");
  assert.equal(timing.state, "markdown");
  assert.equal(timing.entryReady, false);
});

test("constructive legacy trend and momentum remain a rollout fallback", () => {
  const timing = assessTechnicalTiming(candidate());

  assert.equal(timing.state, "confirmed");
  assert.equal(timing.entryReady, true);
  assert.equal(timing.invalidation, null);
  assert.ok(timing.warnings.some((warning) => warning.includes("rollout fallback")));
});

test("persisted Stage-1 confirmation returns the observed base-low invalidation", () => {
  const base = candidate() as OpportunityCandidate & {
    technicalStructure: {
      state: string;
      score: number;
      invalidation: number;
      baseLow: number;
      baseLowDate: string;
      liquiditySweep: boolean;
      chochConfirmed: boolean;
      firstHigherLow: boolean;
      ma50Reclaimed: boolean;
      ma50Retest: boolean;
    };
  };
  base.technicalStructure = {
    state: "confirmed",
    score: 78,
    invalidation: 91.5,
    baseLow: 91.5,
    baseLowDate: "2026-07-14",
    liquiditySweep: true,
    chochConfirmed: true,
    firstHigherLow: true,
    ma50Reclaimed: true,
    ma50Retest: true,
  };

  const timing = assessTechnicalTiming(base);

  assert.equal(timing.state, "confirmed");
  assert.equal(timing.entryReady, true);
  assert.equal(timing.invalidation, 91.5);
  assert.ok(timing.detail.includes("Stage-1"));
});

test("financial valuation remains provisional until P/TBV and ROTCE are connected", () => {
  const assessment = assessFundamentalOpportunity(
    candidate({ industryCode: "SEC_FIN" }),
    institutional({
      researchCases: ["operational_inflection"],
      rawMetrics: {
        ...institutional().rawMetrics,
        residualIncome: 0.09,
        selfPtBvPercentile: null,
        priceToTangibleBook: null,
        rotce: null,
      },
    }),
  );
  const valuation = assessment.gates.find((gate) => gate.key === "valuation");

  assert.equal(valuation?.state, "watch");
  assert.ok(valuation?.warnings.some((warning) => warning.includes("tangible common equity")));
});

test("financials can pass valuation when P/TBV, ROTCE, peers and own history agree", () => {
  const assessment = assessFundamentalOpportunity(
    candidate({ industryCode: "SEC_FIN" }),
    institutional({
      rawMetrics: {
        ...institutional().rawMetrics,
        priceToTangibleBook: 1.05,
        rotce: 0.15,
        selfPtBvPercentile: 82,
        residualIncome: 0.09,
      },
    }),
  );

  assert.equal(assessment.gates.find((gate) => gate.key === "valuation")?.state, "pass");
  assert.equal(assessment.gates.find((gate) => gate.key === "value_trap")?.state, "pass");
  assert.equal(assessment.state, "qualified");
});

test("cyclicals can pass only on normalized rather than peak-cycle valuation", () => {
  const assessment = assessFundamentalOpportunity(
    candidate({ industryCode: "SEC_ENE" }),
    institutional({
      rawMetrics: {
        ...institutional().rawMetrics,
        normalizedEvEbitda: 6.8,
        normalizedFcfYield: 0.075,
        selfFcfYieldPercentile: 78,
      },
    }),
  );

  assert.equal(assessment.gates.find((gate) => gate.key === "valuation")?.state, "pass");
  assert.equal(assessment.state, "qualified");
});
