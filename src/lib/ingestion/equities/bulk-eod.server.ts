import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { canUse, recordCall } from "@/lib/ingestion/providers/quota.server";

const FMP_DAILY_LIMIT = 250;
const FMP_RESERVE = 40;
const FMP_EOD_BULK_URL = "https://financialmodelingprep.com/stable/eod-bulk";

interface ActiveAssetRow {
  id: string;
  symbol: string;
  exchange: string | null;
}

interface FmpBulkEodRow {
  symbol?: string;
  date?: string;
  open?: number | string | null;
  high?: number | string | null;
  low?: number | string | null;
  close?: number | string | null;
  adjClose?: number | string | null;
  volume?: number | string | null;
  exchange?: string | null;
  exchangeShortName?: string | null;
}

export interface BulkEodIngestResult {
  status: "success" | "no_data" | "failed";
  date: string;
  provider: "fmp";
  activeAssets: number;
  providerRows: number;
  matchedAssets: number;
  insertedRows: number;
  invalidRows: number;
  ambiguousSymbols: number;
  unmatchedRows: number;
  runId: string | null;
  error: string | null;
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

export async function runBulkEodIngest(date = previousUtcBusinessDate()): Promise<BulkEodIngestResult> {
  const normalizedDate = normalizeDate(date);
  const key = process.env.FMP_API_KEY;
  if (!key) return failedResult(normalizedDate, "FMP_API_KEY missing");

  const gate = await canUse("fmp", FMP_DAILY_LIMIT, FMP_RESERVE);
  if (!gate.ok) return failedResult(normalizedDate, gate.reason ?? "FMP quota unavailable");

  const [assets, sourceId] = await Promise.all([loadActiveAssets(), sourceIdForFmp()]);
  if (!sourceId) return failedResult(normalizedDate, "FMP data source is not registered");

  const runId = await beginRun(sourceId, normalizedDate);
  try {
    const url = new URL(FMP_EOD_BULK_URL);
    url.searchParams.set("date", normalizedDate);
    url.searchParams.set("apikey", key);
    const response = await fetch(url.toString());
    if (!response.ok) {
      const status =
        response.status === 429
          ? "rate_limit"
          : response.status === 401 || response.status === 403
            ? "auth"
            : "error";
      await recordCall("fmp", status, `eod-bulk HTTP ${response.status}`);
      throw new Error(
        response.status === 402 || response.status === 403
          ? `FMP EOD Bulk is not available to the configured API plan (HTTP ${response.status})`
          : `FMP EOD Bulk HTTP ${response.status}`,
      );
    }

    const payload = await response.json() as unknown;
    await recordCall("fmp", "ok");
    if (!Array.isArray(payload)) throw new Error("FMP EOD Bulk returned a non-array payload");
    const providerRows = payload as FmpBulkEodRow[];
    if (!providerRows.length) {
      await finishRun(runId, "success", 0, { date: normalizedDate, providerRows: 0, noData: true });
      return {
        status: "no_data",
        date: normalizedDate,
        provider: "fmp",
        activeAssets: assets.length,
        providerRows: 0,
        matchedAssets: 0,
        insertedRows: 0,
        invalidRows: 0,
        ambiguousSymbols: 0,
        unmatchedRows: 0,
        runId,
        error: null,
      };
    }

    const matchIndex = buildAssetMatchIndex(assets);
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
    let invalidRows = 0;
    let ambiguousSymbols = 0;
    let unmatchedRows = 0;

    for (const raw of providerRows) {
      const bar = normalizeBar(raw, normalizedDate);
      if (!bar) {
        invalidRows += 1;
        continue;
      }
      const matched = matchAsset(raw, matchIndex);
      if (matched.kind === "ambiguous") {
        ambiguousSymbols += 1;
        continue;
      }
      if (!matched.assetId) {
        unmatchedRows += 1;
        continue;
      }
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
      date: normalizedDate,
      providerRows: providerRows.length,
      matchedAssets: inserts.length,
      invalidRows,
      ambiguousSymbols,
      unmatchedRows,
      sourceKind: "fmp_eod_bulk",
    });

    return {
      status: "success",
      date: normalizedDate,
      provider: "fmp",
      activeAssets: assets.length,
      providerRows: providerRows.length,
      matchedAssets: inserts.length,
      insertedRows,
      invalidRows,
      ambiguousSymbols,
      unmatchedRows,
      runId,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishRun(runId, "failed", 0, { date: normalizedDate }, message);
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
      result.error?.includes("not available to the configured API plan") ||
      result.error?.includes("quota")
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
    const exchange = normalizeExchange(asset.exchange);
    if (exchange) bySymbolExchange.set(`${symbol}:${exchange}`, asset.id);
  }
  return { bySymbol, bySymbolExchange };
}

function matchAsset(
  raw: FmpBulkEodRow,
  index: ReturnType<typeof buildAssetMatchIndex>,
): { assetId: string | null; kind: "exact" | "symbol" | "ambiguous" | "missing" } {
  const symbol = String(raw.symbol ?? "").trim().toUpperCase();
  if (!symbol) return { assetId: null, kind: "missing" };
  const exchange = normalizeExchange(raw.exchangeShortName ?? raw.exchange ?? null);
  if (exchange) {
    const exact = index.bySymbolExchange.get(`${symbol}:${exchange}`);
    if (exact) return { assetId: exact, kind: "exact" };
  }
  const candidates = index.bySymbol.get(symbol) ?? [];
  if (candidates.length === 1) return { assetId: candidates[0].id, kind: "symbol" };
  if (candidates.length > 1) return { assetId: null, kind: "ambiguous" };
  return { assetId: null, kind: "missing" };
}

function normalizeBar(raw: FmpBulkEodRow, expectedDate: string) {
  const symbol = String(raw.symbol ?? "").trim();
  const date = String(raw.date ?? expectedDate).slice(0, 10);
  const open = positive(raw.open);
  const high = positive(raw.high);
  const low = positive(raw.low);
  const close = positive(raw.close);
  const adjClose = positive(raw.adjClose);
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

async function sourceIdForFmp(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("data_sources")
    .select("id")
    .eq("provider_code", "fmp")
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
      details: { date, endpoint: "eod-bulk" },
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

function normalizeExchange(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!normalized) return null;
  const aliases: Record<string, string> = {
    NASDAQ: "XNAS", XNAS: "XNAS",
    NYSE: "XNYS", XNYS: "XNYS",
    AMEX: "XASE", XASE: "XASE", NYSEAMERICAN: "XASE",
    LSE: "XLON", XLON: "XLON",
    XETRA: "XETR", XETR: "XETR",
    PAR: "XPAR", XPAR: "XPAR", EURONEXT: "XPAR",
    AMS: "XAMS", XAMS: "XAMS",
    BRU: "XBRU", XBRU: "XBRU",
    LIS: "XLIS", XLIS: "XLIS",
    MIL: "XMIL", XMIL: "XMIL",
    MC: "XMAD", XMAD: "XMAD",
    STO: "XSTO", XSTO: "XSTO",
    CPH: "XCSE", XCSE: "XCSE",
    HEL: "XHEL", XHEL: "XHEL",
    WSE: "XWAR", XWAR: "XWAR",
    VIE: "XWBO", XWBO: "XWBO",
  };
  return aliases[normalized] ?? normalized;
}

function normalizeDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Invalid EOD date ${value}`);
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid EOD date ${value}`);
  return value;
}

function previousUtcBusinessDate(now = new Date()): string {
  const value = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 12));
  while (value.getUTCDay() === 0 || value.getUTCDay() === 6) value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

function positive(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function nonNegative(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function failedResult(date: string, error: string): BulkEodIngestResult {
  return {
    status: "failed",
    date,
    provider: "fmp",
    activeAssets: 0,
    providerRows: 0,
    matchedAssets: 0,
    insertedRows: 0,
    invalidRows: 0,
    ambiguousSymbols: 0,
    unmatchedRows: 0,
    runId: null,
    error,
  };
}

// New migration tables/functions are accessed before generated Supabase types are refreshed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function looseDb(): any {
  return supabaseAdmin as any;
}
