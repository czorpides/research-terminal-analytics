import type { ProviderCode } from "./types";

export interface AssetProviderIdentity {
  id: string;
  symbol: string;
  exchange: string | null;
}

export type ProviderSymbolMap = Record<ProviderCode, string | null>;

/**
 * Deterministic provider-symbol derivation from the canonical internal asset
 * identity. These values are adapters only; asset_id remains the primary key.
 */
export function deriveProviderSymbol(
  provider: ProviderCode,
  symbol: string,
  exchange: string | null,
): string | null {
  const canonical = symbol.trim().toUpperCase();
  const mic = (exchange ?? "").trim().toUpperCase();
  if (!canonical) return null;

  if (provider === "eodhd") {
    if (["XNYS", "XNAS", "XASE"].includes(mic)) return `${canonical}.US`;
    if (mic === "XLON") return `${canonical}.LSE`;
    if (mic === "XETR") return `${canonical}.XETRA`;
    if (mic === "XPAR") return `${canonical}.PA`;
    if (mic === "XAMS") return `${canonical}.AS`;
    return null;
  }

  if (provider === "fmp") {
    if (["XNYS", "XNAS", "XASE"].includes(mic)) return canonical;
    if (mic === "XLON") return `${canonical}.L`;
    if (mic === "XETR") return `${canonical}.DE`;
    if (mic === "XPAR") return `${canonical}.PA`;
    if (mic === "XAMS") return `${canonical}.AS`;
    return null;
  }

  if (provider === "twelvedata") {
    if (mic === "XNYS") return `${canonical}|NYSE`;
    if (mic === "XNAS") return `${canonical}|NASDAQ`;
    if (mic === "XASE") return `${canonical}|AMEX`;
    if (mic === "XLON") return `${canonical}|LSE`;
    if (mic === "XETR") return `${canonical}|XETR`;
    if (mic === "XPAR") return `${canonical}|XPAR`;
    if (mic === "XAMS") return `${canonical}|XAMS`;
    return null;
  }

  if (provider === "tiingo") {
    return ["XNYS", "XNAS", "XASE"].includes(mic) ? canonical : null;
  }

  if (provider === "alphavantage") {
    return ["XNYS", "XNAS", "XASE"].includes(mic) ? canonical : null;
  }

  return null;
}
