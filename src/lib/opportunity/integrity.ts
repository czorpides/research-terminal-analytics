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
    const normalizedCandidate = normalizeCandidateMarket(candidate);
    const row = freshnessByAsset.get(normalizedCandidate.assetId);
    const freshness: CandidateEvidenceFreshness = {
      technical: classifyTechnicalFreshness(
        [row?.momentumAt, row?.trendAt, row?.volatilityAt],
        payload.latestBulkFinishedAt,
      ),
      fundamentals: classifyFundamentalFreshness(row?.fundamentalAsOf),
    };
    const evidence = enforceFreshness(normalizedCandidate.evidence, freshness);
    const blocks = freshnessBlocks(freshness);
    const technicalHold = freshness.technical.state === "stale" || freshness.technical.state === "missing";
    const sectorBlocks = sectorModelBlocks(normalizedCandidate.industryCode);
    const horizons = Object.fromEntries(
      HORIZONS.map((horizon) => [
        horizon,
        // Freshness is represented by missing/low-confidence evidence so the
        // existing unresolved-critical rules fail closed without converting a
        // data-age problem into a company-level hard Avoid. Only genuine sector
        // model incompatibilities use the scorer's additional-block channel.
        scoreOpportunityHorizon(horizon, evidence, sectorBlocks),
      ]),
    ) as OpportunityCandidate["horizons"];

    const funnel = Object.fromEntries(
      HORIZONS.map((horizon) => {
        const existing = normalizedCandidate.funnel[horizon];
        return [
          horizon,
          technicalHold
            ? {
                ...existing,
                nominated: false,
                shadowPriority: Math.min(existing.shadowPriority, 45),
                detail: `${existing.detail} Market-evidence hold: ${freshness.technical.detail}`,
              }
            : {
                ...existing,
                detail: blocks.length
                  ? `${existing.detail} Evidence-integrity warning: ${blocks.join(" ")}`
                  : existing.detail,
              },
        ];
      }),
    ) as OpportunityCandidate["funnel"];

    return {
      ...normalizedCandidate,
      evidence,
      horizons,
      funnel,
      evidenceFreshness: freshness,
      narrative: {
        ...normalizedCandidate.narrative,
        detail: `${normalizedCandidate.narrative.detail} ${freshnessSummary(freshness)}`,
        watch: unique([
          ...blocks,
          ...normalizedCandidate.narrative.watch,
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
    coverage: modernCoverage(candidates),
    capabilities: workspace.capabilities.map((capability) =>
      capability.capability === "Market prices and technical history"
        ? {
            ...capability,
            state: "live" as const,
            currentUse: "EODHD provides the managed US/UK/EU universe, adjusted EOD history and daily whole-exchange refresh; raw close remains the displayed/traded price.",
            productionRequirement: "Maintain global >=95% and regional >=90% fresh-price, 252-session and technical-score coverage.",
          }
        : capability,
    ),
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

function modernCoverage(candidates: OpportunityCandidate[]): OpportunityRadarWorkspace["coverage"] {
  const counts = { US: 0, UK: 0, EU: 0 };
  for (const candidate of candidates) {
    if (candidate.countryCode === "US") counts.US += 1;
    else if (candidate.countryCode === "GB" || candidate.countryCode === "UK") counts.UK += 1;
    else if (["DE", "FR", "NL"].includes(candidate.countryCode)) counts.EU += 1;
  }
  return [
    {
      market: "United States",
      code: "US",
      state: "shadow",
      trackedAssets: counts.US,
      available: "EODHD managed-universe membership, adjusted daily history and fresh technical scoring; FMP fundamentals where mapped.",
      missing: "Fundamental and statement coverage is still being expanded and freshness-gated asset by asset.",
      activationRule: "Market evidence >=95% globally, >=90% in-region, with critical candidate evidence current before production eligibility.",
    },
    {
      market: "United Kingdom",
      code: "UK",
      state: "shadow",
      trackedAssets: counts.UK,
      available: "EODHD LSE universe and adjusted daily history are live; provider-symbol identity maps FMP/Twelve Data separately.",
      missing: "Fundamental/statement coverage must catch up across the UK sleeve; no bare-ticker assumptions are permitted.",
      activationRule: "At least 90% regional EOD, 252-session history and fresh technical-score coverage, plus current critical evidence per candidate.",
    },
    {
      market: "Continental Europe",
      code: "EU",
      state: "shadow",
      trackedAssets: counts.EU,
      available: "EODHD Xetra, Paris and Amsterdam universe/history are live with exchange-qualified provider mappings.",
      missing: "FMP provider symbols require successful-response verification and fundamental/statement coverage remains incomplete.",
      activationRule: "At least 90% regional EOD, 252-session history and fresh technical-score coverage, with no stale critical evidence promoted to eligibility.",
    },
  ];
}

function normalizeCandidateMarket(candidate: OpportunityCandidate): OpportunityCandidate {
  if (candidate.countryCode !== "UNMAPPED") return candidate;
  const countryCode = candidate.exchange === "XASE"
    ? "US"
    : candidate.exchange === "XETR"
      ? "DE"
      : candidate.exchange === "XPAR"
        ? "FR"
        : candidate.exchange === "XAMS"
          ? "NL"
          : candidate.countryCode;
  return countryCode === candidate.countryCode ? candidate : { ...candidate, countryCode };
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
