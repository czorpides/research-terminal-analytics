export const CONVICTION_CALC_VERSION = "opportunity.conviction.v0.1";

export type ConvictionTier =
  | "research_now"
  | "promising"
  | "watch"
  | "weak"
  | "insufficient"
  | "excluded";

export type ResearchCase =
  | "broken_stock"
  | "improving_deep_value"
  | "quality_value"
  | "fundamental_inflection"
  | "multi_model_value";

export interface ConvictionPiotroskiTest {
  key: string;
  label: string;
  passed: boolean | null;
}

export interface ConvictionInput {
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
    tests: ConvictionPiotroskiTest[];
  };
  magicFormula: {
    state: "ranked" | "ineligible" | "missing";
    universePercentile: number | null;
    industryPercentile: number | null;
    exclusionReason: string | null;
  };
}

export interface ConvictionLensResult {
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
  threshold: number;
  confirms: boolean;
  contradicts: boolean;
}

export interface ConvictionResult {
  score: number;
  tier: ConvictionTier;
  agreement: number;
  coverage: number;
  confirmingCount: number;
  availableCount: number;
  primaryCase: ResearchCase | null;
  researchCases: ResearchCase[];
  confirmations: string[];
  contradictions: string[];
  warnings: string[];
  exclusions: string[];
  lenses: ConvictionLensResult[];
  calcVersion: string;
}

const BASE_LENSES = [
  { key: "valuation", label: "Peer-relative valuation", weight: 18, threshold: 60 },
  { key: "quality", label: "Business quality", weight: 18, threshold: 60 },
  { key: "impairmentSafety", label: "Low impairment risk", weight: 16, threshold: 60 },
  { key: "piotroski", label: "Piotroski financial health", weight: 16, threshold: 67 },
  { key: "priceDislocation", label: "Price dislocation", weight: 12, threshold: 50 },
  { key: "recovery", label: "Recovery confirmation", weight: 8, threshold: 50 },
  { key: "magicFormula", label: "Magic Formula rank", weight: 7, threshold: 65 },
  { key: "balanceSheet", label: "Balance-sheet durability", weight: 5, threshold: 55 },
] as const;

const TOTAL_BASE_WEIGHT = BASE_LENSES.reduce((sum, lens) => sum + lens.weight, 0);

export function computeResearchConviction(input: ConvictionInput): ConvictionResult {
  const piotroskiScore = normalisedPiotroski(input.piotroski);
  const magicScore = combinedMagicPercentile(input.magicFormula);
  const impairmentSafety =
    input.impairmentRisk === null ? null : clamp(100 - input.impairmentRisk);

  const values: Record<(typeof BASE_LENSES)[number]["key"], number | null> = {
    valuation: finite(input.valuation),
    quality: finite(input.quality),
    impairmentSafety,
    piotroski: piotroskiScore,
    priceDislocation: finite(input.priceDislocation),
    recovery: finite(input.recoveryConfirmation),
    magicFormula: magicScore,
    balanceSheet: finite(input.balanceSheetDurability),
  };

  const lenses: ConvictionLensResult[] = [];
  for (const definition of BASE_LENSES) {
    const value = values[definition.key];
    if (value === null) continue;
    const coverageMultiplier =
      definition.key === "piotroski" && input.piotroski.state === "partial"
        ? clamp(input.piotroski.coverage) / 100
        : 1;
    const weight = definition.weight * coverageMultiplier;
    if (weight <= 0) continue;
    lenses.push({
      key: definition.key,
      label: definition.label,
      score: clamp(value),
      weight,
      threshold: definition.threshold,
      confirms: value >= definition.threshold,
      contradicts: value <= 40,
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
  const coverage = (availableWeight / TOTAL_BASE_WEIGHT) * 100;

  const exclusions = hardExclusions(input, piotroskiScore);
  const warnings = softWarnings(input, piotroskiScore);
  const researchCases = classifyResearchCases(input, piotroskiScore, magicScore);

  const warningPenalty = Math.min(12, warnings.length * 2.5);
  const confidenceMultiplier = 0.9 + 0.1 * (clamp(input.dataConfidence) / 100);
  let score = (weightedScore * 0.76 + agreement * 0.24 - warningPenalty) * confidenceMultiplier;
  if (researchCases.length >= 3) score += 3;
  else if (researchCases.length === 2) score += 1.5;
  if (exclusions.length > 0) score = Math.min(score, 35);
  score = round1(clamp(score));

  const confirmingCount = lenses.filter((lens) => lens.confirms).length;
  const availableCount = lenses.length;
  const tier = convictionTier({
    score,
    agreement,
    coverage,
    confirmingCount,
    researchCases,
    exclusions,
  });

  const rankedConfirmations = lenses
    .filter((lens) => lens.confirms)
    .sort((left, right) => right.score * right.weight - left.score * left.weight)
    .map((lens) => `${lens.label} ${lens.score.toFixed(0)}/100`);
  const contradictions = lenses
    .filter((lens) => lens.contradicts)
    .sort((left, right) => left.score - right.score)
    .map((lens) => `${lens.label} ${lens.score.toFixed(0)}/100`);

  return {
    score,
    tier,
    agreement: round1(agreement),
    coverage: round1(coverage),
    confirmingCount,
    availableCount,
    primaryCase: primaryResearchCase(researchCases),
    researchCases,
    confirmations: rankedConfirmations,
    contradictions,
    warnings: unique(warnings),
    exclusions: unique(exclusions),
    lenses,
    calcVersion: CONVICTION_CALC_VERSION,
  };
}

function normalisedPiotroski(input: ConvictionInput["piotroski"]): number | null {
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

function combinedMagicPercentile(input: ConvictionInput["magicFormula"]): number | null {
  if (input.state !== "ranked") return null;
  const universe = finite(input.universePercentile);
  const industry = finite(input.industryPercentile);
  if (universe !== null && industry !== null) return clamp(universe * 0.6 + industry * 0.4);
  return universe ?? industry;
}

function hardExclusions(input: ConvictionInput, piotroskiScore: number | null): string[] {
  const exclusions: string[] = [];
  if (input.sectorModelBlocked) {
    exclusions.push("A sector-specific model is required before this company can enter the generic shortlist.");
  }
  if (input.piotroski.state === "complete" && (input.piotroski.score ?? 9) <= 3) {
    exclusions.push(`Piotroski F-Score is ${input.piotroski.score}/9, below the minimum financial-health gate.`);
  } else if (
    input.piotroski.state === "partial" &&
    input.piotroski.coverage >= 67 &&
    piotroskiScore !== null &&
    piotroskiScore <= 33
  ) {
    exclusions.push("Available Piotroski evidence is weak enough to trigger a provisional value-trap exclusion.");
  }
  if (failedTest(input, "positiveNetIncome")) {
    exclusions.push("Latest annual net income is not positive.");
  }
  if (failedTest(input, "positiveOperatingCashFlow")) {
    exclusions.push("Latest annual operating cash flow is not positive.");
  }
  if ((input.quality ?? 100) <= 35) {
    exclusions.push("Business quality is below the minimum 35/100 gate.");
  }
  if ((input.impairmentRisk ?? 0) >= 65) {
    exclusions.push("Estimated permanent-impairment risk is at least 65/100.");
  }
  if ((input.balanceSheetDurability ?? 100) <= 25) {
    exclusions.push("Balance-sheet durability is below the minimum 25/100 gate.");
  }
  const magicReason = input.magicFormula.exclusionReason?.toLowerCase() ?? "";
  if (magicReason.includes("ebit is not positive")) {
    exclusions.push("Latest annual EBIT is not positive.");
  }
  return exclusions;
}

function softWarnings(input: ConvictionInput, piotroskiScore: number | null): string[] {
  const warnings: string[] = [];
  if (input.piotroski.state === "missing") {
    warnings.push("Piotroski evidence is unavailable.");
  } else if (input.piotroski.state === "partial") {
    warnings.push(`Piotroski is provisional at ${input.piotroski.coverage.toFixed(0)}% coverage.`);
  } else if (piotroskiScore !== null && piotroskiScore < 56) {
    warnings.push("Piotroski financial health is below 5/9 equivalent.");
  }
  if (failedTest(input, "cashFlowExceedsNetIncome")) warnings.push("Operating cash flow does not exceed net income.");
  if (failedTest(input, "noNewShares")) warnings.push("Share count increased year on year.");
  if (failedTest(input, "higherGrossMargin")) warnings.push("Gross margin did not improve year on year.");
  if (failedTest(input, "higherReturnOnAssets")) warnings.push("Return on assets did not improve year on year.");
  if (failedTest(input, "higherAssetTurnover")) warnings.push("Asset turnover did not improve year on year.");
  if ((input.valuation ?? 100) < 50) warnings.push("Valuation is not clearly attractive relative to peers.");
  if ((input.quality ?? 100) < 50) warnings.push("Business quality is below 50/100.");
  if ((input.impairmentRisk ?? 0) > 45) warnings.push("Impairment risk remains above 45/100.");
  if ((input.balanceSheetDurability ?? 100) < 50) warnings.push("Balance-sheet durability is below 50/100.");
  if ((input.recoveryConfirmation ?? 100) < 35) warnings.push("Price recovery is not yet confirmed.");
  if (input.dataConfidence < 40) warnings.push("Data confidence is below 40%.");
  return warnings;
}

function classifyResearchCases(
  input: ConvictionInput,
  piotroskiScore: number | null,
  magicScore: number | null,
): ResearchCase[] {
  const cases: ResearchCase[] = [];
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

  if (damage >= 55 && quality >= 55 && impairment <= 45) cases.push("broken_stock");
  if (valuation >= 65 && (piotroskiScore ?? 0) >= 67) cases.push("improving_deep_value");
  if (quality >= 70 && valuation >= 55 && impairment <= 35) cases.push("quality_value");
  if (improvementPasses >= 3 && valuation >= 50 && damage >= 30 && recovery >= 35) {
    cases.push("fundamental_inflection");
  }
  if ((magicScore ?? 0) >= 68 && valuation >= 58 && quality >= 52) {
    cases.push("multi_model_value");
  }
  return unique(cases);
}

function convictionTier(input: {
  score: number;
  agreement: number;
  coverage: number;
  confirmingCount: number;
  researchCases: ResearchCase[];
  exclusions: string[];
}): ConvictionTier {
  if (input.exclusions.length > 0) return "excluded";
  if (input.coverage < 42 || input.confirmingCount < 2) return "insufficient";
  if (
    input.score >= 70 &&
    input.agreement >= 60 &&
    input.coverage >= 65 &&
    input.confirmingCount >= 4 &&
    input.researchCases.length >= 2
  ) {
    return "research_now";
  }
  if (
    input.score >= 60 &&
    input.agreement >= 48 &&
    input.coverage >= 55 &&
    input.confirmingCount >= 3 &&
    input.researchCases.length >= 1
  ) {
    return "promising";
  }
  if (input.score >= 48) return "watch";
  return "weak";
}

function primaryResearchCase(cases: ResearchCase[]): ResearchCase | null {
  if (cases.includes("broken_stock")) return "broken_stock";
  if (cases.includes("improving_deep_value")) return "improving_deep_value";
  if (cases.includes("multi_model_value")) return "multi_model_value";
  if (cases.includes("quality_value")) return "quality_value";
  if (cases.includes("fundamental_inflection")) return "fundamental_inflection";
  return null;
}

function passedTest(input: ConvictionInput, key: string): boolean {
  return input.piotroski.tests.some((test) => test.key === key && test.passed === true);
}

function failedTest(input: ConvictionInput, key: string): boolean {
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
