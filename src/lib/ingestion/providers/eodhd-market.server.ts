import { canUse, ensureQuota, recordCall } from "./quota.server";
import { ProviderError } from "./types";

const BASE_URL = "https://eodhd.com/api";
export const EODHD_PAID_DAILY_LIMIT_UNITS = 100_000;
export const EODHD_FREE_DAILY_LIMIT_UNITS = 20;
export const EODHD_BULK_EXCHANGE_UNITS = 100;

export type ManagedMarket = "US" | "UK" | "EU";

export interface EodhdExchangeTarget {
  code: "US" | "LSE" | "XETRA" | "PA" | "AS";
  market: ManagedMarket;
  countryIso2: "US" | "GB" | "DE" | "FR" | "NL";
  countryName: string;
  defaultCurrency: string;
  mic: string | null;
}

export const EODHD_EXCHANGE_TARGETS: EodhdExchangeTarget[] = [
  { code: "US", market: "US", countryIso2: "US", countryName: "United States", defaultCurrency: "USD", mic: null },
  { code: "LSE", market: "UK", countryIso2: "GB", countryName: "United Kingdom", defaultCurrency: "GBP", mic: "XLON" },
  { code: "XETRA", market: "EU", countryIso2: "DE", countryName: "Germany", defaultCurrency: "EUR", mic: "XETR" },
  { code: "PA", market: "EU", countryIso2: "FR", countryName: "France", defaultCurrency: "EUR", mic: "XPAR" },
  { code: "AS", market: "EU", countryIso2: "NL", countryName: "Netherlands", defaultCurrency: "EUR", mic: "XAMS" },
];

export interface EodhdSymbolRow {
  Code?: string;
  Name?: string;
  Country?: string;
  Exchange?: string;
  Currency?: string;
  Type?: string;
  Isin?: string | null;
}

export interface EodhdBulkEodRow {
  code?: string;
  name?: string;
  exchange_short_name?: string;
  date?: string;
  MarketCapitalization?: number | string | null;
  market_capitalization?: number | string | null;
  open?: number | string | null;
  high?: number | string | null;
  low?: number | string | null;
  close?: number | string | null;
  adjusted_close?: number | string | null;
  volume?: number | string | null;
  ema_50d?: number | string | null;
  ema_200d?: number | string | null;
  hi_250d?: number | string | null;
  lo_250d?: number | string | null;
  avgvol_14d?: number | string | null;
  avgvol_50d?: number | string | null;
  avgvol_200d?: number | string | null;
}

export interface EodhdDailyRow {
  date?: string;
  open?: number | string | null;
  high?: number | string | null;
  low?: number | string | null;
  close?: number | string | null;
  adjusted_close?: number | string | null;
  volume?: number | string | null;
}

export interface EodhdAccount {
  subscriptionType?: string;
  apiRequests?: number;
  apiRequestsDate?: string;
  dailyRateLimit?: number;
  extraLimit?: number;
}

export function isEodhdConfigured(): boolean {
  return Boolean(process.env.EODHD_API_KEY);
}

export async function fetchEodhdAccount(): Promise<EodhdAccount> {
  const payload = await requestJson("/internal-user", {}, 1);
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as EodhdAccount
    : {};
}

export async function fetchEodhdSymbolList(exchange: string): Promise<EodhdSymbolRow[]> {
  const payload = await requestJson(
    `/exchange-symbol-list/${encodeURIComponent(exchange)}`,
    { fmt: "json", type: "common_stock" },
    1,
  );
  if (!Array.isArray(payload)) throw new ProviderError("EODHD symbol list returned a non-array payload", "bad_response");
  return payload as EodhdSymbolRow[];
}

export async function fetchEodhdBulkEod(
  exchange: string,
  options: { date?: string; extended?: boolean } = {},
): Promise<EodhdBulkEodRow[]> {
  const payload = await requestJson(
    `/eod-bulk-last-day/${encodeURIComponent(exchange)}`,
    {
      fmt: "json",
      ...(options.date ? { date: options.date } : {}),
      ...(options.extended ? { filter: "extended" } : {}),
    },
    EODHD_BULK_EXCHANGE_UNITS,
  );
  if (!Array.isArray(payload)) throw new ProviderError("EODHD bulk EOD returned a non-array payload", "bad_response");
  return payload as EodhdBulkEodRow[];
}

export async function fetchEodhdDaily(
  symbolWithExchange: string,
  options: { from?: string; to?: string } = {},
): Promise<EodhdDailyRow[]> {
  const payload = await requestJson(
    `/eod/${encodeURIComponent(symbolWithExchange)}`,
    {
      fmt: "json",
      period: "d",
      ...(options.from ? { from: options.from } : {}),
      ...(options.to ? { to: options.to } : {}),
    },
    1,
  );
  if (!Array.isArray(payload)) throw new ProviderError("EODHD historical EOD returned a non-array payload", "bad_response");
  return payload as EodhdDailyRow[];
}

/** Translate an EODHD listing exchange into the MIC stored in `assets.exchange`. */
export function eodhdExchangeToMic(exchange: string | null | undefined): string | null {
  const value = (exchange ?? "").trim().toUpperCase();
  if (!value) return null;
  if (value.includes("NASDAQ") || value === "NMFQS") return "XNAS";
  if (value === "NYSE" || value === "NEW YORK STOCK EXCHANGE") return "XNYS";
  if (value === "AMEX" || value === "NYSE MKT" || value === "NYSE AMERICAN") return "XASE";
  if (value === "LSE" || value === "LONDON STOCK EXCHANGE") return "XLON";
  if (value === "XETRA") return "XETR";
  if (value === "PA" || value === "EURONEXT PARIS") return "XPAR";
  if (value === "AS" || value === "EURONEXT AMSTERDAM") return "XAMS";
  return null;
}

export function micToEodhdExchange(mic: string | null | undefined): EodhdExchangeTarget["code"] | null {
  switch ((mic ?? "").trim().toUpperCase()) {
    case "XNAS":
    case "XNYS":
    case "XASE":
      return "US";
    case "XLON":
      return "LSE";
    case "XETR":
      return "XETRA";
    case "XPAR":
      return "PA";
    case "XAMS":
      return "AS";
    default:
      return null;
  }
}

export function eodhdTicker(symbol: string, mic: string | null | undefined): string | null {
  const exchange = micToEodhdExchange(mic);
  if (!exchange) return null;
  return `${symbol.trim().toUpperCase()}.${exchange}`;
}

export function eodhdNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function eodhdErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const parts = [record.code, record.message, record.details, record.hint]
      .filter((value) => value !== null && value !== undefined && String(value).trim())
      .map(String);
    if (parts.length) return parts.join(" · ");
    try { return JSON.stringify(record); } catch { return String(error); }
  }
  return String(error);
}

async function requestJson(
  path: string,
  params: Record<string, string>,
  units: number,
): Promise<unknown> {
  const key = process.env.EODHD_API_KEY;
  if (!key) throw new ProviderError("EODHD_API_KEY missing", "auth");

  // Use the paid-plan ceiling as the local accounting capacity. Production
  // jobs remain disabled until diagnostics confirms the account entitlement;
  // the account diagnostic reports EODHD's authoritative dailyRateLimit.
  await ensureQuota("eodhd", EODHD_PAID_DAILY_LIMIT_UNITS);
  const gate = await canUse("eodhd", EODHD_PAID_DAILY_LIMIT_UNITS, units);
  if (!gate.ok) throw new ProviderError(gate.reason ?? "EODHD quota unavailable", "rate_limit", 429);

  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("api_token", key);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);

  let response: Response;
  try {
    response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  } catch (error) {
    const detail = eodhdErrorMessage(error);
    await recordCall("eodhd", "error", detail, units);
    throw new ProviderError(detail, "network");
  }

  const body = await safeBody(response);
  if (!response.ok) {
    const message = providerMessage(response.status, body);
    if (response.status === 401) {
      await recordCall("eodhd", "auth", message, units);
      throw new ProviderError(message, "auth", response.status);
    }
    if (response.status === 403) {
      await recordCall("eodhd", "entitlement", message, units);
      throw new ProviderError(message, "entitlement", response.status);
    }
    if (response.status === 429) {
      await recordCall("eodhd", "rate_limit", message, units);
      throw new ProviderError(message, "rate_limit", response.status);
    }
    if (response.status === 404) {
      await recordCall("eodhd", "error", message, units);
      throw new ProviderError(message, "not_found", response.status);
    }
    await recordCall("eodhd", "error", message, units);
    throw new ProviderError(message, "bad_response", response.status);
  }

  await recordCall("eodhd", "ok", undefined, units);
  return body;
}

async function safeBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text) as unknown; } catch { return text.slice(0, 500); }
}

function providerMessage(status: number, body: unknown): string {
  if (typeof body === "string" && body.trim()) return `EODHD HTTP ${status}: ${body.slice(0, 300)}`;
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const message = record.message ?? record.error ?? record.detail;
    if (message) return `EODHD HTTP ${status}: ${String(message)}`;
  }
  return `EODHD HTTP ${status}`;
}