import {
  computeResearchConvictionV2,
  type ConvictionV2Result,
} from "./conviction-v2";
import {
  assessDiscoveryRoutes,
  type DiscoveryProfile,
} from "./discovery-routes";
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
  const hardRisks = unique([...(institutional?.hardRisks ?? []), ...conviction.hardRisks]);
  const warnings = unique([...(institutional?.warnings ?? []), ...conviction.warnings]);
  const rawScore = institutional
    ? institutional.score * 0.48 + conviction.score * 0.32 + discovery.routeScore * 0.2
    : conviction.score * 0.55 + discovery.routeScore * 0.45;
  const coverage = institutional
    ? institutional.coverage * 0.55 + conviction.coverage * 0.45
    : conviction.coverage * 0.45;

  let tier: InstitutionalTier;
  if (hardRisks.length) tier = "avoid";
  else if (discovery.readiness === "ready") {
    tier = rawScore >= 70 && coverage >= 40 ? "priority" : rawScore >= 58 ? "qualified" : "watch";
  } else if (discovery.readiness === "emerging") tier = "watch";
  else if (discovery.readiness === "coverage_gap") tier = "insufficient";
  else tier = rawScore < 38 ? "avoid" : "insufficient";

  return {
    candidate,
    conviction,
    institutional,
    discovery,
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
