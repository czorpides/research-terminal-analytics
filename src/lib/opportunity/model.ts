export type InvestmentHorizon = "one_to_three" | "three_to_five" | "five_to_ten";

export type OpportunitySignalKey =
  | "priceDislocation"
  | "absolutePriceDamage"
  | "fundamentalResilience"
  | "valuationCompression"
  | "temporaryEvidence"
  | "recoveryConfirmation"
  | "ownershipEvidence"
  | "sustainableEarnings"
  | "balanceSheetDurability"
  | "recoveryDurability"
  | "macroResilience"
  | "capitalAllocation"
  | "businessQuality"
  | "reinvestmentRunway"
  | "industryDurability"
  | "entryValuation"
  | "idiosyncrasy"
  | "impairmentRisk";

export type SignalStatus = "observed" | "proxy" | "missing";

export interface OpportunitySignal {
  key: OpportunitySignalKey;
  label: string;
  value: number | null;
  confidence: number;
  status: SignalStatus;
  detail: string;
  asOf?: string | null;
  source?: string;
}

export type OpportunityEvidence = Partial<Record<OpportunitySignalKey, OpportunitySignal>>;

export type OpportunityClassification =
  | "broken_stock"
  | "sector_washout"
  | "recovery_watch"
  | "possible_value_trap"
  | "no_signal"
  | "durable_candidate"
  | "quality_profile"
  | "quality_watch"
  | "quality_risk";

export type OpportunityModelState = "eligible" | "shadow" | "experimental" | "blocked";

export interface HorizonComponent {
  key: OpportunitySignalKey;
  label: string;
  weight: number;
  value: number;
  status: SignalStatus;
  confidence: number;
  detail: string;
}

export interface OpportunityHorizonScore {
  horizon: InvestmentHorizon;
  scoreLabel: string;
  score: number;
  dataConfidence: number;
  evidenceCoverage: number;
  impairmentRisk: number;
  idiosyncrasyScore: number;
  researchPriority: number;
  classification: OpportunityClassification;
  modelState: OpportunityModelState;
  productionEligible: boolean;
  experimental: boolean;
  components: HorizonComponent[];
  positives: string[];
  risks: string[];
  blockedReasons: string[];
  calcVersion: string;
}

interface HorizonConfig {
  label: string;
  scoreLabel: string;
  description: string;
  refresh: string;
  experimental: boolean;
  weights: Partial<Record<OpportunitySignalKey, number>>;
  critical: OpportunitySignalKey[];
}

export const OPPORTUNITY_CALC_VERSION = "opportunity.horizons.v0.1";

export interface PriceDislocationInput {
  return12m: number | null;
  drawdown: number | null;
  peerMedianReturn: number | null;
  sectorBreadth: number | null;
}

export interface PriceDislocationResult {
  residualReturn: number | null;
  absolutePriceDamage: number | null;
  priceDislocation: number | null;
  idiosyncrasy: number | null;
}

/**
 * Separate share-price damage from broad peer weakness.
 *
 * Returns are decimals. A -0.30 residual means the stock underperformed its
 * peer median by 30 percentage points. Sector breadth is the share of tracked
 * peers down at least 10%.
 */
export function computePriceDislocation(input: PriceDislocationInput): PriceDislocationResult {
  const residualReturn =
    input.return12m !== null && input.peerMedianReturn !== null
      ? input.return12m - input.peerMedianReturn
      : null;
  const residualSeverity = residualReturn === null ? null : scaleToUnit(-residualReturn, 0.05, 0.4);
  const drawdownSeverity = input.drawdown === null ? null : scaleToUnit(-input.drawdown, 0.1, 0.5);
  const absolutePriceDamage = drawdownSeverity === null ? null : round1(drawdownSeverity * 100);
  const priceDislocation =
    residualSeverity !== null && drawdownSeverity !== null
      ? round1(residualSeverity * 65 + drawdownSeverity * 35)
      : residualSeverity !== null
        ? round1(residualSeverity * 100)
        : drawdownSeverity !== null
          ? round1(drawdownSeverity * 100)
          : null;
  const idiosyncrasy =
    residualSeverity !== null && input.sectorBreadth !== null
      ? round1(residualSeverity * 70 + (1 - clamp01(input.sectorBreadth)) * 30)
      : residualSeverity !== null
        ? round1(residualSeverity * 70 + 15)
        : null;
  return { residualReturn, absolutePriceDamage, priceDislocation, idiosyncrasy };
}

export const HORIZON_CONFIGS: Record<InvestmentHorizon, HorizonConfig> = {
  one_to_three: {
    label: "1–3 years",
    scoreLabel: "Opportunity score",
    description:
      "Looks for a price overreaction where the business appears intact and a recovery or re-rating is plausible.",
    refresh: "Daily and after material company releases",
    experimental: false,
    weights: {
      priceDislocation: 20,
      fundamentalResilience: 25,
      valuationCompression: 20,
      temporaryEvidence: 15,
      recoveryConfirmation: 10,
      ownershipEvidence: 10,
    },
    critical: [
      "priceDislocation",
      "fundamentalResilience",
      "valuationCompression",
      "temporaryEvidence",
      "idiosyncrasy",
      "impairmentRisk",
    ],
  },
  three_to_five: {
    label: "3–5 years",
    scoreLabel: "Suitability score",
    description:
      "Tests whether a recovery can become durable earnings, cash-flow growth and balance-sheet resilience.",
    refresh: "Weekly and after company results",
    experimental: false,
    weights: {
      fundamentalResilience: 20,
      sustainableEarnings: 20,
      valuationCompression: 10,
      balanceSheetDurability: 15,
      recoveryDurability: 15,
      macroResilience: 10,
      capitalAllocation: 10,
    },
    critical: [
      "fundamentalResilience",
      "sustainableEarnings",
      "balanceSheetDurability",
      "macroResilience",
      "impairmentRisk",
    ],
  },
  five_to_ten: {
    label: "5–10 years",
    scoreLabel: "Quality profile",
    description:
      "Profiles long-run durability and reinvestment potential. It is not presented as a return forecast.",
    refresh: "Monthly and after company results",
    experimental: true,
    weights: {
      businessQuality: 20,
      reinvestmentRunway: 25,
      balanceSheetDurability: 15,
      industryDurability: 15,
      capitalAllocation: 15,
      entryValuation: 10,
    },
    critical: [
      "businessQuality",
      "reinvestmentRunway",
      "balanceSheetDurability",
      "industryDurability",
      "capitalAllocation",
      "impairmentRisk",
    ],
  },
};

const SIGNAL_LABELS: Record<OpportunitySignalKey, string> = {
  priceDislocation: "Price damage after peer effects",
  absolutePriceDamage: "Absolute share-price damage",
  fundamentalResilience: "Fundamental resilience",
  valuationCompression: "Valuation compression",
  temporaryEvidence: "Evidence the problem is temporary",
  recoveryConfirmation: "Recovery confirmation",
  ownershipEvidence: "Insider, short and ownership evidence",
  sustainableEarnings: "Sustainable earnings and cash flow",
  balanceSheetDurability: "Balance-sheet durability",
  recoveryDurability: "Recovery durability",
  macroResilience: "Resilience across macro conditions",
  capitalAllocation: "Capital allocation",
  businessQuality: "Business quality",
  reinvestmentRunway: "Reinvestment runway",
  industryDurability: "Industry durability",
  entryValuation: "Entry valuation",
  idiosyncrasy: "Company-specific share of the damage",
  impairmentRisk: "Permanent impairment risk",
};

export function missingSignal(key: OpportunitySignalKey, detail: string): OpportunitySignal {
  return {
    key,
    label: SIGNAL_LABELS[key],
    value: null,
    confidence: 0,
    status: "missing",
    detail,
  };
}

export function scoreOpportunityHorizon(
  horizon: InvestmentHorizon,
  evidence: OpportunityEvidence,
  additionalBlocks: string[] = [],
): OpportunityHorizonScore {
  const config = HORIZON_CONFIGS[horizon];
  const totalWeight = Object.values(config.weights).reduce((sum, weight) => sum + (weight ?? 0), 0);
  const components: HorizonComponent[] = [];
  let weightedScore = 0;
  let weightedCoverage = 0;
  let weightedSourceConfidence = 0;

  for (const [key, weightValue] of Object.entries(config.weights) as Array<
    [OpportunitySignalKey, number]
  >) {
    const weight = weightValue ?? 0;
    const signal = evidence[key] ?? missingSignal(key, "This input has not been connected yet.");
    const value = signal.value === null ? 50 : clamp(signal.value);
    const coverageMultiplier =
      signal.status === "observed" ? 1 : signal.status === "proxy" ? 0.55 : 0;
    weightedScore += value * weight;
    weightedCoverage += coverageMultiplier * weight;
    weightedSourceConfidence +=
      (signal.value === null ? 0 : clamp(signal.confidence)) * coverageMultiplier * weight;
    components.push({
      key,
      label: signal.label,
      weight,
      value,
      status: signal.status,
      confidence: clamp(signal.confidence),
      detail: signal.detail,
    });
  }

  const score = round1(weightedScore / Math.max(1, totalWeight));
  const evidenceCoverage = round1((weightedCoverage / Math.max(1, totalWeight)) * 100);
  const sourceConfidence = weightedCoverage > 0 ? weightedSourceConfidence / weightedCoverage : 0;

  const controlSignals = ["idiosyncrasy", "impairmentRisk"] as const;
  const controlCoverage =
    controlSignals.reduce((sum, key) => {
      const status = evidence[key]?.status ?? "missing";
      return sum + (status === "observed" ? 1 : status === "proxy" ? 0.55 : 0);
    }, 0) / controlSignals.length;
  let dataConfidence = round1(
    0.5 * evidenceCoverage + 0.35 * sourceConfidence + 0.15 * controlCoverage * 100,
  );

  const unresolvedCritical = config.critical.filter(
    (key) => (evidence[key]?.status ?? "missing") !== "observed",
  );
  if (unresolvedCritical.length > 0) dataConfidence = Math.min(dataConfidence, 69);

  const impairmentRisk = clamp(evidence.impairmentRisk?.value ?? 50);
  const idiosyncrasyScore = clamp(evidence.idiosyncrasy?.value ?? 50);
  const classification = classify(horizon, {
    score,
    impairmentRisk,
    idiosyncrasyScore,
    priceDislocation: evidence.priceDislocation?.value ?? 50,
    absolutePriceDamage:
      evidence.absolutePriceDamage?.value ?? evidence.priceDislocation?.value ?? 50,
    quality:
      evidence.fundamentalResilience?.value ??
      evidence.businessQuality?.value ??
      evidence.sustainableEarnings?.value ??
      50,
  });

  const blockedReasons = unique([
    ...additionalBlocks,
    ...unresolvedCritical.map(
      (key) =>
        `${SIGNAL_LABELS[key]} is ${
          evidence[key]?.status === "proxy" ? "still a proxy" : "not available"
        }.`,
    ),
  ]);

  const productionEligible =
    !config.experimental &&
    additionalBlocks.length === 0 &&
    unresolvedCritical.length === 0 &&
    dataConfidence >= 70 &&
    impairmentRisk < 30 &&
    (horizon !== "one_to_three" || idiosyncrasyScore >= 60) &&
    score >= 70;

  const modelState: OpportunityModelState =
    additionalBlocks.length > 0
      ? "blocked"
      : config.experimental
        ? "experimental"
        : productionEligible
          ? "eligible"
          : "shadow";

  const researchPriority = round1(
    score * Math.sqrt(dataConfidence / 100) * (1 - impairmentRisk / 100),
  );
  const positives = components
    .filter((component) => component.value >= 65 && component.status !== "missing")
    .sort((a, b) => b.value * b.weight - a.value * a.weight)
    .slice(0, 4)
    .map((component) => `${component.label}: ${component.value.toFixed(0)}/100.`);
  const risks = [
    ...components
      .filter((component) => component.value <= 40 && component.status !== "missing")
      .sort((a, b) => a.value - b.value)
      .slice(0, 3)
      .map((component) => `${component.label}: ${component.value.toFixed(0)}/100.`),
    ...blockedReasons.slice(0, 4),
  ];

  return {
    horizon,
    scoreLabel: config.scoreLabel,
    score,
    dataConfidence,
    evidenceCoverage,
    impairmentRisk: round1(impairmentRisk),
    idiosyncrasyScore: round1(idiosyncrasyScore),
    researchPriority,
    classification,
    modelState,
    productionEligible,
    experimental: config.experimental,
    components,
    positives,
    risks: unique(risks),
    blockedReasons,
    calcVersion: OPPORTUNITY_CALC_VERSION,
  };
}

export function classificationLabel(classification: OpportunityClassification): string {
  const labels: Record<OpportunityClassification, string> = {
    broken_stock: "Broken stock",
    sector_washout: "Sector washout",
    recovery_watch: "Recovery watch",
    possible_value_trap: "Possible value trap",
    no_signal: "No clear signal",
    durable_candidate: "Durable candidate",
    quality_profile: "Strong quality profile",
    quality_watch: "Quality watch",
    quality_risk: "Long-term quality risk",
  };
  return labels[classification];
}

function classify(
  horizon: InvestmentHorizon,
  input: {
    score: number;
    impairmentRisk: number;
    idiosyncrasyScore: number;
    priceDislocation: number;
    absolutePriceDamage: number;
    quality: number;
  },
): OpportunityClassification {
  if (horizon === "five_to_ten") {
    if (input.impairmentRisk >= 55 || input.quality <= 40) return "quality_risk";
    if (input.score >= 70 && input.impairmentRisk < 35) return "quality_profile";
    return "quality_watch";
  }
  if (input.impairmentRisk >= 50 && input.score >= 50) return "possible_value_trap";
  if (input.absolutePriceDamage >= 60 && input.quality >= 60 && input.idiosyncrasyScore < 40) {
    return "sector_washout";
  }
  if (horizon === "one_to_three") {
    if (input.score >= 70 && input.impairmentRisk < 35 && input.idiosyncrasyScore >= 60) {
      return "broken_stock";
    }
    if (input.score >= 58 && input.impairmentRisk < 45) return "recovery_watch";
    return "no_signal";
  }
  if (input.score >= 70 && input.impairmentRisk < 35) return "durable_candidate";
  if (input.score >= 58 && input.impairmentRisk < 45) return "recovery_watch";
  return "no_signal";
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 50));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function scaleToUnit(value: number, start: number, end: number): number {
  return clamp01((value - start) / Math.max(0.0001, end - start));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
