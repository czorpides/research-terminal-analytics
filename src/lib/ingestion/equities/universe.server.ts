import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  EODHD_EXCHANGE_TARGETS,
  eodhdErrorMessage,
  eodhdExchangeToMic,
  eodhdNumber,
  fetchEodhdBulkEod,
  fetchEodhdSymbolList,
  isEodhdConfigured,
  type EodhdBulkEodRow,
  type EodhdExchangeTarget,
  type EodhdSymbolRow,
  type ManagedMarket,
} from "@/lib/ingestion/providers/eodhd-market.server";

const MAX_UNIVERSE_SIZE = 3_000;

export type EquityMarketRegion = ManagedMarket;

const DEFAULT_MARKETS: EquityMarketRegion[] = ["US", "UK", "EU"];
const REGION_WEIGHTS: Record<EquityMarketRegion, number> = {
  US: 2 / 3,
  UK: 1 / 6,
  EU: 1 / 6,
};

export interface EquityUniverseSyncOptions {
  limit?: number;
  minMarketCap?: number;
  minPrice?: number;
  minVolume?: number;
  exchanges?: string[];
  markets?: string[];
}

export interface EquityUniverseSyncResult {
  provider: "eodhd";
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

interface NormalizedEquity {
  symbol: string;
  name: string;
  exchange: string;
  isin: string | null;
  marketCap: number;
  price: number;
  volume: number;
  countryIso2: string;
  currency: string;
  region: EquityMarketRegion;
  sourceExchange: EodhdExchangeTarget["code"];
}

interface ExistingAsset {
  id: string;
  symbol: string;
  exchange: string | null;
}

export async function syncUsEquityUniverse(
  options: EquityUniverseSyncOptions = {},
): Promise<EquityUniverseSyncResult> {
  return syncManagedEquityUniverse({ ...options, markets: options.markets ?? ["US"] });
}

/**
 * Build the managed equity universe from EODHD reference data plus the latest
 * extended bulk-EOD snapshot. The reference list establishes active common
 * stocks; the bulk snapshot supplies price, market-cap and average-volume
 * evidence without one request per security.
 */
export async function syncManagedEquityUniverse(
  options: EquityUniverseSyncOptions = {},
): Promise<EquityUniverseSyncResult> {
  if (!isEodhdConfigured()) throw new Error("EODHD_API_KEY missing");

  const limit = clampInteger(options.limit ?? MAX_UNIVERSE_SIZE, 1, MAX_UNIVERSE_SIZE);
  const minMarketCap = clampNumber(options.minMarketCap ?? 300_000_000, 0);
  const minPrice = clampNumber(options.minPrice ?? 2, 0);
  const minVolume = clampNumber(options.minVolume ?? 50_000, 0);
  const markets = normalizeMarkets(options.markets);
  const requestedExchanges = unique(
    (options.exchanges ?? []).map((value) => value.trim().toUpperCase()).filter(Boolean),
  );
  const targets = EODHD_EXCHANGE_TARGETS.filter(
    (target) => markets.includes(target.market) && targetMatches(target, requestedExchanges),
  );
  if (!targets.length) throw new Error("No supported EODHD equity markets were selected");

  const candidates: NormalizedEquity[] = [];
  const warnings: string[] = [];
  let discovered = 0;

  for (const target of targets) {
    let symbols: EodhdSymbolRow[];
    let snapshot: EodhdBulkEodRow[];
    try {
      [symbols, snapshot] = await Promise.all([
        fetchEodhdSymbolList(target.code),
        fetchEodhdBulkEod(target.code, { extended: true }),
      ]);
    } catch (error) {
      throw new Error(`${target.code}: ${eodhdErrorMessage(error)}`);
    }

    discovered += symbols.length;
    const latestBySymbol = bestBulkRows(snapshot);
    let exchangeEligible = 0;
    for (const row of symbols) {
      const equity = normalizeEodhdEquity(row, latestBySymbol, target, {
        minMarketCap,
        minPrice,
        minVolume,
      });
      if (!equity) continue;
      candidates.push(equity);
      exchangeEligible += 1;
    }
    if (exchangeEligible === 0) {
      warnings.push(`${target.code}: no securities passed the price/liquidity/market-cap screen`);
    }
  }

  const deduplicated = deduplicateListings(candidates);
  const selected = selectBalancedUniverse(deduplicated, limit, markets);
  const minimumSafeSelection = limit >= 2_950 ? 2_950 : Math.max(1, Math.floor(limit * 0.9));
  if (selected.length < minimumSafeSelection) {
    throw new Error(
      `EODHD universe produced only ${selected.length}/${limit} eligible equities; ` +
      `minimum safe selection is ${minimumSafeSelection}. Existing assets were not changed.`,
    );
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

  const { data: countries, error: countryError } = await supabaseAdmin
    .from("countries")
    .select("id,iso2")
    .in("iso2", countryRows.map((row) => row.iso2));
  if (countryError) throw countryError;
  const countryIds = new Map((countries ?? []).map((row) => [String(row.iso2), String(row.id)]));

  const rows = selected.map((equity) => ({
    symbol: equity.symbol,
    name: equity.name,
    asset_class: "equity" as const,
    country_id: countryIds.get(equity.countryIso2) ?? null,
    currency: equity.currency,
    industry_id: null,
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
    provider: "eodhd",
    discovered,
    eligible: deduplicated.length,
    upserted,
    deactivated,
    excluded: Math.max(0, discovered - deduplicated.length),
    exchanges: targets.map((target) => target.code),
    markets,
    selectedByMarket,
    warnings,
    filters: { limit, minMarketCap, minPrice, minVolume },
  };
}

function normalizeEodhdEquity(
  row: EodhdSymbolRow,
  latestBySymbol: Map<string, EodhdBulkEodRow>,
  target: EodhdExchangeTarget,
  filters: { minMarketCap: number; minPrice: number; minVolume: number },
): NormalizedEquity | null {
  const symbol = String(row.Code ?? "").trim().toUpperCase();
  const name = String(row.Name ?? "").trim();
  const type = String(row.Type ?? "").trim().toLowerCase();
  if (!symbol || !name || (type && !type.includes("common"))) return null;
  if (!/^[A-Z0-9][A-Z0-9.\-_/]{0,24}$/.test(symbol)) return null;
  if (nonCommonSecurityName(name)) return null;

  const mic = target.code === "US" ? eodhdExchangeToMic(row.Exchange) : target.mic;
  if (!mic) return null;

  const latest = latestBySymbol.get(symbol);
  if (!latest) return null;
  const marketCap = eodhdNumber(latest.MarketCapitalization ?? latest.market_capitalization);
  const price = eodhdNumber(latest.close ?? latest.adjusted_close);
  const volume = eodhdNumber(latest.avgvol_50d ?? latest.avgvol_14d ?? latest.volume);
  if (marketCap === null || marketCap < filters.minMarketCap) return null;
  if (price === null || price < filters.minPrice) return null;
  if (volume === null || volume < filters.minVolume) return null;

  return {
    symbol,
    name,
    exchange: mic,
    isin: cleanIsin(row.Isin),
    marketCap,
    price,
    volume,
    countryIso2: target.countryIso2,
    currency: String(row.Currency ?? target.defaultCurrency).trim().toUpperCase() || target.defaultCurrency,
    region: target.market,
    sourceExchange: target.code,
  };
}

function bestBulkRows(rows: EodhdBulkEodRow[]): Map<string, EodhdBulkEodRow> {
  const result = new Map<string, EodhdBulkEodRow>();
  for (const row of rows) {
    const symbol = String(row.code ?? "").trim().toUpperCase();
    if (!symbol) continue;
    const current = result.get(symbol);
    if (!current || (eodhdNumber(row.volume) ?? 0) > (eodhdNumber(current.volume) ?? 0)) {
      result.set(symbol, row);
    }
  }
  return result;
}

function deduplicateListings(equities: NormalizedEquity[]): NormalizedEquity[] {
  const byIdentity = new Map<string, NormalizedEquity>();
  for (const equity of equities) {
    const identity = equity.isin ? `isin:${equity.isin}` : `listing:${assetKey(equity.symbol, equity.exchange)}`;
    const existing = byIdentity.get(identity);
    if (!existing || compareQuality(equity, existing) < 0) byIdentity.set(identity, equity);
  }
  return [...byIdentity.values()];
}

function compareQuality(left: NormalizedEquity, right: NormalizedEquity): number {
  return right.marketCap - left.marketCap || right.volume - left.volume || left.symbol.localeCompare(right.symbol);
}

function selectBalancedUniverse(
  equities: NormalizedEquity[],
  limit: number,
  markets: EquityMarketRegion[],
): NormalizedEquity[] {
  const ranked = [...equities].sort(
    (left, right) => right.marketCap - left.marketCap || right.volume - left.volume || left.symbol.localeCompare(right.symbol),
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

function targetMatches(target: EodhdExchangeTarget, requested: string[]): boolean {
  if (!requested.length) return true;
  const aliases: Record<EodhdExchangeTarget["code"], string[]> = {
    US: ["US", "NASDAQ", "NYSE", "AMEX", "XNAS", "XNYS", "XASE"],
    LSE: ["LSE", "XLON"],
    XETRA: ["XETRA", "XETR"],
    PA: ["PA", "PAR", "XPAR"],
    AS: ["AS", "AMS", "XAMS"],
  };
  return aliases[target.code].some((value) => requested.includes(value));
}

function normalizeMarkets(values?: string[]): EquityMarketRegion[] {
  const requested = unique((values ?? DEFAULT_MARKETS).map((value) => value.trim().toUpperCase()));
  const normalized = requested.filter((value): value is EquityMarketRegion =>
    value === "US" || value === "UK" || value === "EU",
  );
  return normalized.length ? normalized : DEFAULT_MARKETS;
}

function cleanIsin(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(normalized) ? normalized : null;
}

function nonCommonSecurityName(name: string): boolean {
  const value = name.toUpperCase();
  return [
    " ETF",
    " ETN",
    " FUND",
    " WARRANT",
    " WTS",
    " PREFERRED",
    " DEPOSITARY PREFERRED",
    " UNIT",
    " RIGHTS",
    " NOTES DUE",
  ].some((token) => value.includes(token));
}

function countryName(iso2: string): string {
  return ({ US: "United States", GB: "United Kingdom", DE: "Germany", FR: "France", NL: "Netherlands" } as Record<string, string>)[iso2] ?? iso2;
}

function regionLabel(iso2: string): string {
  if (iso2 === "US") return "North America";
  return "Europe";
}

function assetKey(symbol: string, exchange: string | null | undefined): string {
  return `${symbol.trim().toUpperCase()}:${(exchange ?? "").trim().toUpperCase()}`;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function clampNumber(value: number, min: number): number {
  return Number.isFinite(value) ? Math.max(min, value) : min;
}