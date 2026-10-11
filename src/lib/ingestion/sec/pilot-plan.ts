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

/**
 * An uninterrupted three-year source history requires three most-recent
 * original year ends roughly one annual reporting cycle apart. Three
 * arbitrary periods (for example 2021, 2023, 2025) do not meet this gate.
 */
export function hasThreeConsecutiveSecYears(periodEnds: readonly string[]): boolean {
  const dates = [...new Set(periodEnds.filter((value) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value + "T00:00:00Z")),
  ))].sort().reverse();
  if (dates.length < 3) return false;
  for (let index = 0; index < 2; index++) {
    const current = Date.parse(dates[index]! + "T00:00:00Z");
    const previous = Date.parse(dates[index + 1]! + "T00:00:00Z");
    const days = (current - previous) / 86_400_000;
    if (days < 330 || days > 400) return false;
  }
  return true;
}
