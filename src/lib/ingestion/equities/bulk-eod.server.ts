import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  EODHD_BULK_EXCHANGE_UNITS,
  EODHD_EXCHANGE_TARGETS,
  EODHD_PAID_DAILY_LIMIT_UNITS,
  eodhdErrorMessage,
  eodhdExchangeToMic,
  eodhdNumber,
  fetchEodhdBulkEod,
  isEodhdConfigured,
  micToEodhdExchange,
  type EodhdBulkEodRow,
  type EodhdExchangeTarget,
} from "@/lib/ingestion/providers/eodhd-market.server";
import { canUse } from "@/lib/ingestion/providers/quota.server";
import { ProviderError } from "@/lib/ingestion/providers/types";

interface ActiveAssetRow {
  id: string;
  symbol: string;
  exchange: string | null;
}

export interface BulkEodIngestResult {
  status: "success" | "no_data" | "failed";
  date: string;
  provider: "eodhd";
  activeAssets: number;
  providerRows: number;
  matchedAssets: number;
  insertedRows: number;
  invalidRows: number;
  ambiguousSymbols: number;
  unmatchedRows: number;
  runId: string | null;
  error: string | null;
  exchanges: Array<{ exchange: string; rows: number }>;
}

export interface BulkEodBackfillResult {
  attemptedDates: number;
  completedDates: number;
  noDataDates: number;
  failedDates: number;
  insertedRows: number;
  remainingDates: number;
  results: BulkEodIngestResult[];
}

/**
 * Ingest one market date using EODHD's whole-exchange bulk feed. Five requests
 * cover the managed US/UK/DE/FR/NL universe and cost 500 EODHD API units, not
 * one request per security.
 */
export async function runBulkEodIngest(date = previousUtcBusinessDate()): Promise<BulkEodIngestResult> {
  const normalizedDate = normalizeDate(date);
  if (!isEodhdConfigured()) return failedResult(normalizedDate, "EODHD_API_KEY missing");

  const reserveUnits = EODHD_EXCHANGE_TARGETS.length * EODHD_BULK_EXCHANGE_UNITS;
  const gate = await canUse("eodhd", EODHD_PAID_DAILY_LIMIT_UNITS, reserveUnits);
  if (!gate.ok) return failedResult(normalizedDate, gate.reason ?? "EODHD quota unavailable");

  const [assets, sourceId] = await Promise.all([loadActiveAssets(), sourceIdForProvider("eodhd")]);
  if (!sourceId) return failedResult(normalizedDate, "EODHD data source is not registered");

  const runId = await beginRun(sourceId, normalizedDate);
  try {
    const supportedAssets = assets.filter((asset) => micToEodhdExchange(asset.exchange) !== null);
    const relevantTargets = EODHD_EXCHANGE_TARGETS.filter((target) =>
      supportedAssets.some((asset) => micToEodhdExchange(asset.exchange) === target.code),
    );
    if (!relevantTargets.length) {
      throw new Error("No active managed assets map to an EODHD exchange");
    }

    const index = buildAssetMatchIndex(supportedAssets);
    const inserts: Array<{
      asset_id: string;
      trade_date: string;
      open: number;
      high: number;
      low: number;
      close: number;
      adj_close: number;
      volume: number | null;
      source_id: string;
    }> = [];
    const insertedAssetIds = new Set<string>();
    const exchangeResults: Array<{ exchange: string; rows: number }> = [];
    let providerRows = 0;
    let invalidRows = 0;
    let ambiguousSymbols = 0;
    let unmatchedRows = 0;

    for (const target of relevantTargets) {
      let rows: EodhdBulkEodRow[];
      try {
        rows = await fetchEodhdBulkEod(target.code, { date: normalizedDate });
      } catch (error) {
        throw new Error(providerFailureMessage(error, target.code));
      }
      exchangeResults.push({ exchange: target.code, rows: rows.length });
      providerRows += rows.length;

      for (const raw of rows) {
        const bar = normalizeBar(raw, normalizedDate);
        if (!bar) {
          invalidRows += 1;
          continue;
        }
        const matched = matchAsset(raw, target, index);
        if (matched.kind === "ambiguous") {
          ambiguousSymbols += 1;
          continue;
        }
        if (!matched.assetId) {
          unmatchedRows += 1;
          continue;
        }
        if (insertedAssetIds.has(matched.assetId)) continue;
        insertedAssetIds.add(matched.assetId);
        inserts.push({
          asset_id: matched.assetId,
          trade_date: normalizedDate,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          adj_close: bar.adjClose,
          volume: bar.volume,
          source_id: sourceId,
        });
      }
    }

    if (providerRows === 0) {
      await finishRun(runId, "success", 0, {
        provider: "eodhd",
        date: normalizedDate,
        exchanges: exchangeResults,
        providerRows: 0,
        noData: true,
      });
      return {
        status: "no_data",
        date: normalizedDate,
        provider: "eodhd",
        activeAssets: assets.length,
        providerRows: 0,
        matchedAssets: 0,
        insertedRows: 0,
        invalidRows: 0,
        ambiguousSymbols: 0,
        unmatchedRows: 0,
        runId,
        error: null,
        exchanges: exchangeResults,
      };
    }

    let insertedRows = 0;
    for (let start = 0; start < inserts.length; start += 500) {
      const batch = inserts.slice(start, start + 500);
      const { error } = await supabaseAdmin
        .from("prices_daily")
        .upsert(batch, { onConflict: "asset_id,trade_date", ignoreDuplicates: true });
      if (error) throw error;
      insertedRows += batch.length;
    }

    await finishRun(runId, "success", insertedRows, {
      provider: "eodhd",
      date: normalizedDate,
      exchanges: exchangeResults,
      providerRows,
      matchedAssets: inserts.length,
      invalidRows,
      ambiguousSymbols,
      unmatchedRows,
      sourceKind: "eodhd_exchange_bulk",
      apiUnits: relevantTargets.length * EODHD_BULK_EXCHANGE_UNITS,
    });

    return {
      status: "success",
      date: normalizedDate,
      provider: "eodhd",
      activeAssets: assets.length,
      providerRows,
      matchedAssets: inserts.length,
      insertedRows,
      invalidRows,
      ambiguousSymbols,
      unmatchedRows,
      runId,
      error: null,
      exchanges: exchangeResults,
    };
  } catch (error) {
    const message = eodhdErrorMessage(error);
    await finishRun(runId, "failed", 0, { provider: "eodhd", date: normalizedDate }, message);
    return {
      ...failedResult(normalizedDate, message),
      activeAssets: assets.length,
      runId,
    };
  }
}

export async function runBulkEodBackfillBatch(limitDates = 4): Promise<BulkEodBackfillResult> {
  const limit = Math.max(1, Math.min(8, Math.trunc(limitDates)));
  const db = looseDb();
  const { data, error } = await db
    .from("equity_eod_backfill_queue")
    .select("market_date")
    .eq("status", "pending")
    .order("market_date", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const dates = (data ?? []).map((row: { market_date: string }) => String(row.market_date));
  const results: BulkEodIngestResult[] = [];
  let completedDates = 0;
  let noDataDates = 0;
  let failedDates = 0;
  let insertedRows = 0;

  for (const date of dates) {
    const { data: queueRow, error: queueError } = await db
      .from("equity_eod_backfill_queue")
      .select("attempts")
      .eq("market_date", date)
      .maybeSingle();
    if (queueError) throw queueError;
    const attempts = Number(queueRow?.attempts ?? 0) + 1;

    const { error: runningError } = await db
      .from("equity_eod_backfill_queue")
      .update({
        status: "running",
        attempts,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("market_date", date);
    if (runningError) throw runningError;

    const result = await runBulkEodIngest(date);
    results.push(result);
    insertedRows += result.insertedRows;
    const status = result.status === "success" ? "complete" : result.status === "no_data" ? "no_data" : "failed";
    if (result.status === "success") completedDates += 1;
    else if (result.status === "no_data") noDataDates += 1;
    else failedDates += 1;

    const { error: completeError } = await db
      .from("equity_eod_backfill_queue")
      .update({
        status,
        last_error: result.error,
        completed_at: result.status === "failed" ? null : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("market_date", date);
    if (completeError) throw completeError;

    if (
      result.error?.toLowerCase().includes("entitlement") ||
      result.error?.toLowerCase().includes("quota") ||
      result.error?.includes("HTTP 403")
    ) {
      break;
    }
  }

  const { count: remainingDates, error: remainingError } = await db
    .from("equity_eod_backfill_queue")
    .select("market_date", { count: "exact", head: true })
    .in("status", ["pending", "running"]);
  if (remainingError) throw remainingError;

  return {
    attemptedDates: results.length,
    completedDates,
    noDataDates,
    failedDates,
    insertedRows,
    remainingDates: remainingDates ?? 0,
    results,
  };
}

export async function refreshEquityTechnicalScreen(): Promise<number> {
  const db = looseDb();
  const { data, error } = await db.rpc("refresh_equity_technical_screen");
  if (error) throw error;
  return Number(data ?? 0);
}

function buildAssetMatchIndex(assets: ActiveAssetRow[]) {
  const bySymbol = new Map<string, ActiveAssetRow[]>();
  const bySymbolExchange = new Map<string, string>();
  for (const asset of assets) {
    const symbol = asset.symbol.trim().toUpperCase();
    const list = bySymbol.get(symbol) ?? [];
    list.push(asset);
    bySymbol.set(symbol, list);
    const exchange = String(asset.exchange ?? "").trim().toUpperCase();
    if (exchange) bySymbolExchange.set(`${symbol}:${exchange}`, asset.id);
  }
  return { bySymbol, bySymbolExchange };
}

function matchAsset(
  raw: EodhdBulkEodRow,
  target: EodhdExchangeTarget,
  index: ReturnType<typeof buildAssetMatchIndex>,
): { assetId: string | null; kind: "exact" | "symbol" | "ambiguous" | "missing" } {
  const symbol = String(raw.code ?? "").trim().toUpperCase();
  if (!symbol) return { assetId: null, kind: "missing" };

  if (target.code !== "US" && target.mic) {
    const exact = index.bySymbolExchange.get(`${symbol}:${target.mic}`);
    if (exact) return { assetId: exact, kind: "exact" };
  }

  if (target.code === "US") {
    const providerMic = eodhdExchangeToMic(raw.exchange_short_name);
    if (providerMic) {
      const exact = index.bySymbolExchange.get(`${symbol}:${providerMic}`);
      if (exact) return { assetId: exact, kind: "exact" };
    }
    const usCandidates = (index.bySymbol.get(symbol) ?? []).filter(
      (asset) => micToEodhdExchange(asset.exchange) === "US",
    );
    if (usCandidates.length === 1) return { assetId: usCandidates[0].id, kind: "symbol" };
    if (usCandidates.length > 1) return { assetId: null, kind: "ambiguous" };
    return { assetId: null, kind: "missing" };
  }

  const candidates = index.bySymbol.get(symbol) ?? [];
  if (candidates.length === 1) return { assetId: candidates[0].id, kind: "symbol" };
  if (candidates.length > 1) return { assetId: null, kind: "ambiguous" };
  return { assetId: null, kind: "missing" };
}

function normalizeBar(raw: EodhdBulkEodRow, expectedDate: string) {
  const symbol = String(raw.code ?? "").trim();
  const date = String(raw.date ?? expectedDate).slice(0, 10);
  const open = positive(raw.open);
  const high = positive(raw.high);
  const low = positive(raw.low);
  const close = positive(raw.close);
  const adjClose = positive(raw.adjusted_close);
  const volume = nonNegative(raw.volume);
  if (!symbol || date !== expectedDate || open === null || high === null || low === null || close === null) return null;
  if (high < Math.max(open, close, low) || low > Math.min(open, close, high)) return null;
  return { open, high, low, close, adjClose: adjClose ?? close, volume };
}

async function loadActiveAssets(): Promise<ActiveAssetRow[]> {
  const out: ActiveAssetRow[] = [];
  for (let start = 0; start < 3_500; start += 1_000) {
    const { data, error } = await supabaseAdmin
      .from("assets")
      .select("id,symbol,exchange")
      .eq("active", true)
      .eq("asset_class", "equity")
      .order("symbol", { ascending: true })
      .range(start, start + 999);
    if (error) throw error;
    const rows = (data ?? []) as ActiveAssetRow[];
    out.push(...rows);
    if (rows.length < 1_000) break;
  }
  return out;
}

async function sourceIdForProvider(providerCode: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("data_sources")
    .select("id")
    .eq("provider_code", providerCode)
    .maybeSingle();
  return data?.id ? String(data.id) : null;
}

async function beginRun(sourceId: string, date: string): Promise<string> {
  const db = looseDb();
  const { data, error } = await db
    .from("ingestion_runs")
    .insert({
      source_id: sourceId,
      data_category: "price_daily_bulk",
      status: "running",
      details: { provider: "eodhd", date, endpoint: "eod-bulk-last-day" },
    })
    .select("id")
    .single();
  if (error) throw error;
  return String(data.id);
}

async function finishRun(
  runId: string,
  status: "success" | "failed",
  rowsIngested: number,
  details: Record<string, unknown>,
  error?: string,
) {
  const db = looseDb();
  const { error: updateError } = await db
    .from("ingestion_runs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      rows_ingested: rowsIngested,
      error: error ?? null,
      details,
    })
    .eq("id", runId);
  if (updateError) throw updateError;
}

function providerFailureMessage(error: unknown, exchange: string): string {
  if (error instanceof ProviderError && error.code === "entitlement") {
    return `EODHD entitlement unavailable for ${exchange}: ${error.message}`;
  }
  if (error instanceof ProviderError && error.code === "rate_limit") {
    return `EODHD quota/rate limit for ${exchange}: ${error.message}`;
  }
  return `${exchange}: ${eodhdErrorMessage(error)}`;
}

function positive(value: unknown): number | null {
  const number = eodhdNumber(value);
  return number !== null && number > 0 ? number : null;
}

function nonNegative(value: unknown): number | null {
  const number = eodhdNumber(value);
  return number !== null && number >= 0 ? number : null;
}

function normalizeDate(value: string): string {
  const date = value.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T12:00:00Z`).getTime())) {
    throw new Error(`Invalid EOD date ${value}`);
  }
  return date;
}

function previousUtcBusinessDate(now = new Date()): string {
  const value = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 12));
  while (value.getUTCDay() === 0 || value.getUTCDay() === 6) value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

function failedResult(date: string, error: string): BulkEodIngestResult {
  return {
    status: "failed",
    date,
    provider: "eodhd",
    activeAssets: 0,
    providerRows: 0,
    matchedAssets: 0,
    insertedRows: 0,
    invalidRows: 0,
    ambiguousSymbols: 0,
    unmatchedRows: 0,
    runId: null,
    error,
    exchanges: [],
  };
}

// Runtime tables were introduced after the generated Supabase types. Keep this
// compatibility shim until the generated client catches up with migrations.
function looseDb(): any {
  return supabaseAdmin as any;
}