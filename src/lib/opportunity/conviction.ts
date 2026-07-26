import type { OpportunityClassification } from "./model";

export type ResearchTier =
  | "high_conviction"
  | "qualified"
  | "watch"
  | "avoid"
  | "insufficient";

export interface ResearchConvictionInput {
  coreScore: number;
  researchPriority: number;
  dataConfidence: number;
  evidenceCoverage: number;
  impairmentRisk: number;
  classification: OpportunityClassification;
  priceDislocation: number | null;
  quality: number | null;
  valuation: number | null;
  trend: number | null;
  momentum: number | null;
  recoveryConfirmation: number | null;
  piotroski: {
    state: "complete" | "partial" | "missing";
    score: number | null;
    provisionalScore: number | null;
    availableTests: number;
    coverage: number;
  };
  magicFormula: {
    state: "ranked" | "ineligible" | "missing";
    universePercentile: number | null;
  };
}

export interface ResearchConvictionAssessment {
  score: number;
  tier: ResearchTier;
  independentSignals: number;
  strengths: string[];
  concerns: string[];
  nextProof: string[];
}

/**
 * Practical research-priority layer.
 *
 * The production horizon score remains unchanged and retains its strict
 * point-in-time gates. This assessment answers a different question: does the
 * evidence already available justify spending analyst time on the company?
 * Independent routes are rewarded, permanent-impairment warnings are penalised,
 * and missing data creates an explicit next-proof list instead of suppressing
 * every company into an undifferentiated shadow state.
 */
export function assessResearchConviction(
  input: ResearchConvictionInput,
): ResearchConvictionAssessment {
  const quality = input.quality ?? 45;
  const valuation = input.valuation ?? 45;
  const recovery =
    input.recoveryConfirmation ?? averagePresent([input.trend, input.momentum]) ?? 45;
  const piotroski = piotroskiSignal(input.piotroski);
  const magic = input.magicFormula.universePercentile ?? 45;

  let score =
    input.coreScore * 0.25 +
    input.researchPriority * 0.12 +
    quality * 0.16 +
    valuation * 0.14 +
    recovery * 0.09 +
    piotroski.value * 0.1 +
    magic * 0.08 +
    input.dataConfidence * 0.06;

  const strengths: string[] = [];
  const concerns: string[] = [];
  const nextProof: string[] = [];
  let independentSignals = 0;

  if (valuation >= 60) {
    independentSignals += 1;
    strengths.push(`Peer-relative valuation is attractive at ${valuation.toFixed(0)}/100.`);
  } else if (valuation < 40) {
    concerns.push(`Valuation support is weak at ${valuation.toFixed(0)}/100.`);
  }

  if (quality >= 60) {
    independentSignals += 1;
    strengths.push(`Current business quality is strong at ${quality.toFixed(0)}/100.`);
  } else if (quality < 45) {
    concerns.push(`Quality evidence is weak at ${quality.toFixed(0)}/100.`);
  }

  if ((input.priceDislocation ?? 0) >= 50 && input.impairmentRisk < 45) {
    independentSignals += 1;
    score += 4;
    strengths.push(
      `Price dislocation is ${(input.priceDislocation ?? 0).toFixed(0)}/100 while impairment risk remains ${input.impairmentRisk.toFixed(0)}/100.`,
    );
  }

  if (recovery >= 58) {
    independentSignals += 1;
    strengths.push(`Trend and momentum provide recovery confirmation at ${recovery.toFixed(0)}/100.`);
  } else if (recovery < 40) {
    concerns.push(`Price recovery is not yet confirmed (${recovery.toFixed(0)}/100).`);
  }

  if (piotroski.strong) {
    independentSignals += 1;
    score += piotroski.complete ? 5 : 2;
    strengths.push(piotroski.detail);
  } else if (piotroski.weak) {
    score -= 12;
    concerns.push(piotroski.detail);
  } else if (input.piotroski.state === "missing") {
    nextProof.push("Complete enough annual statement history to calculate the nine Piotroski tests.");
  } else if (!piotroski.complete) {
    nextProof.push("Complete the remaining Piotroski tests before treating financial improvement as confirmed.");
  }

  if (input.magicFormula.state === "ranked" && magic >= 70) {
    independentSignals += 1;
    score += 4;
    strengths.push(`Magic Formula ranks in the top ${(100 - magic).toFixed(0)}% of the eligible universe.`);
  } else if (input.magicFormula.state === "missing") {
    nextProof.push("Obtain EBIT, enterprise value and capital-employed inputs for a Magic Formula rank.");
  }

  if (quality >= 60 && valuation >= 60) score += 5;
  if (quality >= 55 && valuation >= 55 && recovery >= 55) score += 3;

  if (input.impairmentRisk >= 55) {
    score -= 20;
    concerns.push(`Permanent impairment risk is elevated at ${input.impairmentRisk.toFixed(0)}/100.`);
  } else if (input.impairmentRisk >= 45) {
    score -= 8;
    concerns.push(`Impairment risk needs deeper work at ${input.impairmentRisk.toFixed(0)}/100.`);
  }

  if (input.classification === "possible_value_trap" || input.classification === "quality_risk") {
    score -= 12;
    concerns.push("The core model currently flags a possible value trap or long-term quality risk.");
  }
  if (input.dataConfidence < 25) score -= 7;
  if (input.evidenceCoverage < 25) score -= 5;

  if (input.quality === null) nextProof.push("Refresh current profitability, margin, return and leverage fundamentals.");
  if (input.valuation === null) nextProof.push("Refresh peer-relative valuation multiples and free-cash-flow evidence.");
  if (input.priceDislocation === null) nextProof.push("Complete sufficient price and peer history to measure dislocation.");
  if (input.recoveryConfirmation === null) nextProof.push("Build enough trend and momentum history to test recovery confirmation.");
  if (input.dataConfidence < 45) nextProof.push("Resolve the largest missing or proxy evidence items before a full thesis.");

  score = round1(clamp(score));
  const severeRisk =
    input.impairmentRisk >= 60 ||
    quality < 38 ||
    (input.piotroski.state === "complete" && (input.piotroski.score ?? 9) <= 2);
  const enoughFoundation =
    independentSignals >= 2 &&
    input.dataConfidence >= 25 &&
    input.evidenceCoverage >= 30 &&
    input.quality !== null &&
    input.valuation !== null;

  let tier: ResearchTier;
  if (severeRisk) {
    tier = "avoid";
  } else if (
    score >= 68 &&
    independentSignals >= 3 &&
    quality >= 55 &&
    input.impairmentRisk < 45 &&
    input.dataConfidence >= 35
  ) {
    tier = "high_conviction";
  } else if (
    score >= 58 &&
    enoughFoundation &&
    quality >= 48 &&
    input.impairmentRisk < 52
  ) {
    tier = "qualified";
  } else if (
    score >= 48 &&
    independentSignals >= 1 &&
    input.impairmentRisk < 58 &&
    quality >= 42
  ) {
    tier = "watch";
  } else if (
    input.classification === "possible_value_trap" ||
    input.classification === "quality_risk" ||
    input.impairmentRisk >= 52 ||
    quality < 42
  ) {
    tier = "avoid";
  } else {
    tier = "insufficient";
  }

  if (tier === "high_conviction") {
    nextProof.unshift("Validate the thesis against the latest filing, guidance and consensus expectations.");
  } else if (tier === "qualified") {
    nextProof.unshift("Confirm the two strongest signals in the latest results before beginning a full valuation model.");
  } else if (tier === "watch") {
    nextProof.unshift("Wait for one additional independent confirmation before committing to full research.");
  }

  return {
    score,
    tier,
    independentSignals,
    strengths: strengths.slice(0, 5),
    concerns: unique(concerns).slice(0, 5),
    nextProof: unique(nextProof).slice(0, 5),
  };
}

export function researchTierLabel(tier: ResearchTier): string {
  const labels: Record<ResearchTier, string> = {
    high_conviction: "High conviction research",
    qualified: "Qualified research",
    watch: "Watchlist",
    avoid: "Avoid / value-trap risk",
    insufficient: "Insufficient evidence",
  };
  return labels[tier];
}

export function researchTierRank(tier: ResearchTier): number {
  const ranks: Record<ResearchTier, number> = {
    high_conviction: 5,
    qualified: 4,
    watch: 3,
    insufficient: 2,
    avoid: 1,
  };
  return ranks[tier];
}

function piotroskiSignal(input: ResearchConvictionInput["piotroski"]): {
  value: number;
  strong: boolean;
  weak: boolean;
  complete: boolean;
  detail: string;
} {
  if (input.state === "complete" && input.score !== null) {
    return {
      value: (input.score / 9) * 100,
      strong: input.score >= 6,
      weak: input.score <= 3,
      complete: true,
      detail:
        input.score >= 6
          ? `Piotroski financial health confirms the setup at ${input.score}/9.`
          : `Piotroski financial health warns at ${input.score}/9.`,
    };
  }
  if (input.state === "partial" && input.availableTests >= 5) {
    const ratio = (input.provisionalScore ?? 0) / Math.max(1, input.availableTests);
    return {
      value: ratio * 100,
      strong: ratio >= 0.7,
      weak: ratio <= 0.35,
      complete: false,
      detail:
        ratio >= 0.7
          ? `Partial Piotroski evidence is positive: ${input.provisionalScore ?? 0} of ${input.availableTests} available tests pass.`
          : `Partial Piotroski evidence is weak: ${input.provisionalScore ?? 0} of ${input.availableTests} available tests pass.`,
    };
  }
  return {
    value: 45,
    strong: false,
    weak: false,
    complete: false,
    detail: "Piotroski evidence is not complete enough to confirm or reject the setup.",
  };
}

function averagePresent(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
