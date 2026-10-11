import {
  PILOT_SYMBOLS, hasThreeConsecutiveSecYears,
  type SecPilotAsset,
} from "./pilot-plan.ts";

export type SecControlledMode = "repair" | "expand";
export const SEC_CONTROLLED_LIMITS: Record<SecControlledMode, number> = {
  repair: 2,
  expand: 10,
};

export function parseSecControlledMode(value: unknown): SecControlledMode {
  if (value !== "repair" && value !== "expand")
    throw new Error("SEC mode must be repair or expand");
  return value;
}

export interface SecPlanCandidate {
  assetId: string;
  symbol: string;
  existingYears: number;
  periodEnds: string[];
}

export interface SecControlPlan {
  mode: SecControlledMode;
  candidates: SecPlanCandidate[];
  pilotSize: number;
  verifiedIdentities: number;
  alreadyCovered: number;
  incompleteHistory: number;
  untouched: number;
  coolingDown: number;
  integrityBlocked: number;
  maxPerRequest: 2;
  maxPerRun: number;
  status: "ready" | "none_eligible";
}

const SEC_US_EXCHANGES = new Set(["XNAS", "XNYS", "XASE"]);

/**
 * Pure, deterministic owner-initiated SEC plan. No provider requests, DML,
 * deduced missing facts, or unapproved widening of the curated 100-name pool.
 * Repair checks only issuers with incomplete *existing* SEC filings. Expansion
 * checks only issuers without SEC filings; these never consume repair slots.
 */
export function planSecControlledWave(input: {
  mode: SecControlledMode;
  assets: readonly SecPilotAsset[];
  periodsByAsset: ReadonlyMap<string, readonly string[]>;
  coolingAssetIds: ReadonlySet<string>;
  integrityBlockedAssetIds: ReadonlySet<string>;
}): SecControlPlan {
  const { mode, assets, periodsByAsset, coolingAssetIds, integrityBlockedAssetIds } = input;
  const candidates: SecPlanCandidate[] = [];
  let verifiedIdentities=0, alreadyCovered=0, incompleteHistory=0, untouched=0;
  let coolingDown=0, integrityBlocked=0;
  for (const symbol of PILOT_SYMBOLS) {
    const matches = assets.filter(a =>
      a.symbol.toUpperCase() === symbol &&
      a.currency === "USD" && a.exchange !== null &&
      SEC_US_EXCHANGES.has(a.exchange),
    );
    // Two asset IDs for one ticker is ambiguous. Do not select either.
    if (matches.length !== 1) continue;
    const asset = matches[0]!;
    verifiedIdentities++;
    const periodEnds = [...new Set(periodsByAsset.get(asset.id) ?? [])].sort().reverse();
    const covered = hasThreeConsecutiveSecYears(periodEnds);
    const partial = periodEnds.length > 0 && !covered;
    if (covered) alreadyCovered++;
    else if (partial) incompleteHistory++;
    else untouched++;
    if (coolingAssetIds.has(asset.id)) coolingDown++;
    if (integrityBlockedAssetIds.has(asset.id)) integrityBlocked++;
    if (candidates.length >= SEC_CONTROLLED_LIMITS[mode] ||
        covered || coolingAssetIds.has(asset.id) ||
        integrityBlockedAssetIds.has(asset.id)) continue;
    if ((mode === "repair" && !partial) ||
        (mode === "expand" && periodEnds.length > 0)) continue;
    candidates.push({
      assetId: asset.id,
      symbol,
      existingYears: periodEnds.length,
      periodEnds,
    });
  }
  return {
    mode, candidates, pilotSize: PILOT_SYMBOLS.length,
    verifiedIdentities, alreadyCovered, incompleteHistory, untouched,
    coolingDown, integrityBlocked, maxPerRequest: 2,
    maxPerRun: SEC_CONTROLLED_LIMITS[mode],
    status: candidates.length ? "ready" : "none_eligible",
  };
}
