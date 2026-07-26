export const CONVICTION_V2_CALC_VERSION = "opportunity.conviction.v0.2";

export type ResearchTierV2 =
  | "priority"
  | "qualified"
  | "watch"
  | "avoid"
  | "insufficient";

export type ResearchCaseV2 =
  | "broken_stock"
  | "improving_value"
  | "quality_value"
  | "fundamental_inflection"
  | "multi_model_value"
  | "cash_backed_value";

export interface ConvictionV2PiotroskiTest {
  key: string;
  label: string;
  passed: boolean | null;
}

export interface ConvictionV2Input {
  valuation: number | null;
  quality: number | null;
  priceDislocation: number | null;
  recoveryConfirmation: number | null;
  balanceSheetDurability: number | null;
  impairmentRisk: number | null;
  dataConfidence: number;
  sectorModelBlocked: boolean;
  piotroski: {
    state: "complete" | "partial" | "missing";
    score: number | null;
    provisionalScore: number | null;
    availableTests: number;
    coverage: number;
    tests: ConvictionV2PiotroskiTest[];
  };
  magicFormula: {
    state: "ranked" | "ineligible" | "missing";
    universePercentile: number | null;
    industryPercentile: number | null;
    exclusionReason: string | null;
  };
}

export interface ConvictionV2Lens {
  key:
    | "valuation"
    | "quality"
    | "impairmentSafety"
    | "piotroski"
    | "priceDislocation"
    | "recovery"
    | "magicFormula"
    | "balanceSheet";
  label: string;
  score: number;
  weight: number;
  confirms: boolean;
  contradicts: boolean;
}

export interface ConvictionV2Result {
  score: number;
  tier: ResearchTierV2;
  agreement: number;
  coverage: number;
  confirmingCount: number;
  contradictingCount: number;
  availableCount: number;
  primaryCase: ResearchCaseV2 | null;
  researchCases: ResearchCaseV2[];
  confirmations: string[];
  warnings: string[];
  hardRisks: string[];
  nextProof: string[];
  lenses: ConvictionV2Lens[];
  calcVersion: string;
}

const LENS_DEFINITIONS = [
  { key: "valuation", label: "Peer-relative valuation", weight: 18, threshold: 58 },
  { key: "quality", label: "Business quality", weight: 18, threshold: 55 },
  { key: "impairmentSafety", label: "Low impairment risk", weight: 16, threshold: 55 },
  { key: "piotroski", label: "Piotroski financial health", weight: 14, threshold: 56 },
  { key: "priceDislocation", label: "Price dislocation", weight: 12, threshold: 45 },
  { key: "recovery", label: "Recovery confirmation", weight: 8, threshold: 45 },
  { key: "magicFormula", label: "Magic Formula rank", weight: 7, threshold: 60 },
  { key: "balanceSheet", label: "Balance-sheet durability", weight: 7, threshold: 50 },
] as const;

const TOTAL_WEIGHT = LENS_DEFINITIONS.reduce((sum, lens) => sum + lens.weight, 0);

/**
 * Practical research-priority model.
 *
 * This model is intentionally more permissive than the production eligibility
 * gate. It is designed to find companies worth investigating, including
 * recoveries whose current earnings are temporarily weak. Only severe,
 * multi-signal value-trap risks create a hard block.
 */
export function computeResearchConvictionV2(input: ConvictionV2Input): ConvictionV2Result {
  const piotroskiScore = normalisedPiotroski(input.piotroski);
  const magicScore = combinedMagicPercentile(input.magicFormula);
  const impairmentSafety =
    input.impairmentRisk === null ? null : clamp(100 - input.impairmentRisk);

  const values: Record<(typeof LENS_DEFINITIONS)[number]["key"], number | null> = {
    valuation: finite(input.valuation),
    quality: finite(input.quality),
    impairmentSafety,
    piotroski: piotroskiScore,
    priceDislocation: finite(input.priceDislocation),
    recovery: finite(input.recoveryConfirmation),
    magicFormula: magicScore,
    balanceSheet: finite(input.balanceSheetDurability),
  };

  const lenses: ConvictionV2Lens[] = [];
  for (const definition of LENS_DEFINITIONS) {
    const value = values[definition.key];
    if (value === null) continue;
    const coverageMultiplier =
      definition.key === "piotroski" && input.piotroski.state === "partial"
        ? Math.max(0.45, clamp(input.piotroski.coverage) / 100)
        : 1;
    const weight = definition.weight * coverageMultiplier;
    lenses.push({
      key: definition.key,
      label: definition.label,
      score: clamp(value),
      weight,
      confirms: value >= definition.threshold,
      contradicts: value <= 35,
    });
  }

  const availableWeight = lenses.reduce((sum, lens) => sum + lens.weight, 0);
  const weightedScore = availableWeight
    ? lenses.reduce((sum, lens) => sum + lens.score * lens.weight, 0) / availableWeight
    : 0;
  const confirmingWeight = lenses
    .filter((lens) => lens.confirms)
    .reduce((sum, lens) => sum + lens.weight, 0);
  const agreement = availableWeight ? (confirmingWeight / availableWeight) * 100 : 0;
  const coverage = (availableWeight / TOTAL_WEIGHT) * 100;
  const confirmingCount = lenses.filter((lens) => lens.confirms).length;
  const contradictingCount = lenses.filter((lens) => lens.contradicts).length;

  const hardRisks = hardRiskChecks(input, piotroskiScore);
  const warnings = warningChecks(input, piotroskiScore);
  const researchCases = classifyResearchCases(input, piotroskiScore, magicScore);
  const nextProof = buildNextProof(input, lenses, researchCases);

  const warningPenalty = Math.min(10, warnings.length * 1.5);
  const breadthScore = Math.min(100, confirmingCount * 20 + researchCases.length * 10);
  const confidenceMultiplier = 0.86 + 0.14 * (clamp(input.dataConfidence) / 100);
  let score =
    (weightedScore * 0.7 + agreement * 0.2 + breadthScore * 0.1 - warningPenalty) *
    confidenceMultiplier;
  if (researchCases.length >= 3) score += 4;
  else if (researchCases.length === 2) score += 2;
  if (hardRisks.length > 0) score = Math.min(score, 34);
  score = round1(clamp(score));

  const tier = classifyTier({
    score,
    coverage,
    confirmingCount,
    availableCount: lenses.length,
    researchCases,
    hardRisks,
  });

  return {
    score,
    tier,
    agreement: round1(agreement),
    coverage: round1(coverage),
    confirmingCount,
    contradictingCount,
    availableCount: lenses.length,
    primaryCase: primaryResearchCase(researchCases),
    researchCases,
    confirmations: lenses
      .filter((lens) => lens.confirms)
      .sort((left, right) => right.score * right.weight - left.score * left.weight)
      .map((lens) => `${lens.label} ${lens.score.toFixed(0)}/100`),
    warnings: unique(warnings),
    hardRisks: unique(hardRisks),
    nextProof: unique(nextProof).slice(0, 5),
    lenses,
    calcVersion: CONVICTION_V2_CALC_VERSION,
  };
}

function classifyTier(input: {
  score: number;
  coverage: number;
  confirmingCount: number;
  availableCount: number;
  researchCases: ResearchCaseV2[];
  hardRisks: string[];
}): ResearchTierV2 {
  if (input.hardRisks.length > 0) return "avoid";
  if (input.coverage < 25 || input.availableCount < 3) return "insufficient";
  if (
    input.score >= 66 &&
    input.coverage >= 45 &&
    input.confirmingCount >= 3 &&
    input.researchCases.length >= 1
  ) {
    return "priority";
  }
  if (
    input.score >= 56 &&
    input.coverage >= 35 &&
    input.confirmingCount >= 2 &&
    input.researchCases.length >= 1
  ) {
    return "qualified";
  }
  if (input.score >= 46 && (input.confirmingCount >= 1 || input.researchCases.length >= 1)) {
    return "watch";
  }
  return input.score < 38 ? "avoid" : "insufficient";
}

function hardRiskChecks(input: ConvictionV2Input, piotroskiScore: number | null): string[] {
  const risks: string[] = [];
  if (input.sectorModelBlocked) {
    risks.push("A sector-specific model is required before the generic conviction score can be trusted.");
  }
  if (input.piotroski.state === "complete" && (input.piotroski.score ?? 9) <= 2) {
    risks.push(`Piotroski F-Score is only ${input.piotroski.score}/9.`);
  } else if (
    input.piotroski.state === "partial" &&
    input.piotroski.coverage >= 70 &&
    piotroskiScore !== null &&
    piotroskiScore <= 25
  ) {
    risks.push("Broad partial Piotroski evidence is severely weak.");
  }
  const negativeIncome = failedTest(input, "positiveNetIncome");
  const negativeCashFlow = failedTest(input, "positiveOperatingCashFlow");
  if (negativeIncome && negativeCashFlow) {
    risks.push("Both annual net income and operating cash flow are negative.");
  }
  if ((input.quality ?? 100) <= 25) risks.push("Business quality is below 25/100.");
  if ((input.impairmentRisk ?? 0) >= 75) risks.push("Estimated permanent-impairment risk is at least 75/100.");
  if ((input.balanceSheetDurability ?? 100) <= 15) risks.push("Balance-sheet durability is below 15/100.");
  const magicReason = input.magicFormula.exclusionReason?.toLowerCase() ?? "";
  if (magicReason.includes("ebit is not positive") && negativeCashFlow) {
    risks.push("EBIT and operating cash flow are both non-positive.");
  }
  return risks;
}

function warningChecks(input: ConvictionV2Input, piotroskiScore: number | null): string[] {
  const warnings: string[] = [];
  if (input.piotroski.state === "missing") warnings.push("Piotroski evidence is unavailable.");
  else if (input.piotroski.state === "partial") {
    warnings.push(`Piotroski is provisional at ${input.piotroski.coverage.toFixed(0)}% coverage.`);
  } else if (piotroskiScore !== null && piotroskiScore < 56) {
    warnings.push("Piotroski financial health is below a 5/9 equivalent.");
  }
  if (failedTest(input, "positiveNetIncome")) warnings.push("Annual net income is negative.");
  if (failedTest(input, "positiveOperatingCashFlow")) warnings.push("Annual operating cash flow is negative.");
  if (failedTest(input, "cashFlowExceedsNetIncome")) warnings.push("Operating cash flow does not exceed net income.");
  if (failedTest(input, "noNewShares")) warnings.push("Share count increased year on year.");
  if (failedTest(input, "higherGrossMargin")) warnings.push("Gross margin did not improve year on year.");
  if (failedTest(input, "higherReturnOnAssets")) warnings.push("Return on assets did not improve year on year.");
  if ((input.valuation ?? 100) < 48) warnings.push("Valuation is not clearly attractive relative to peers.");
  if ((input.quality ?? 100) < 45) warnings.push("Business quality is below 45/100.");
  if ((input.impairmentRisk ?? 0) > 52) warnings.push("Impairment risk remains above 52/100.");
  if ((input.balanceSheetDurability ?? 100) < 42) warnings.push("Balance-sheet durability is below 42/100.");
  if ((input.recoveryConfirmation ?? 100) < 32) warnings.push("Price recovery is not yet confirmed.");
  if (input.dataConfidence < 35) warnings.push("Data confidence is below 35%.");
  return warnings;
}

function classifyResearchCases(
  input: ConvictionV2Input,
  piotroskiScore: number | null,
  magicScore: number | null,
): ResearchCaseV2[] {
  const cases: ResearchCaseV2[] = [];
  const valuation = input.valuation ?? 0;
  const quality = input.quality ?? 0;
  const damage = input.priceDislocation ?? 0;
  const recovery = input.recoveryConfirmation ?? 0;
  const impairment = input.impairmentRisk ?? 100;
  const improvementPasses = [
    "higherReturnOnAssets",
    "lowerLongTermDebtToAssets",
    "higherCurrentRatio",
    "higherGrossMargin",
    "higherAssetTurnover",
  ].filter((key) => passedTest(input, key)).length;

  if (damage >= 45 && quality >= 50 && impairment <= 50) cases.push("broken_stock");
  if (valuation >= 58 && (piotroskiScore ?? 0) >= 56) cases.push("improving_value");
  if (quality >= 62 && valuation >= 52 && impairment <= 45) cases.push("quality_value");
  if (improvementPasses >= 2 && valuation >= 48 && damage >= 25 && recovery >= 30) {
    cases.push("fundamental_inflection");
  }
  if ((magicScore ?? 0) >= 60 && valuation >= 52 && quality >= 48) {
    cases.push("multi_model_value");
  }
  if (
    valuation >= 60 &&
    passedTest(input, "positiveOperatingCashFlow") &&
    impairment <= 50
  ) {
    cases.push("cash_backed_value");
  }
  return unique(cases);
}

function buildNextProof(
  input: ConvictionV2Input,
  lenses: ConvictionV2Lens[],
  researchCases: ResearchCaseV2[],
): string[] {
  const proof: string[] = [];
  if (researchCases.length === 0) proof.push("Identify a specific research case rather than relying on a blended score alone.");
  if (input.piotroski.state !== "complete") proof.push("Complete the remaining annual Piotroski tests.");
  if (!lenses.some((lens) => lens.key === "valuation")) proof.push("Refresh peer-relative valuation and free-cash-flow evidence.");
  if (!lenses.some((lens) => lens.key === "quality")) proof.push("Refresh profitability, return, margin and leverage evidence.");
  if ((input.recoveryConfirmation ?? 0) < 45) proof.push("Look for improving guidance, revisions, margins or price trend before escalating conviction.");
  if ((input.impairmentRisk ?? 50) > 45) proof.push("Investigate refinancing, cash burn and structural earnings risk.");
  if (input.dataConfidence < 50) proof.push("Resolve the largest proxy or missing-data penalty.");
  if (proof.length === 0) proof.push("Validate the strongest signals against the latest filing, guidance and consensus expectations.");
  return proof;
}

function normalisedPiotroski(input: ConvictionV2Input["piotroski"]): number | null {
  if (input.state === "complete" && input.score !== null) return clamp((input.score / 9) * 100);
  if (
    input.state === "partial" &&
    input.availableTests >= 4 &&
    input.provisionalScore !== null &&
    input.availableTests > 0
  ) {
    return clamp((input.provisionalScore / input.availableTests) * 100);
  }
  return null;
}

function combinedMagicPercentile(input: ConvictionV2Input["magicFormula"]): number | null {
  if (input.state !== "ranked") return null;
  const universe = finite(input.universePercentile);
  const industry = finite(input.industryPercentile);
  if (universe !== null && industry !== null) return clamp(universe * 0.6 + industry * 0.4);
  return universe ?? industry;
}

function primaryResearchCase(cases: ResearchCaseV2[]): ResearchCaseV2 | null {
  const order: ResearchCaseV2[] = [
    "broken_stock",
    "improving_value",
    "multi_model_value",
    "quality_value",
    "fundamental_inflection",
    "cash_backed_value",
  ];
  return order.find((item) => cases.includes(item)) ?? null;
}

function passedTest(input: ConvictionV2Input, key: string): boolean {
  return input.piotroski.tests.some((test) => test.key === key && test.passed === true);
}

function failedTest(input: ConvictionV2Input, key: string): boolean {
  return input.piotroski.tests.some((test) => test.key === key && test.passed === false);
}

function finite(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
