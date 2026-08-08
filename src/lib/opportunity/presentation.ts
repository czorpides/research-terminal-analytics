import {
  computeResearchConvictionV2,
  type ConvictionV2Result,
} from "./conviction-v2";
import {
  assessDiscoveryRoutes,
  type DiscoveryProfile,
} from "./discovery-routes";
import {
  assessFundamentalOpportunity,
  assessTechnicalTiming,
  type FundamentalOpportunityAssessment,
  type TechnicalTimingAssessment,
} from "./fundamental-timing";
import type {
  InstitutionalAnalysis,
  InstitutionalTier,
} from "./institutional-model";
import type { OpportunityCandidate } from "./workspace.functions";

export interface PresentedOpportunity {
  candidate: OpportunityCandidate;
  conviction: ConvictionV2Result;
  institutional: InstitutionalAnalysis | null;
  discovery: DiscoveryProfile;
  fundamental: FundamentalOpportunityAssessment;
  timing: TechnicalTimingAssessment;
  score: number;
  coverage: number;
  tier: InstitutionalTier;
  hardRisks: string[];
  warnings: string[];
}

export function presentOpportunityCandidate(
  candidate: OpportunityCandidate,
  institutional: InstitutionalAnalysis | null,
): PresentedOpportunity {
  const conviction = assessCandidate(candidate);
  const discovery = assessDiscoveryRoutes({ candidate, conviction, institutional });
  const fundamental = assessFundamentalOpportunity(candidate, institutional);
  const timing = assessTechnicalTiming(candidate);
  const hardRisks = unique([
    ...(institutional?.hardRisks ?? []),
    ...conviction.hardRisks,
    ...fundamental.risks,
  ]);
  const warnings = unique([
    ...(institutional?.warnings ?? []),
    ...conviction.warnings,
    ...fundamental.warnings,
    ...timing.warnings,
  ]);

  // The displayed Radar score is now a fundamental-opportunity score. Technical
  // confirmation controls *when* a qualified idea can be promoted, but cannot
  // make a deteriorating or expensive company look fundamentally better.
  const rawScore = fundamental.score;
  const supportingCoverage = institutional?.coverage ?? candidate.horizons.one_to_three.dataConfidence;
  const coverage = fundamental.coverage * 0.65 + supportingCoverage * 0.35;

  let tier: InstitutionalTier;
  if (hardRisks.length || fundamental.state === "risk") {
    tier = "avoid";
  } else if (fundamental.state === "insufficient") {
    tier = "insufficient";
  } else if (fundamental.state === "qualified") {
    if (timing.state === "confirmed") {
      tier = rawScore >= 70 && coverage >= 55 ? "priority" : "qualified";
    } else {
      // A cheap, durable company can remain on the research queue while the
      // chart is still basing/markdown, but it is not promoted into an entry tier.
      tier = "watch";
    }
  } else if (timing.state === "confirmed" || timing.state === "basing") {
    tier = "watch";
  } else {
    tier = discovery.readiness === "coverage_gap" ? "insufficient" : "insufficient";
  }

  return {
    candidate,
    conviction,
    institutional,
    discovery,
    fundamental,
    timing,
    score: round1(hardRisks.length ? Math.min(rawScore, 34) : rawScore),
    coverage: round1(coverage),
    tier,
    hardRisks,
    warnings,
  };
}

function assessCandidate(candidate: OpportunityCandidate): ConvictionV2Result {
  const result = candidate.horizons.one_to_three;
  const isFinancial = candidate.industryCode === "SEC_FIN";
  return computeResearchConvictionV2({
    valuation: candidate.evidence.valuationCompression?.value ?? null,
    quality: candidate.evidence.fundamentalResilience?.value ?? null,
    priceDislocation: candidate.evidence.priceDislocation?.value ?? null,
    recoveryConfirmation: candidate.evidence.recoveryConfirmation?.value ?? null,
    balanceSheetDurability: candidate.evidence.balanceSheetDurability?.value ?? null,
    impairmentRisk: candidate.evidence.impairmentRisk?.value ?? null,
    dataConfidence: result.dataConfidence,
    sectorModelBlocked: result.modelState === "blocked" && !isFinancial,
    piotroski: candidate.fundamentalModels.piotroski,
    magicFormula: {
      state: candidate.fundamentalModels.magicFormula.state,
      universePercentile: candidate.fundamentalModels.magicFormula.universePercentile,
      industryPercentile: candidate.fundamentalModels.magicFormula.industryPercentile,
      exclusionReason: candidate.fundamentalModels.magicFormula.exclusionReason,
    },
  });
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
