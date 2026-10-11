/**
 * Pilot only: deliberately varied US sectors and fiscal-year ends.
 * A second button press skips companies with existing SEC ledger filings.
 * Do not confuse this curated cohort with a representative 3,000-stock backfill.
 */
export const PILOT_SYMBOLS = [
  "ADBE", "AMZN", "COST", "GOOGL", "JPM",
  "KO", "LLY", "META", "NFLX", "NVDA",
  "ORCL", "PG", "TSLA", "UNH", "V",
] as const;

export interface SecPilotAsset {
  id: string;
  symbol: string;
  exchange: string | null;
  currency: string | null;
}
export interface SecPilotCandidate {
  assetId: string;
  symbol: string;
}
const SEC_US_EXCHANGES = new Set(["XNYS", "XNAS", "XASE"]);

export function pickSecPilotCandidates(
  assets: SecPilotAsset[],
  coveredAssetIds: readonly string[],
  count = 10,
): SecPilotCandidate[] {
  if (!Number.isInteger(count) || count < 1 || count > 10) {
    throw new Error("SEC pilot must request between one and ten companies");
  }
  const covered = new Set(coveredAssetIds);
  const out: SecPilotCandidate[] = [];
  for (const symbol of PILOT_SYMBOLS) {
    const matches = assets.filter(a =>
      a.symbol.toUpperCase() === symbol &&
      a.currency === "USD" &&
      SEC_US_EXCHANGES.has(a.exchange),
    );
    // Never guess between ambiguous issuer identities or aliases.
    if (matches.length !== 1 || covered.has(matches[0]!.id)) continue;
    out.push({ assetId: matches[0]!.id, symbol });
    if (out.length === count) break;
  }
  return out;
}
