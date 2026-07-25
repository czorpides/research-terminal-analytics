import { supabaseAdmin } from "@/integrations/supabase/client.server";

const FMP_SCREENER_URL = "https://financialmodelingprep.com/stable/company-screener";
const DEFAULT_EXCHANGES = ["NASDAQ", "NYSE", "AMEX"] as const;
const MAX_UNIVERSE_SIZE = 2_500;

export interface EquityUniverseSyncOptions {
  limit?: number;
  minMarketCap?: number;
  minPrice?: number;
  minVolume?: number;
  exchanges?: string[];
}

export interface EquityUniverseSyncResult {
  provider: "fmp";
  discovered: number;
  eligible: number;
  upserted: number;
  excluded: number;
  exchanges: string[];
  filters: {
    limit: number;
    minMarketCap: number;
    minPrice: number;
    minVolume: number;
  };
}

interface FmpScreenerRow {
  symbol?: string;
  companyName?: string;
  name?: string;
  marketCap?: number;
  price?: number;
  volume?: number;
  exchange?: string;
  exchangeShortName?: string;
  sector?: string;
  industry?: string;
  country?: string;
  isEtf?: boolean;
  isFund?: boolean;
  isActivelyTrading?: boolean;
}

interface NormalizedEquity {
  symbol: string;
  name: string;
  exchange: string;
  marketCap: number;
  price: number;
  volume: number;
  sectorCode: string | null;
}

export async function syncUsEquityUniverse(
  options: EquityUniverseSyncOptions = {},
): Promise<EquityUniverseSyncResult> {
  const key = process.env.FMP_API_KEY;
  if (!key) throw new Error("FMP_API_KEY missing");

  const limit = clampInteger(options.limit ?? 1_500, 1, MAX_UNIVERSE_SIZE);
  const minMarketCap = clampNumber(options.minMarketCap ?? 300_000_000, 0);
  const minPrice = clampNumber(options.minPrice ?? 2, 0);
  const minVolume = clampNumber(options.minVolume ?? 100_000, 0);
  const exchanges = unique(
    (options.exchanges?.length ? options.exchanges : [...DEFAULT_EXCHANGES])
      .map((value) => value.trim().toUpperCase())
      .filter((value) => exchangeMic(value) !== null),
  );

  const raw: FmpScreenerRow[] = [];
  for (const exchange of exchanges) {
    const url = new URL(FMP_SCREENER_URL);
    url.searchParams.set("exchange", exchange);
    url.searchParams.set("country", "US");
    url.searchParams.set("isEtf", "false");
    url.searchParams.set("isFund", "false");
    url.searchParams.set("isActivelyTrading", "true");
    url.searchParams.set("marketCapMoreThan", String(minMarketCap));
    url.searchParams.set("priceMoreThan", String(minPrice));
    url.searchParams.set("volumeMoreThan", String(minVolume));
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("apikey", key);

    const response = await fetch(url.toString());
    if (response.status === 401 || response.status === 403) {
      throw new Error(`FMP universe sync authentication failed (${response.status})`);
    }
    if (response.status === 402 || response.status === 429) {
      throw new Error(`FMP universe sync rate limited (${response.status})`);
    }
    if (!response.ok) throw new Error(`FMP universe sync failed (${response.status})`);

    const body = (await response.json()) as unknown;
    if (!Array.isArray(body)) throw new Error("FMP universe sync returned an invalid payload");
    raw.push(...(body as FmpScreenerRow[]));
  }

  const normalized = new Map<string, NormalizedEquity>();
  for (const row of raw) {
    const equity = normalizeEquity(row, { minMarketCap, minPrice, minVolume });
    if (!equity) continue;
    const key = `${equity.symbol}:${equity.exchange}`;
    const existing = normalized.get(key);
    if (!existing || equity.marketCap > existing.marketCap) normalized.set(key, equity);
  }

  const selected = [...normalized.values()]
    .sort((left, right) => right.marketCap - left.marketCap || left.symbol.localeCompare(right.symbol))
    .slice(0, limit);

  const [{ data: usCountry, error: countryError }, { data: industries, error: industryError }] =
    await Promise.all([
      supabaseAdmin.from("countries").select("id").eq("iso2", "US").maybeSingle(),
      supabaseAdmin.from("industries").select("id,code"),
    ]);
  if (countryError) throw countryError;
  if (industryError) throw industryError;
  if (!usCountry?.id) throw new Error("US country row is missing");

  const industryIds = new Map(
    (industries ?? []).map((row) => [String(row.code), String(row.id)]),
  );
  const rows = selected.map((equity) => ({
    symbol: equity.symbol,
    name: equity.name,
    asset_class: "equity" as const,
    country_id: String(usCountry.id),
    currency: "USD",
    industry_id: equity.sectorCode ? industryIds.get(equity.sectorCode) ?? null : null,
    exchange: equity.exchange,
    active: true,
  }));

  let upserted = 0;
  for (let start = 0; start < rows.length; start += 250) {
    const batch = rows.slice(start, start + 250);
    const { error } = await supabaseAdmin
      .from("assets")
      .upsert(batch, { onConflict: "symbol,exchange", ignoreDuplicates: false });
    if (error) throw error;
    upserted += batch.length;
  }

  return {
    provider: "fmp",
    discovered: raw.length,
    eligible: normalized.size,
    upserted,
    excluded: Math.max(0, raw.length - normalized.size),
    exchanges,
    filters: { limit, minMarketCap, minPrice, minVolume },
  };
}

function normalizeEquity(
  row: FmpScreenerRow,
  filters: { minMarketCap: number; minPrice: number; minVolume: number },
): NormalizedEquity | null {
  const symbol = String(row.symbol ?? "").trim().toUpperCase();
  const name = String(row.companyName ?? row.name ?? "").trim();
  const exchange = exchangeMic(String(row.exchangeShortName ?? row.exchange ?? ""));
  const marketCap = finite(row.marketCap);
  const price = finite(row.price);
  const volume = finite(row.volume);
  const country = String(row.country ?? "").trim().toUpperCase();

  if (!symbol || !name || !exchange) return null;
  if (!/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol)) return null;
  if (row.isEtf === true || row.isFund === true || row.isActivelyTrading === false) return null;
  if (country && !["US", "USA", "UNITED STATES"].includes(country)) return null;
  if (nonCommonSecurityName(name)) return null;
  if (marketCap === null || marketCap < filters.minMarketCap) return null;
  if (price === null || price < filters.minPrice) return null;
  if (volume === null || volume < filters.minVolume) return null;

  return {
    symbol,
    name,
    exchange,
    marketCap,
    price,
    volume,
    sectorCode: sectorCode(row.sector ?? row.industry ?? null),
  };
}

function exchangeMic(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  if (["NASDAQ", "NASDAQ GLOBAL SELECT", "NASDAQ GLOBAL MARKET", "XNAS"].includes(normalized)) {
    return "XNAS";
  }
  if (["NYSE", "NEW YORK STOCK EXCHANGE", "XNYS"].includes(normalized)) return "XNYS";
  if (["AMEX", "NYSE AMERICAN", "NYSEAMERICAN", "XASE"].includes(normalized)) return "XASE";
  return null;
}

function sectorCode(value: string | null): string | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("technology")) return "SEC_TECH";
  if (normalized.includes("financial")) return "SEC_FIN";
  if (normalized.includes("health")) return "SEC_HC";
  if (normalized.includes("consumer cyclical") || normalized.includes("consumer discretionary")) {
    return "SEC_CD";
  }
  if (normalized.includes("consumer defensive") || normalized.includes("consumer staples")) {
    return "SEC_CS";
  }
  if (normalized.includes("industrial")) return "SEC_IND";
  if (normalized.includes("energy")) return "SEC_ENE";
  if (normalized.includes("basic material") || normalized === "materials") return "SEC_MAT";
  if (normalized.includes("utilit")) return "SEC_UTL";
  if (normalized.includes("real estate")) return "SEC_RE";
  if (normalized.includes("communication")) return "SEC_COM";
  return null;
}

function nonCommonSecurityName(name: string): boolean {
  return /\b(etf|fund|warrant|rights?|units?|preferred|preference|depositary|debentures?|notes?|bonds?)\b/i.test(
    name,
  );
}

function finite(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clampNumber(value: number, minimum: number): number {
  return Math.max(minimum, Number.isFinite(value) ? value : minimum);
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.floor(Number.isFinite(value) ? value : minimum)));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
