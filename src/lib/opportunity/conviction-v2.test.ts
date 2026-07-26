import assert from "node:assert/strict";
import test from "node:test";

import { computeResearchConvictionV2 } from "./conviction-v2";

const base = {
  valuation: 68,
  quality: 64,
  priceDislocation: 58,
  recoveryConfirmation: 48,
  balanceSheetDurability: 61,
  impairmentRisk: 34,
  dataConfidence: 52,
  sectorModelBlocked: false,
  piotroski: {
    state: "complete" as const,
    score: 6,
    provisionalScore: 6,
    availableTests: 9,
    coverage: 100,
    tests: [
      { key: "positiveNetIncome", label: "Positive net income", passed: true },
      { key: "positiveOperatingCashFlow", label: "Positive operating cash flow", passed: true },
      { key: "cashFlowExceedsNetIncome", label: "Cash flow exceeds income", passed: true },
      { key: "higherGrossMargin", label: "Higher gross margin", passed: true },
    ],
  },
  magicFormula: {
    state: "ranked" as const,
    universePercentile: 72,
    industryPercentile: 68,
    exclusionReason: null,
  },
};

test("multiple credible signals surface a priority research candidate", () => {
  const result = computeResearchConvictionV2(base);
  assert.equal(result.tier, "priority");
  assert.ok(result.score >= 66);
  assert.ok(result.researchCases.length >= 1);
  assert.ok(result.confirmingCount >= 3);
});

test("temporary accounting weakness becomes a warning rather than an automatic exclusion", () => {
  const result = computeResearchConvictionV2({
    ...base,
    quality: 55,
    recoveryConfirmation: 38,
    piotroski: {
      ...base.piotroski,
      score: 5,
      provisionalScore: 5,
      tests: [
        { key: "positiveNetIncome", label: "Positive net income", passed: false },
        { key: "positiveOperatingCashFlow", label: "Positive operating cash flow", passed: true },
        { key: "higherGrossMargin", label: "Higher gross margin", passed: true },
        { key: "higherCurrentRatio", label: "Higher current ratio", passed: true },
      ],
    },
  });
  assert.notEqual(result.tier, "avoid");
  assert.ok(result.warnings.some((item) => item.includes("net income")));
  assert.equal(result.hardRisks.length, 0);
});

test("negative earnings and cash flow together still create a hard risk", () => {
  const result = computeResearchConvictionV2({
    ...base,
    piotroski: {
      ...base.piotroski,
      score: 2,
      provisionalScore: 2,
      tests: [
        { key: "positiveNetIncome", label: "Positive net income", passed: false },
        { key: "positiveOperatingCashFlow", label: "Positive operating cash flow", passed: false },
      ],
    },
  });
  assert.equal(result.tier, "avoid");
  assert.ok(result.hardRisks.length > 0);
});

test("incomplete but useful evidence can reach the qualified tier", () => {
  const result = computeResearchConvictionV2({
    ...base,
    valuation: 62,
    quality: 57,
    priceDislocation: 47,
    recoveryConfirmation: 39,
    dataConfidence: 41,
    piotroski: {
      state: "partial",
      score: null,
      provisionalScore: 4,
      availableTests: 6,
      coverage: 67,
      tests: [
        { key: "positiveNetIncome", label: "Positive net income", passed: true },
        { key: "positiveOperatingCashFlow", label: "Positive operating cash flow", passed: true },
        { key: "higherGrossMargin", label: "Higher gross margin", passed: true },
        { key: "higherCurrentRatio", label: "Higher current ratio", passed: true },
      ],
    },
    magicFormula: {
      state: "missing",
      universePercentile: null,
      industryPercentile: null,
      exclusionReason: null,
    },
  });
  assert.ok(["priority", "qualified", "watch"].includes(result.tier));
  assert.ok(result.nextProof.some((item) => item.includes("Piotroski")));
});
