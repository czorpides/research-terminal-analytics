import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  markProviderSymbolFailed,
  markProviderSymbolVerified,
  providerSymbolForAsset,
  type AssetProviderIdentity,
} from "@/lib/ingestion/providers/asset-symbols.server";
import {
  eodhdErrorMessage,
  eodhdNumber,
  fetchEodhdDaily,
  type EodhdDailyRow,
} from "@/lib/ingestion/providers/eodhd-market.server";

export interface AdjustedHistoryReconciliationResult {
  requested: number;
  claimed: number;
  completed: number;
  failed: number;
  rowsUpserted: number;
  results: Array<{
    assetId: string;
    symbol: string;
    providerSymbol: string | null;
    status: "success" | "failed";
    rowsUpserted: number;
    scoreRefreshOk: boolean;
    error: string | null;
  }>;
}

interface ClaimedAsset {
  asset_id: string;
  symbol: string;
  exchange: string | null;
}

/**
 * Reconcile the last ~520 calendar days from EODHD's single-symbol history.
 * One request costs one EODHD API unit regardless of history length. This is a
 * corporate-action maintenance path: it allows historical adjusted closes to
 * change after dividends/splits without disturbing the daily bulk EOD engine.
 */
export async function runAdjustedHistoryReconciliationBatch(
  limit = 50,
): Promise<AdjustedHistoryReconciliationResult> {
  const requested = clampInteger(limit, 1, 100);
  // Queue/RPC is introduced by migration and deliberately kept server-only.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;
  const { data, error } = await db.rpc("claim_opportunity_adjusted_history_batch", {
    p_limit: requested,
  });
  if (error) throw error;

  const claimed = (data ?? []) as ClaimedAsset[];
  const results: AdjustedHistoryReconciliationResult["results"] = [];
  let completed = 0;
  let failed = 0;
  let rowsUpserted = 0;

  for (const row of claimed) {
    const asset: AssetProviderIdentity = {
      id: String(row.asset_id),
      symbol: String(row.symbol),
      exchange: row.exchange ? String(row.exchange) : null,
    };
    const providerSymbol = await providerSymbolForAsset(asset, "eodhd");
    if (!providerSymbol) {
      const message = "No usable EODHD provider-symbol mapping is available.";
      await finishQueue(asset.id, "failed", 0, message);
      results.push({
        assetId: asset.id,
        symbol: asset.symbol,
        providerSymbol: null,
        status: "failed",
        rowsUpserted: 0,
        scoreRefreshOk: false,
        error: message,
      });
      failed += 1;
      continue;
    }

    try {
      const to = new Date().toISOString().slice(0, 10);
      const from = new Date(Date.now() - 520 * 86_400_000).toISOString().slice(0, 10);
      const rows = await fetchEodhdDaily(providerSymbol, { from, to });
      const normalized = rows.flatMap((raw) => normalizeRow(raw, asset.id));
      if (normalized.length < 200) {
        throw new Error(`EODHD adjusted-history reconciliation returned only ${normalized.length} valid rows`);
      }

      const sourceId = await eodhdSourceId();
      if (!sourceId) throw new Error("EODHD data source is not registered");
      let upserted = 0;
      for (let start = 0; start < normalized.length; start += 500) {
        const batch = normalized.slice(start, start + 500).map((entry) => ({
          ...entry,
          source_id: sourceId,
        }));
        const { error: upsertError } = await supabaseAdmin
          .from("prices_daily")
          .upsert(batch, { onConflict: "asset_id,trade_date", ignoreDuplicates: false });
        if (upsertError) throw upsertError;
        upserted += batch.length;
      }

      await markProviderSymbolVerified(asset, "eodhd", providerSymbol);
      const { runScoresForAsset } = await import("@/lib/scoring/run.server");
      const scoreRefresh = await runScoresForAsset(asset.id);
      await finishQueue(asset.id, "complete", upserted, scoreRefresh.ok ? null : scoreRefresh.error ?? "score refresh failed");
      results.push({
        assetId: asset.id,
        symbol: asset.symbol,
        providerSymbol,
        status: "success",
        rowsUpserted: upserted,
        scoreRefreshOk: scoreRefresh.ok,
        error: scoreRefresh.ok ? null : scoreRefresh.error ?? "score refresh failed",
      });
      completed += 1;
      rowsUpserted += upserted;
    } catch (error) {
      const message = eodhdErrorMessage(error);
      if (isSymbolFailure(message)) {
        await markProviderSymbolFailed(asset, "eodhd", providerSymbol, message);
      }
      await finishQueue(asset.id, "failed", 0, message);
      results.push({
        assetId: asset.id,
        symbol: asset.symbol,
        providerSymbol,
        status: "failed",
        rowsUpserted: 0,
        scoreRefreshOk: false,
        error: message,
      });
      failed += 1;
    }
  }

  return {
    requested,
    claimed: claimed.length,
    completed,
    failed,
    rowsUpserted,
    results,
  };
}

function normalizeRow(raw: EodhdDailyRow, assetId: string) {
  const tradeDate = typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date)
    ? raw.date
    : null;
  const open = eodhdNumber(raw.open);
  const high = eodhdNumber(raw.high);
  const low = eodhdNumber(raw.low);
  const close = eodhdNumber(raw.close);
  const adjusted = eodhdNumber(raw.adjusted_close);
  const volume = eodhdNumber(raw.volume);
  if (
    !tradeDate ||
    open === null ||
    high === null ||
    low === null ||
    close === null ||
    open <= 0 ||
    high <= 0 ||
    low <= 0 ||
    close <= 0 ||
    high < Math.max(open, close, low) ||
    low > Math.min(open, close, high)
  ) {
    return [];
  }
  return [{
    asset_id: assetId,
    trade_date: tradeDate,
    open,
    high,
    low,
    close,
    adj_close: adjusted && adjusted > 0 ? adjusted : close,
    volume,
  }];
}

async function finishQueue(
  assetId: string,
  status: "complete" | "failed",
  rowsUpserted: number,
  error: string | null,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;
  await db
    .from("opportunity_adjusted_history_reconciliation")
    .update({
      status,
      rows_upserted: rowsUpserted,
      last_error: error,
      last_success_at: status === "complete" ? new Date().toISOString() : undefined,
      updated_at: new Date().toISOString(),
    })
    .eq("asset_id", assetId);
}

async function eodhdSourceId(): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("data_sources")
    .select("id")
    .eq("provider_code", "eodhd")
    .maybeSingle();
  if (error) throw error;
  return data?.id ? String(data.id) : null;
}

function isSymbolFailure(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("http 404") || normalized.includes("not found") || normalized.includes("invalid symbol");
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  const integer = Math.floor(Number.isFinite(value) ? value : minimum);
  return Math.max(minimum, Math.min(maximum, integer));
}
