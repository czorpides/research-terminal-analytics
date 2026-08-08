import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { FUNDAMENTAL_METRICS } from "@/lib/ingestion/fundamentals/metrics";
import {
  markProviderSymbolFailed,
  markProviderSymbolVerified,
  providerSymbolForAsset,
  type AssetProviderIdentity,
} from "@/lib/ingestion/providers/asset-symbols.server";
import { canUse, recordCall } from "@/lib/ingestion/providers/quota.server";
import {
  HISTORICAL_SELF_VALUATION_CODES,
  assessHistoricalSelfValuation,
  type CurrentValuationSnapshot,
  type HistoricalSelfValuationAssessment,
  type HistoricalValuationObservation,
} from "./historical-self-valuation";

const HISTORY_LIMIT = 10;

interface HistoricalValuationRow {
  asset_id: string;
  metric_code: string;
  period_end: string;
  value_num: number;
}

interface FmpHistoricalKeyMetric {
  date?: string;
  fiscalYear?: string;
  period?: string;
  marketCap?: number;
  enterpriseValue?: number;
  evToEBITDA?: number;
  evToEbitda?: number;
  freeCashFlowYield?: number;
  peRatio?: number;
  priceToEarningsRatio?: number;
  pbRatio?: number;
  priceToBookRatio?: number;
  ptbRatio?: number;
  priceToSalesRatio?: number;
  psRatio?: number;
  [key: string]: unknown;
}

export interface HistoricalValuationRefreshResult {
  assetId: string;
  symbol: string;
  providerSymbol: string | null;
  status: "success" | "skipped" | "failed";
  rowsWritten: number;
  annualPeriods: number;
  reason?: string;
}

/**
 * Backfills up to ten genuine annual FMP key-metric observations for one
 * asset. These are stored separately from current `data_points` snapshots so
 * the Radar cannot accidentally manufacture historical percentiles from
 * ingestion timestamps.
 */
export async function refreshHistoricalSelfValuationForAsset(
  assetId: string,
): Promise<HistoricalValuationRefreshResult> {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) {
    return {
      assetId,
      symbol: assetId,
      providerSymbol: null,
      status: "skipped",
      rowsWritten: 0,
      annualPeriods: 0,
      reason: "FMP_API_KEY missing",
    };
  }

  const { data: assetData, error: assetError } = await supabaseAdmin
    .from("assets")
    .select("id,symbol,exchange")
    .eq("id", assetId)
    .eq("active", true)
    .eq("asset_class", "equity")
    .maybeSingle();
  if (assetError) throw assetError;
  if (!assetData) throw new Error(`Asset ${assetId} not in active equity universe`);

  const asset: AssetProviderIdentity = {
    id: String(assetData.id),
    symbol: String(assetData.symbol),
    exchange: assetData.exchange ? String(assetData.exchange) : null,
  };
  const providerSymbol = await providerSymbolForAsset(asset, "fmp");
  if (!providerSymbol) {
    return {
      assetId,
      symbol: asset.symbol,
      providerSymbol: null,
      status: "skipped",
      rowsWritten: 0,
      annualPeriods: 0,
      reason: "No FMP provider symbol is mapped for this asset.",
    };
  }

  const { data: source, error: sourceError } = await supabaseAdmin
    .from("data_sources")
    .select("id")
    .eq("provider_code", "fmp")
    .maybeSingle();
  if (sourceError) throw sourceError;
  const sourceId = source?.id ? String(source.id) : null;
  if (!sourceId) throw new Error("FMP data source is not configured");

  const quota = await canUse("fmp", 250, 1);
  if (!quota.ok) {
    return {
      assetId,
      symbol: asset.symbol,
      providerSymbol,
      status: "skipped",
      rowsWritten: 0,
      annualPeriods: 0,
      reason: quota.reason,
    };
  }

  try {
    const query = new URLSearchParams({
      symbol: providerSymbol,
      period: "annual",
      limit: String(HISTORY_LIMIT),
      apikey: apiKey,
    });
    const response = await fetch(
      `https://financialmodelingprep.com/stable/key-metrics?${query.toString()}`,
    );
    if (response.status === 402) {
      await recordCall("fmp", "entitlement", "key-metrics historical HTTP 402");
      return {
        assetId,
        symbol: asset.symbol,
        providerSymbol,
        status: "skipped",
        rowsWritten: 0,
        annualPeriods: 0,
        reason: "FMP historical key-metrics entitlement unavailable (HTTP 402).",
      };
    }
    if (response.status === 429) {
      await recordCall("fmp", "rate_limit", "key-metrics historical HTTP 429");
      return {
        assetId,
        symbol: asset.symbol,
        providerSymbol,
        status: "skipped",
        rowsWritten: 0,
        annualPeriods: 0,
        reason: "FMP quota/rate limit reached (HTTP 429).",
      };
    }
    if (!response.ok) {
      await recordCall("fmp", "error", `key-metrics historical HTTP ${response.status}`);
      throw new Error(`FMP historical key-metrics HTTP ${response.status}`);
    }
    await recordCall("fmp", "ok");

    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload) || payload.length === 0) {
      await markProviderSymbolFailed(
        asset,
        "fmp",
        providerSymbol,
        "Historical key-metrics endpoint returned no annual observations.",
      );
      return {
        assetId,
        symbol: asset.symbol,
        providerSymbol,
        status: "failed",
        rowsWritten: 0,
        annualPeriods: 0,
        reason: "Historical key-metrics endpoint returned no annual observations.",
      };
    }

    const rows: Array<{
      asset_id: string;
      source_id: string;
      metric_code: string;
      period_end: string;
      fiscal_year: number | null;
      value_num: number;
      known_at: string;
      raw: FmpHistoricalKeyMetric;
    }> = [];

    for (const item of payload.slice(0, HISTORY_LIMIT) as FmpHistoricalKeyMetric[]) {
      const periodEnd = validDate(item.date);
      if (!periodEnd) continue;
      const fiscalYear = integer(item.fiscalYear) ?? Number(periodEnd.slice(0, 4));
      const values: Array<[string, number | null]> = [
        [FUNDAMENTAL_METRICS.evEbitda, firstPositive(item.evToEBITDA, item.evToEbitda)],
        [FUNDAMENTAL_METRICS.fcfYield, firstPositive(item.freeCashFlowYield)],
        [FUNDAMENTAL_METRICS.pe, firstPositive(item.peRatio, item.priceToEarningsRatio)],
        [FUNDAMENTAL_METRICS.pb, firstPositive(item.pbRatio, item.priceToBookRatio, item.ptbRatio)],
        [FUNDAMENTAL_METRICS.ps, firstPositive(item.priceToSalesRatio, item.psRatio)],
      ];
      for (const [metricCode, value] of values) {
        if (value === null) continue;
        rows.push({
          asset_id: asset.id,
          source_id: sourceId,
          metric_code: metricCode,
          period_end: periodEnd,
          fiscal_year: Number.isFinite(fiscalYear) ? fiscalYear : null,
          value_num: value,
          known_at: new Date().toISOString(),
          raw: item,
        });
      }
    }

    if (!rows.length) {
      return {
        assetId,
        symbol: asset.symbol,
        providerSymbol,
        status: "failed",
        rowsWritten: 0,
        annualPeriods: 0,
        reason: "Historical response contained no usable positive valuation observations.",
      };
    }

    const { error: upsertError } = await supabaseAdmin
      .from("historical_valuation_metrics")
      .upsert(rows, { onConflict: "asset_id,source_id,metric_code,period_end" });
    if (upsertError) throw upsertError;

    await markProviderSymbolVerified(asset, "fmp", providerSymbol);
    return {
      assetId,
      symbol: asset.symbol,
      providerSymbol,
      status: "success",
      rowsWritten: rows.length,
      annualPeriods: new Set(rows.map((row) => row.period_end)).size,
    };
  } catch (error) {
    return {
      assetId,
      symbol: asset.symbol,
      providerSymbol,
      status: "failed",
      rowsWritten: 0,
      annualPeriods: 0,
      reason: (error as Error).message,
    };
  }
}

/** Load stored annual observations for Radar assessment. */
export async function loadHistoricalSelfValuation(
  assetIds: string[],
): Promise<Map<string, HistoricalValuationObservation[]>> {
  const result = new Map<string, HistoricalValuationObservation[]>();
  for (let start = 0; start < assetIds.length; start += 75) {
    const batch = assetIds.slice(start, start + 75);
    const { data, error } = await supabaseAdmin
      .from("historical_valuation_metrics")
      .select("asset_id,metric_code,period_end,value_num")
      .in("asset_id", batch)
      .in("metric_code", [...HISTORICAL_SELF_VALUATION_CODES])
      .order("period_end", { ascending: false })
      .limit(batch.length * HISTORICAL_SELF_VALUATION_CODES.length * HISTORY_LIMIT);
    if (error) throw error;
    for (const row of (data ?? []) as HistoricalValuationRow[]) {
      const value = Number(row.value_num);
      if (!Number.isFinite(value)) continue;
      result.set(row.asset_id, [
        ...(result.get(row.asset_id) ?? []),
        {
          metricCode: row.metric_code,
          periodEnd: row.period_end,
          value,
        },
      ]);
    }
  }
  return result;
}

export function assessStoredHistoricalSelfValuation(
  current: CurrentValuationSnapshot,
  observations: HistoricalValuationObservation[] | undefined,
): HistoricalSelfValuationAssessment {
  return assessHistoricalSelfValuation(current, observations ?? []);
}

function firstPositive(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function integer(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function validDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  return value.slice(0, 10);
}
