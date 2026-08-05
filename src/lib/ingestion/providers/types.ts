export interface PriceBar {
  date: string; // YYYY-MM-DD
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  adjClose?: number | null;
  volume: number | null;
}

export type ProviderCode = "tiingo" | "twelvedata" | "fmp" | "alphavantage" | "eodhd";

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

export type ProviderErrorCode =
  | "auth"
  | "entitlement"
  | "rate_limit"
  | "not_found"
  | "bad_response"
  | "network";

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly code: ProviderErrorCode,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export const PROVIDERS_META: ProviderMeta[] = [
  { code: "tiingo", name: "Tiingo", dailyLimit: 1000, minMsBetweenCalls: 100, priority: 1, envKey: "TIINGO_API_KEY", tier: "tier2_regulated" },
  { code: "twelvedata", name: "Twelve Data", dailyLimit: 800, minMsBetweenCalls: 8000, priority: 2, envKey: "TWELVEDATA_API_KEY", tier: "tier3_reputable" },
  { code: "fmp", name: "Financial Modeling Prep", dailyLimit: 250, minMsBetweenCalls: 250, priority: 3, envKey: "FMP_API_KEY", tier: "tier2_regulated" },
  { code: "alphavantage", name: "Alpha Vantage", dailyLimit: 25, minMsBetweenCalls: 15000, priority: 4, envKey: "ALPHAVANTAGE_API_KEY", tier: "tier3_reputable" },
  // EODHD's All World EOD plan is unit-based. Whole-exchange bulk EOD costs
  // 100 units; the paid plan exposes 100k units/day. It is intentionally not
  // inserted into the per-symbol failover registry yet: Swing uses it through
  // the exchange-level universe/bulk paths where its quota economics are best.
  { code: "eodhd", name: "EOD Historical Data", dailyLimit: 100000, minMsBetweenCalls: 50, priority: 5, envKey: "EODHD_API_KEY", tier: "tier3_reputable" },
];