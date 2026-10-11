/**
 * Phase 2E: curated 100-ticker US pilot candidate pool, not a complete SEC
 * census or valuation universe. The production registry and SEC ticker/CIK
 * evidence must still verify each candidate before any actual import.
 * Each manual invocation is bounded to ten unique, eligible companies.
 */
export const PILOT_SYMBOLS = [
  "ADBE", "AMZN", "COST", "GOOGL", "JPM", "KO", "LLY", "META", "NFLX", "NVDA", "ORCL", "PG", "TSLA", "UNH", "V",
  "AAPL", "MSFT", "AMD", "AVGO", "QCOM", "INTC", "IBM", "CSCO", "TXN", "MU", "AMAT", "KLAC", "LRCX", "SNPS", "CDNS", "CRM", "NOW", "INTU",
  "BAC", "C", "WFC", "GS", "MS", "BLK", "SCHW", "AXP", "SPGI", "MCO", "CME", "ICE", "COF", "PNC",
  "WMT", "TGT", "HD", "LOW", "MCD", "SBUX", "NKE", "DIS", "CMCSA", "PEP", "TJX", "ROST", "BKNG", "ABNB", "UBER", "DASH",
  "JNJ", "PFE", "MRK", "ABBV", "ABT", "TMO", "DHR", "BMY", "AMGN", "GILD", "ISRG", "SYK",
  "CAT", "DE", "HON", "UNP", "UPS", "FDX", "RTX", "LMT", "NOC", "BA", "MMM", "EMR", "GE",
  "XOM", "CVX", "COP", "SLB", "VLO", "NEE", "DUK", "SO", "AEP",
  "PLD", "EQIX", "O",
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
      a.exchange !== null && SEC_US_EXCHANGES.has(a.exchange),
    );
    // Never guess between ambiguous issuer identities or aliases.
    if (matches.length !== 1 || covered.has(matches[0]!.id)) continue;
    out.push({ assetId: matches[0]!.id, symbol });
    if (out.length === count) break;
  }
  return out;
}
