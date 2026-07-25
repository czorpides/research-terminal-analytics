import { supabaseAdmin } from "@/integrations/supabase/client.server";

const FMP_SCREENER_URL = "https://financialmodelingprep.com/stable/company-screener";
const MAX_UNIVERSE_SIZE = 3_000;
const REQUEST_LIMIT = 1_000;

export type EquityMarketRegion = "US" | "UK" | "EU";

const DEFAULT_MARKETS: EquityMarketRegion[] = ["US", "UK", "EU"];
const REGION_WEIGHTS: Record<EquityMarketRegion, number> = {
  US: 0.5,
  UK: 0.15,
  EU: 0.35,
};

const DISCOVERY_REQUESTS: Array<{
  region: EquityMarketRegion;
  exchange: string;
}> = [
  { region: "US", exchange: "NASDAQ" },
  { region: "US", exchange: "NYSE" },
  { region: "US", exchange: "AMEX" },
  { region: "UK", exchange: "LSE" },
  { region: "EU", exchange: "XETRA" },
  { region: "EU", exchange: "EURONEXT" },
  { region: "EU", exchange: "PAR" },
  { region: "EU", exchange: "AMS" },
  { region: "EU", exchange: "BRU" },
  { region: "EU", exchange: "LIS" },
  { region: "EU", exchange: "MIL" },
  { region: "EU", exchange: "MC" },
  { region: "EU", exchange: "STO" },
  { region: "EU", exchange: "CPH" },
  { region: "EU", exchange: "HEL" },
  { region: "EU", exchange: "WSE" },
  { region: "EU", exchange: "VIE" },
];

export interface EquityUniverseSyncOptions {
  limit?: number;
  minMarketCap?: number;
  minPrice?: number;
  minVolume?: number;
  exchanges?: string[];
  markets?: string[];
}

export interface EquityUniverseSyncResult {
  provider: "fmp";
  discovered: number;
  eligible: number;
  upserted: number;
  deactivated: number;
  excluded: number;
  exchanges: string[];
  markets: EquityMarketRegion[];
  selectedByMarket: Record<EquityMarketRegion, number>;
  warnings: string[];
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
  currency?: string;
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
  countryIso2: string;
  currency: string;
  region: EquityMarketRegion;
}

interface ExistingAsset {
  id: string;
  symbol: string;
  exchange: string | null;
}

export async function syncUsEquityUniverse(
  options: EquityUniverseSyncOptions = {},
): Promise<EquityUniverseSyncResult> {
  return syncManagedEquityUniverse(options);
}

export async function syncManagedEquityUniverse(
  options: EquityUniverseSyncOptions = {},
): Promise<EquityUniverseSyncResult> {
  const key = process.env.FMP_API_KEY;
  if (!key) throw new Error("FMP_API_KEY missing");

  const limit = clampInteger(options.limit ?? MAX_UNIVERSE_SIZE, 1, MAX_UNIVERSE_SIZE);
  const minMarketCap = clampNumber(options.minMarketCap ?? 300_000_000, 0);
  const minPrice = clampNumber(options.minPrice ?? 2, 0);
  const minVolume = clampNumber(options.minVolume ?? 50_000, 0);
  const markets = normalizeMarkets(options.markets);
  const requestedExchanges = unique(
    (options.exchanges ?? []).map((value) => value.trim().toUpperCase()).filter(Boolean),
  );
  const requests = DISCOVERY_REQUESTS.filter(
    (request) =>
      markets.includes(request.region) &&
      (requestedExchanges.length === 0 || requestedExchanges.includes(request.exchange)),
  );
  if (requests.length === 0) throw new Error("No supported equity markets were selected");

  const raw: FmpScreenerRow[] = [];
  const warnings: string[] = [];
  for (const request of requests) {
    const url = new URL(FMP_SCREENER_URL);
    url.searchParams.set("exchange", request.exchange);
    url.searchParams.set("isEtf", "false");
    url.searchParams.set("isFund", "false");
    url.searchParams.set("isActivelyTrading", "true");
    url.searchParams.set("marketCapMoreThan", String(minMarketCap));
    url.searchParams.set("priceMoreThan", String(minPrice));
    url.searchParams.set("volumeMoreThan", String(minVolume));
    url.searchParams.set("limit", String(REQUEST_LIMIT));
    url.searchParams.set("apikey", key);

    const response = await fetch(url.toString());
    if (response.status === 401 || response.status === 403) {
      throw new Error(`FMP universe sync authentication failed (${response.status})`);
    }
    if (response.status === 402 || response.status === 429) {
      throw new Error(`FMP universe sync rate limited (${response.status})`);
    }
    if (!response.ok) {
      warnings.push(`${request.exchange}: HTTP ${response.status}`);
      continue;
    }

    const body = (await response.json()) as unknown;
    if (!Array.isArray(body)) {
      warnings.push(`${request.exchange}: invalid payload`);
      continue;
    }
    raw.push(...(body as FmpScreenerRow[]));
  }

  const normalized = new Map<string, NormalizedEquity>();
  for (const row of raw) {
    const equity = normalizeEquity(row, { minMarketCap, minPrice, minVolume, markets });
    if (!equity) continue;
    const key = assetKey(equity.symbol, equity.exchange);
    const existing = normalized.get(key);
    if (!existing || equity.marketCap > existing.marketCap) normalized.set(key, equity);
  }

  const selected = selectBalancedUniverse([...normalized.values()], limit, markets);
  if (selected.length === 0) {
    throw new Error("Universe sync produced no eligible common stocks; existing assets were not changed");
  }

  const countryRows = unique(selected.map((equity) => equity.countryIso2)).map((iso2) => ({
    iso2,
    name: countryName(iso2),
    region: regionLabel(iso2),
  }));
  const { error: countryUpsertError } = await supabaseAdmin
    .from("countries")
    .upsert(countryRows, { onConflict: "iso2", ignoreDuplicates: false });
  if (countryUpsertError) throw countryUpsertError;

  const [{ data: countries, error: countryError }, { data: industries, error: industryError }] =
    await Promise.all([
      supabaseAdmin.from("countries").select("id,iso2").in(
        "iso2",
        countryRows.map((row) => row.iso2),
      ),
      supabaseAdmin.from("industries").select("id,code"),
    ]);
  if (countryError) throw countryError;
  if (industryError) throw industryError;

  const countryIds = new Map((countries ?? []).map((row) => [String(row.iso2), String(row.id)]));
  const industryIds = new Map((industries ?? []).map((row) => [String(row.code), String(row.id)]));
  const rows = selected.map((equity) => ({
    symbol: equity.symbol,
    name: equity.name,
    asset_class: "equity" as const,
    country_id: countryIds.get(equity.countryIso2) ?? null,
    currency: equity.currency,
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

  const managedCountryIds = [...countryIds.values()];
  const { data: existingAssets, error: existingError } = await supabaseAdmin
    .from("assets")
    .select("id,symbol,exchange")
    .in("country_id", managedCountryIds)
    .eq("asset_class", "equity")
    .eq("active", true);
  if (existingError) throw existingError;

  const selectedKeys = new Set(selected.map((equity) => assetKey(equity.symbol, equity.exchange)));
  const deactivateIds = ((existingAssets ?? []) as ExistingAsset[])
    .filter((asset) => !selectedKeys.has(assetKey(asset.symbol, asset.exchange)))
    .map((asset) => asset.id);

  let deactivated = 0;
  for (let start = 0; start < deactivateIds.length; start += 250) {
    const batch = deactivateIds.slice(start, start + 250);
    const { error } = await supabaseAdmin.from("assets").update({ active: false }).in("id", batch);
    if (error) throw error;
    deactivated += batch.length;
  }

  const selectedByMarket: Record<EquityMarketRegion, number> = { US: 0, UK: 0, EU: 0 };
  for (const equity of selected) selectedByMarket[equity.region] += 1;

  return {
    provider: "fmp",
    discovered: raw.length,
    eligible: normalized.size,
    upserted,
    deactivated,
    excluded: Math.max(0, raw.length - normalized.size),
    exchanges: requests.map((request) => request.exchange),
    markets,
    selectedByMarket,
    warnings,
    filters: { limit, minMarketCap, minPrice, minVolume },
  };
}

function selectBalancedUniverse(
  equities: NormalizedEquity[],
  limit: number,
  markets: EquityMarketRegion[],
): NormalizedEquity[] {
  const ranked = [...equities].sort(
    (left, right) => right.marketCap - left.marketCap || left.symbol.localeCompare(right.symbol),
  );
  const selected = new Map<string, NormalizedEquity>();
  const activeWeight = markets.reduce((sum, market) => sum + REGION_WEIGHTS[market], 0);

  for (const market of markets) {
    const quota = Math.max(1, Math.round(limit * (REGION_WEIGHTS[market] / activeWeight)));
    const regional = ranked.filter((equity) => equity.region === market).slice(0, quota);
    for (const equity of regional) selected.set(assetKey(equity.symbol, equity.exchange), equity);
  }
  for (const equity of ranked) {
    if (selected.size >= limit) break;
    selected.set(assetKey(equity.symbol, equity.exchange), equity);
  }
  return [...selected.values()].slice(0, limit);
}

function normalizeEquity(
  row: FmpScreenerRow,
  filters: {
    minMarketCap: number;
    minPrice: number;
    minVolume: number;
    markets: EquityMarketRegion[];
  },
): NormalizedEquity | null {
  const symbol = String(row.symbol ?? "").trim().toUpperCase();
  const name = String(row.companyName ?? row.name ?? "").trim();
  const exchange = exchangeMic(String(row.exchangeShortName ?? row.exchange ?? ""));
  const marketCap = finite(row.marketCap);
  const price = finite(row.price);
  const volume = finite(row.volume);
  const countryIso2 = countryIso(String(row.country ?? ""), exchange);
  const region = marketRegion(countryIso2);

  if (!symbol || !name || !exchange || !countryIso2 || !region) return null;
  if (!filters.markets.includes(region)) return null;
  if (!/^[A-Z0-9][A-Z0-9.\-_/]{0,24}$/.test(symbol)) return null;
  if (row.isEtf === true || row.isFund === true || row.isActivelyTrading === false) return null;
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
    countryIso2,
    currency: String(row.currency ?? defaultCurrency(countryIso2)).trim().toUpperCase(),
    region,
  };
}

function exchangeMic(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  const aliases: Record<string, string> = {
    NASDAQ: "XNAS",
    "NASDAQ GLOBAL SELECT": "XNAS",
    "NASDAQ GLOBAL MARKET": "XNAS",
    XNAS: "XNAS",
    NYSE: "XNYS",
    "NEW YORK STOCK EXCHANGE": "XNYS",
    XNYS: "XNYS",
    AMEX: "XASE",
    "NYSE AMERICAN": "XASE",
    NYSEAMERICAN: "XASE",
    XASE: "XASE",
    LSE: "XLON",
    LONDON: "XLON",
    XLON: "XLON",
    XETRA: "XETR",
    XETR: "XETR",
    PAR: "XPAR",
    PARIS: "XPAR",
    XPAR: "XPAR",
    AMS: "XAMS",
    AMSTERDAM: "XAMS",
    XAMS: "XAMS",
    BRU: "XBRU",
    BRUSSELS: "XBRU",
    XBRU: "XBRU",
    LIS: "XLIS",
    LISBON: "XLIS",
    XLIS: "XLIS",
    MIL: "XMIL",
    MILAN: "XMIL",
    XMIL: "XMIL",
    MC: "XMAD",
    MADRID: "XMAD",
    XMAD: "XMAD",
    STO: "XSTO",
    STOCKHOLM: "XSTO",
    XSTO: "XSTO",
    CPH: "XCSE",
    COPENHAGEN: "XCSE",
    XCSE: "XCSE",
    HEL: "XHEL",
    HELSINKI: "XHEL",
    XHEL: "XHEL",
    WSE: "XWAR",
    WARSAW: "XWAR",
    XWAR: "XWAR",
    VIE: "XWBO",
    VIENNA: "XWBO",
    XWBO: "XWBO",
    EURONEXT: "XPAR",
  };
  if (aliases[normalized]) return aliases[normalized];
  return normalized && normalized.length <= 16 ? normalized : null;
}

function countryIso(value: string, exchange: string | null): string | null {
  const normalized = value.trim().toUpperCase();
  const aliases: Record<string, string> = {
    US: "US",
    USA: "US",
    "UNITED STATES": "US",
    GB: "GB",
    GBR: "GB",
    UK: "GB",
    "UNITED KINGDOM": "GB",
    DE: "DE",
    DEU: "DE",
    GERMANY: "DE",
    FR: "FR",
    FRA: "FR",
    FRANCE: "FR",
    NL: "NL",
    NLD: "NL",
    NETHERLANDS: "NL",
    BE: "BE",
    BEL: "BE",
    BELGIUM: "BE",
    PT: "PT",
    PRT: "PT",
    PORTUGAL: "PT",
    IT: "IT",
    ITA: "IT",
    ITALY: "IT",
    ES: "ES",
    ESP: "ES",
    SPAIN: "ES",
    SE: "SE",
    SWE: "SE",
    SWEDEN: "SE",
    DK: "DK",
    DNK: "DK",
    DENMARK: "DK",
    FI: "FI",
    FIN: "FI",
    FINLAND: "FI",
    PL: "PL",
    POL: "PL",
    POLAND: "PL",
    AT: "AT",
    AUT: "AT",
    AUSTRIA: "AT",
    IE: "IE",
    IRL: "IE",
    IRELAND: "IE",
    CZ: "CZ",
    CZE: "CZ",
    CZECHIA: "CZ",
  };
  if (aliases[normalized]) return aliases[normalized];
  const byExchange: Record<string, string> = {
    XNAS: "US",
    XNYS: "US",
    XASE: "US",
    XLON: "GB",
    XETR: "DE",
    XPAR: "FR",
    XAMS: "NL",
    XBRU: "BE",
    XLIS: "PT",
    XMIL: "IT",
    XMAD: "ES",
    XSTO: "SE",
    XCSE: "DK",
    XHEL: "FI",
    XWAR: "PL",
    XWBO: "AT",
  };
  return exchange ? byExchange[exchange] ?? null : null;
}

function marketRegion(iso2: string | null): EquityMarketRegion | null {
  if (iso2 === "US") return "US";
  if (iso2 === "GB") return "UK";
  if (iso2 && ["DE", "FR", "NL", "BE", "PT", "IT", "ES", "SE", "DK", "FI", "PL", "AT", "IE", "CZ"].includes(iso2)) {
    return "EU";
  }
  return null;
}

function normalizeMarkets(values?: string[]): EquityMarketRegion[] {
  const normalized = unique(
    (values?.length ? values : DEFAULT_MARKETS)
      .map((value) => value.trim().toUpperCase())
      .map((value) => (value === "GB" || value === "UK" ? "UK" : value === "EUROPE" ? "EU" : value))
      .filter((value): value is EquityMarketRegion => ["US", "UK", "EU"].includes(value)),
  );
  return normalized.length ? normalized : [...DEFAULT_MARKETS];
}

function countryName(iso2: string): string {
  const names: Record<string, string> = {
    US: "United States",
    GB: "United Kingdom",
    DE: "Germany",
    FR: "France",
    NL: "Netherlands",
    BE: "Belgium",
    PT: "Portugal",
    IT: "Italy",
    ES: "Spain",
    SE: "Sweden",
    DK: "Denmark",
    FI: "Finland",
    PL: "Poland",
    AT: "Austria",
    IE: "Ireland",
    CZ: "Czechia",
  };
  return names[iso2] ?? iso2;
}

function regionLabel(iso2: string): string {
  return iso2 === "US" ? "North America" : iso2 === "GB" ? "Europe / UK" : "Europe / EU";
}

function defaultCurrency(iso2: string): string {
  if (iso2 === "US") return "USD";
  if (iso2 === "GB") return "GBP";
  if (iso2 === "SE") return "SEK";
  if (iso2 === "DK") return "DKK";
  if (iso2 === "PL") return "PLN";
  if (iso2 === "CZ") return "CZK";
  return "EUR";
}

function sectorCode(value: string | null): string | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("technology")) return "SEC_TECH";
  if (normalized.includes("financial")) return "SEC_FIN";
  if (normalized.includes("health")) return "SEC_HC";
  if (normalized.includes("consumer cyclical") || normalized.includes("consumer discretionary")) return "SEC_CD";
  if (normalized.includes("consumer defensive") || normalized.includes("consumer staples")) return "SEC_CS";
  if (normalized.includes("industrial")) return "SEC_IND";
  if (normalized.includes("energy")) return "SEC_ENE";
  if (normalized.includes("basic material") || normalized === "materials") return "SEC_MAT";
  if (normalized.includes("utilit")) return "SEC_UTL";
  if (normalized.includes("real estate")) return "SEC_RE";
  if (normalized.includes("communication")) return "SEC_COM";
  return null;
}

function nonCommonSecurityName(name: string): boolean {
  return /\b(etf|fund|warrant|rights?|units?|preferred|preference|depositary|debentures?|notes?|bonds?|certificate|trust units?)\b/i.test(name);
}

function assetKey(symbol: string, exchange: string | null): string {
  return `${String(symbol).trim().toUpperCase()}:${String(exchange ?? "").trim().toUpperCase()}`;
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

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
