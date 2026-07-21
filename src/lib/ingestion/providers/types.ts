export interface PriceBar {
  date: string; // YYYY-MM-DD
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  adjClose?: number | null;
  volume: number | null;
}

export type ProviderCode = "tiingo" | "twelvedata" | "fmp" | "alphavantage";

export interface ProviderMeta {
  code: ProviderCode;
  name: string;
  dailyLimit: number;
  minMsBetweenCalls: number;
  priority: number; // lower = preferred
  envKey: string;
  tier: "tier2_regulated" | "tier3_reputable";
}

export interface PriceProvider extends ProviderMeta {
  isConfigured(): boolean;
  ping(): Promise<{ ok: boolean; detail: string }>;
  fetchDaily(symbol: string, opts: { from?: string; to?: string }): Promise<PriceBar[]>;
}

export class ProviderError extends Error {
  constructor(message: string, readonly code: "auth" | "rate_limit" | "not_found" | "bad_response" | "network", readonly status?: number) {
    super(message);
    this.name = "ProviderError";
  }
}

export const PROVIDERS_META: ProviderMeta[] = [
  { code: "tiingo", name: "Tiingo", dailyLimit: 1000, minMsBetweenCalls: 100, priority: 1, envKey: "TIINGO_API_KEY", tier: "tier2_regulated" },
  { code: "twelvedata", name: "Twelve Data", dailyLimit: 800, minMsBetweenCalls: 8000, priority: 2, envKey: "TWELVEDATA_API_KEY", tier: "tier3_reputable" },
  { code: "fmp", name: "Financial Modeling Prep", dailyLimit: 250, minMsBetweenCalls: 250, priority: 3, envKey: "FMP_API_KEY", tier: "tier2_regulated" },
  { code: "alphavantage", name: "Alpha Vantage", dailyLimit: 25, minMsBetweenCalls: 15000, priority: 4, envKey: "ALPHAVANTAGE_API_KEY", tier: "tier3_reputable" },
];