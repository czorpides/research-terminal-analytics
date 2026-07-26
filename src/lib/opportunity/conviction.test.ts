import assert from "node:assert/strict";
import test from "node:test";

import { computeResearchConviction, type ConvictionInput } from "./conviction.ts";

function baseInput(): ConvictionInput {
  return {
    valuation: 82,
    quality: 72,
    priceDislocation: 76,
    recoveryConfirmation: 58,
    balanceSheetDurability: 70,
    impairmentRisk: 24,
    dataConfidence: 72,
    sectorModelBlocked: false,
    piotroski: {
      state: "complete",
      score: 7,
      provisionalScore: 7,
      availableTests: 9,
      coverage: 100,
      tests: [
        { key: "positiveNetIncome", label: "Positive net income", passed: true },
        { key: "positiveOperatingCashFlow", label: "Positive operating cash flow", passed: true },
        { key: "higherReturnOnAssets", label: "Higher ROA", passed: true },
        { key: "cashFlowExceedsNetIncome", label: "Cash conversion", passed: true },
        { key: "lowerLongTermDebtToAssets", label: "Lower leverage", passed: true },
        { key: "higherCurrentRatio", label: "Higher current ratio", passed: true },
        { key: "noNewShares", label: "No dilution", passed: true },
        { key: "higherGrossMargin", label: "Higher margin", passed: false },
        { key: "higherAssetTurnover", label: "Higher asset turnover", passed: false },
      ],
    },
    magicFormula: {
      state: "ranked",
      universePercentile: 80,
      industryPercentile: 74,
      exclusionReason: null,
    },
  };
}

test("promotes multi-model agreement into the research-now shortlist", () => {
  const result = computeResearchConviction(baseInput());
  assert.equal(result.tier, "research_now");
  assert.ok(result.score >= 70);
  assert.ok(result.agreement >= 60);
  assert.ok(result.researchCases.includes("broken_stock"));
  assert.ok(result.researchCases.includes("improving_deep_value"));
  assert.ok(result.researchCases.includes("multi_model_value"));
});

test("hard-excludes negative cash generation even when valuation looks cheap", () => {
  const input = baseInput();
  input.valuation = 95;
  input.piotroski.tests = input.piotroski.tests.map((item) =>
    item.key === "positiveOperatingCashFlow" ? { ...item, passed: false } : item,
  );
  const result = computeResearchConviction(input);
  assert.equal(result.tier, "excluded");
  assert.ok(result.score <= 35);
  assert.ok(result.exclusions.some((item) => item.includes("operating cash flow")));
});

test("uses strong partial Piotroski evidence without presenting a formal F-Score", () => {
  const input = baseInput();
  input.piotroski.state = "partial";
  input.piotroski.score = null;
  input.piotroski.provisionalScore = 6;
  input.piotroski.availableTests = 8;
  input.piotroski.coverage = 88.9;
  const result = computeResearchConviction(input);
  assert.notEqual(result.tier, "excluded");
  assert.ok(result.coverage < 100);
  assert.ok(result.warnings.some((item) => item.includes("provisional")));
  assert.ok(result.lenses.some((lens) => lens.key === "piotroski"));
});

test("does not let a value trap become promising through cheapness alone", () => {
  const input = baseInput();
  input.valuation = 96;
  input.quality = 32;
  input.impairmentRisk = 72;
  input.piotroski.score = 2;
  input.piotroski.provisionalScore = 2;
  const result = computeResearchConviction(input);
  assert.equal(result.tier, "excluded");
  assert.ok(result.exclusions.length >= 2);
});

test("keeps an attractive but weakly confirmed company on watch", () => {
  const input = baseInput();
  input.quality = 54;
  input.recoveryConfirmation = 18;
  input.magicFormula = {
    state: "missing",
    universePercentile: null,
    industryPercentile: null,
    exclusionReason: null,
  };
  input.piotroski.state = "partial";
  input.piotroski.score = null;
  input.piotroski.provisionalScore = 4;
  input.piotroski.availableTests = 7;
  input.piotroski.coverage = 77.8;
  const result = computeResearchConviction(input);
  assert.ok(["watch", "promising"].includes(result.tier));
  assert.ok(result.warnings.some((item) => item.includes("recovery")));
});
