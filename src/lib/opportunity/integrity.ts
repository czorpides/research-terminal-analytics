import {
  classifyFundamentalFreshness,
  classifyTechnicalFreshness,
  freshnessBlocks,
  freshnessConfidenceMultiplier,
  type CandidateEvidenceFreshness,
} from "./evidence-freshness";
import {
  missingSignal,
  scoreOpportunityHorizon,
  type InvestmentHorizon,
  type OpportunityEvidence,
  type OpportunitySignalKey,
} from "./model";
import type {
  OpportunityCandidate,
  OpportunityRadarWorkspace,
} from "./workspace.functions";
import type { OpportunityFreshnessPayload } from "./integrity.functions";

declare module "./workspace.functions" {
  interface OpportunityCandidate {
    evidenceFreshness?: CandidateEvidenceFreshness;
  }
}

const HORIZONS: InvestmentHorizon[] = ["one_to_three", "three_to_five", "five_to_ten"];
const TECHNICAL_KEYS: OpportunitySignalKey[] = [
  "absolutePriceDamage",
  "priceDislocation",
  "recoveryConfirmation",
  "recoveryDurability",
  "idiosyncrasy",
];
const FUNDAMENTAL_KEYS: OpportunitySignalKey[] = [
  "fundamentalResilience",
  "valuationCompression",
  "sustainableEarnings",
  "balanceSheetDurability",
  "recoveryDurability",
  "businessQuality",
  "entryValuation",
  "impairmentRisk",
];

/**
 * Apply freshness as an evidence-integrity control after the base discovery
 * model has built its candidate set. This deliberately does not change any
 * model weights: stale inputs are removed or confidence-docked, then the same
 * horizon scorer recalculates eligibility.
 */
export function applyOpportunityEvidenceIntegrity(
  workspace: OpportunityRadarWorkspace,
  payload: OpportunityFreshnessPayload,
): OpportunityRadarWorkspace {
  // Fail soft during code-before-migration deployment. Once the migration is
  // live the 3,000 active assets should all have a compact telemetry row.
  if (!payload.latestBulkFinishedAt && payload.assets.length === 0) return workspace;

  const freshnessByAsset = new Map(payload.assets.map((row) => [row.assetId, row]));
  const candidates = workspace.candidates.map((candidate) => {
    const row = freshnessByAsset.get(candidate.assetId);
    const freshness: CandidateEvidenceFreshness = {
      technical: classifyTechnicalFreshness(
        [row?.momentumAt, row?.trendAt, row?.volatilityAt],
        payload.latestBulkFinishedAt,
      ),
      fundamentals: classifyFundamentalFreshness(row?.fundamentalAsOf),
    };
    const evidence = enforceFreshness(candidate.evidence, freshness);
    const blocks = freshnessBlocks(freshness);
    const sectorBlocks = sectorModelBlocks(candidate.industryCode);
    const horizons = Object.fromEntries(
      HORIZONS.map((horizon) => [
        horizon,
        scoreOpportunityHorizon(horizon, evidence, [...sectorBlocks, ...blocks]),
      ]),
    ) as OpportunityCandidate["horizons"];

    const funnel = Object.fromEntries(
      HORIZONS.map((horizon) => {
        const existing = candidate.funnel[horizon];
        return [
          horizon,
          blocks.length === 0
            ? existing
            : {
                ...existing,
                nominated: false,
                shadowPriority: Math.min(existing.shadowPriority, 45),
                detail: `${existing.detail} Evidence-integrity hold: ${blocks.join(" ")}`,
              },
        ];
      }),
    ) as OpportunityCandidate["funnel"];

    return {
      ...candidate,
      evidence,
      horizons,
      funnel,
      evidenceFreshness: freshness,
      narrative: {
        ...candidate.narrative,
        detail: `${candidate.narrative.detail} ${freshnessSummary(freshness)}`,
        watch: unique([
          ...blocks,
          ...candidate.narrative.watch,
        ]),
      },
    } satisfies OpportunityCandidate;
  });

  return {
    ...workspace,
    calcVersion: `${workspace.calcVersion}.integrity-v1`,
    candidates,
    horizonSummaries: workspace.horizonSummaries.map((summary) => {
      const results = candidates.map((candidate) => candidate.horizons[summary.horizon]);
      return {
        ...summary,
        eligible: results.filter((result) => result.modelState === "eligible").length,
        shadow: results.filter((result) => result.modelState === "shadow").length,
        blocked: results.filter((result) => result.modelState === "blocked").length,
        medianConfidence: round1(median(results.map((result) => result.dataConfidence))),
      };
    }),
    modelNote: `${workspace.modelNote} Evidence-integrity overlay: long-horizon technicals use adjusted closes; stale technical/fundamental inputs cannot promote a candidate to production eligibility.`,
  };
}

function enforceFreshness(
  base: OpportunityEvidence,
  freshness: CandidateEvidenceFreshness,
): OpportunityEvidence {
  const evidence: OpportunityEvidence = { ...base };

  if (["stale", "missing"].includes(freshness.technical.state)) {
    for (const key of TECHNICAL_KEYS) {
      evidence[key] = missingSignal(
        key,
        `Technical evidence is ${freshness.technical.state}; ${freshness.technical.detail}`,
      );
    }
  }

  if (["stale", "missing"].includes(freshness.fundamentals.state)) {
    for (const key of FUNDAMENTAL_KEYS) {
      evidence[key] = missingSignal(
        key,
        `Fundamental evidence is ${freshness.fundamentals.state}; ${freshness.fundamentals.detail}`,
      );
    }
  } else if (freshness.fundamentals.state === "warning") {
    const multiplier = freshnessConfidenceMultiplier("warning");
    for (const key of FUNDAMENTAL_KEYS) {
      const signal = evidence[key];
      if (!signal || signal.value === null) continue;
      evidence[key] = {
        ...signal,
        confidence: Math.round(signal.confidence * multiplier),
        detail: `${signal.detail} Freshness warning: ${freshness.fundamentals.detail}`,
      };
    }
  }

  return evidence;
}

function sectorModelBlocks(industryCode: string | null): string[] {
  if (industryCode === "SEC_FIN") {
    return [
      "Financial companies need a separate capital, liquidity, credit-quality and book-value model.",
    ];
  }
  if (industryCode === "SEC_RE") {
    return ["REITs need a separate FFO, NAV, loan-to-value, occupancy and refinancing model."];
  }
  return [];
}

function freshnessSummary(freshness: CandidateEvidenceFreshness): string {
  const technical = freshness.technical.asOf
    ? `Technical scores: ${freshness.technical.state} as of ${freshness.technical.asOf}.`
    : `Technical scores: ${freshness.technical.state}.`;
  const fundamentals = freshness.fundamentals.asOf
    ? `Fundamentals: ${freshness.fundamentals.state} as of ${freshness.fundamentals.asOf}.`
    : `Fundamentals: ${freshness.fundamentals.state}.`;
  return `${technical} ${fundamentals}`;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
