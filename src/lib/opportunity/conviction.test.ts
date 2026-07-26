import assert from "node:assert/strict";
import test from "node:test";

import { assessResearchConviction } from "./conviction";

const base = {
  coreScore: 64,
  researchPriority: 56,
  dataConfidence: 52,
  evidenceCoverage: 68,
  impairmentRisk: 30,
  classification: "recovery_watch" as const,
  priceDislocation: 62,
  quality: 68,
  valuation: 72,
  trend: 60,
  momentum: 58,
  recoveryConfirmation: 59,
  piotroski: {
    state: "complete" as const,
    score: 7,
    provisionalScore: 7,
    availableTests: 9,
    coverage: 100,
  },
  magicFormula: {
    state: "ranked" as const,
    universePercentile: 82,
  },
};

test("independent value, quality, Piotroski and Magic Formula evidence can create a high-conviction research candidate", () => {
  const result = assessResearchConviction(base);
  assert.equal(result.tier, "high_conviction");
  assert.ok(result.score >= 68);
  assert.ok(result.independentSignals >= 3);
  assert.ok(result.strengths.some((item) => item.includes("Piotroski")));
  assert.ok(result.strengths.some((item) => item.includes("Magic Formula")));
});

test("a credible setup with incomplete Piotroski evidence can remain qualified rather than disappearing", () => {
  const result = assessResearchConviction({
    ...base,
    coreScore: 60,
    dataConfidence: 42,
    evidenceCoverage: 55,
    priceDislocation: 48,
    trend: 50,
    momentum: 48,
    recoveryConfirmation: 49,
    piotroski: {
      state: "partial",
      score: null,
      provisionalScore: 4,
      availableTests: 6,
      coverage: 67,
    },
    magicFormula: { state: "missing", universePercentile: null },
  });
  assert.equal(result.tier, "qualified");
  assert.ok(result.nextProof.some((item) => item.includes("Piotroski")));
});

test("high impairment and weak financial health override apparent cheapness", () => {
  const result = assessResearchConviction({
    ...base,
    coreScore: 74,
    researchPriority: 70,
    impairmentRisk: 72,
    classification: "possible_value_trap",
    quality: 32,
    valuation: 90,
    piotroski: {
      state: "complete",
      score: 2,
      provisionalScore: 2,
      availableTests: 9,
      coverage: 100,
    },
  });
  assert.equal(result.tier, "avoid");
  assert.ok(result.concerns.some((item) => item.includes("impairment")));
});
