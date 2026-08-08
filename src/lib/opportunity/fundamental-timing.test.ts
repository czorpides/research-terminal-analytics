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
    periodCount: 4,
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

test("strong cash-backed economics qualify fundamentally without using technical recovery", () => {
  const assessment = assessFundamentalOpportunity(candidate(), institutional());

  assert.equal(assessment.state, "qualified");
  assert.ok(assessment.score >= 60);
  assert.equal(
    assessment.gates.find((gate) => gate.key === "value_trap")?.state,
    "pass",
  );
  assert.equal(
    assessment.gates.find((gate) => gate.key === "catalyst")?.state,
    "pass",
  );
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

test("constructive trend and momentum can confirm timing after fundamentals qualify", () => {
  const timing = assessTechnicalTiming(candidate());

  assert.equal(timing.state, "confirmed");
  assert.equal(timing.entryReady, true);
  assert.equal(timing.invalidation, null);
});

test("financial valuation remains provisional until P/TBV and ROTCE are connected", () => {
  const assessment = assessFundamentalOpportunity(
    candidate({ industryCode: "SEC_FIN" }),
    institutional({
      researchCases: ["operational_inflection"],
      rawMetrics: {
        ...institutional().rawMetrics,
        residualIncome: 0.09,
      },
    }),
  );
  const valuation = assessment.gates.find((gate) => gate.key === "valuation");

  assert.equal(valuation?.state, "watch");
  assert.ok(valuation?.warnings.some((warning) => warning.includes("P/TBV")));
});
