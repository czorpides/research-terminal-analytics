import { fetchEodhdDaily, eodhdErrorMessage, eodhdNumber } from "@/lib/ingestion/providers/eodhd-market.server";

const METALS = [
  {
    symbol: "XAUUSD",
    providerSymbol: "XAUUSD.FOREX",
    name: "Gold Spot / US Dollar",
    commodityCode: "GOLD",
  },
  {
    symbol: "XAGUSD",
    providerSymbol: "XAGUSD.FOREX",
    name: "Silver Spot / US Dollar",
    commodityCode: "SILVER",
  },
] as const;

export interface SwingMetalsIngestResult {
  status: "success" | "partial" | "failed";
  startedAt: string;
  finishedAt: string;
  rowsUpserted: number;
  instruments: Array<{
    symbol: string;
    providerSymbol: string;
    rows: number;
    firstDate: string | null;
    lastDate: string | null;
    error: string | null;
  }>;
}

/**
 * Maintain a small, auditable precious-metals price surface for Swing Engine v2.
 * XAUUSD.FOREX and XAGUSD.FOREX are EODHD spot-FX instruments with full OHLC
 * history. The same closes are mirrored into commodity_prices so the older
 * commodity/macro panels keep benefiting from the improved history.
 */
export async function runSwingMetalsIngest(historyDays = 620): Promise<SwingMetalsIngestResult> {
  const startedAt = new Date().toISOString();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Keep this module deployable before generated Supabase types are refreshed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;

  const { data: sourceRow } = await db
    .from("data_sources")
    .select("id")
    .eq("provider_code", "eodhd")
    .maybeSingle();
  const sourceId = sourceRow?.id ? String(sourceRow.id) : null;

  const { data: assetRows, error: assetError } = await db
    .from("assets")
    .upsert(
      METALS.map((metal) => ({
        symbol: metal.symbol,
        name: metal.name,
        asset_class: "commodity",
        exchange: "FOREX",
        currency: "USD",
        active: true,
      })),
      { onConflict: "symbol,exchange" },
    )
    .select("id,symbol");
  if (assetError) throw assetError;
  const assetIds = new Map<string, string>(
    (assetRows ?? []).map((row: { id: string; symbol: string }) => [String(row.symbol), String(row.id)]),
  );

  const { data: commodityRows } = await db
    .from("commodities")
    .select("id,code")
    .in("code", METALS.map((metal) => metal.commodityCode));
  const commodityIds = new Map<string, string>(
    (commodityRows ?? []).map((row: { id: string; code: string }) => [String(row.code), String(row.id)]),
  );

  const run = sourceId
    ? await db.from("ingestion_runs").insert({
        source_id: sourceId,
        data_category: "commodity",
        status: "running",
        started_at: startedAt,
        details: { engine: "swing_v2", instruments: METALS.map((metal) => metal.providerSymbol) },
      }).select("id").maybeSingle()
    : { data: null, error: null };
  const runId = run.data?.id ? String(run.data.id) : null;

  const from = new Date(Date.now() - Math.max(300, Math.min(historyDays, 1_200)) * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const to = new Date().toISOString().slice(0, 10);
  const instruments: SwingMetalsIngestResult["instruments"] = [];
  let rowsUpserted = 0;

  for (const metal of METALS) {
    const assetId = assetIds.get(metal.symbol);
    if (!assetId) {
      instruments.push({
        symbol: metal.symbol,
        providerSymbol: metal.providerSymbol,
        rows: 0,
        firstDate: null,
        lastDate: null,
        error: "Metal asset could not be resolved after upsert.",
      });
      continue;
    }
    try {
      const payload = await fetchEodhdDaily(metal.providerSymbol, { from, to });
      const normalized = payload
        .map((row) => {
          const date = typeof row.date === "string" ? row.date.slice(0, 10) : null;
          const open = eodhdNumber(row.open);
          const high = eodhdNumber(row.high);
          const low = eodhdNumber(row.low);
          const close = eodhdNumber(row.close);
          const adjusted = eodhdNumber(row.adjusted_close) ?? close;
          if (!date || open === null || high === null || low === null || close === null || close <= 0) return null;
          if (high < Math.max(open, close, low) || low > Math.min(open, close, high)) return null;
          return {
            asset_id: assetId,
            trade_date: date,
            open,
            high,
            low,
            close,
            adj_close: adjusted,
            volume: eodhdNumber(row.volume),
            source_id: sourceId,
          };
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row))
        .sort((left, right) => left.trade_date.localeCompare(right.trade_date));

      for (let index = 0; index < normalized.length; index += 400) {
        const { error } = await db
          .from("prices_daily")
          .upsert(normalized.slice(index, index + 400), { onConflict: "asset_id,trade_date" });
        if (error) throw error;
      }

      const commodityId = commodityIds.get(metal.commodityCode);
      if (commodityId && normalized.length) {
        const closeRows = normalized.map((row) => ({
          commodity_id: commodityId,
          ts: `${row.trade_date}T21:00:00.000Z`,
          price: row.close,
          source_id: sourceId,
        }));
        for (let index = 0; index < closeRows.length; index += 400) {
          const { error } = await db
            .from("commodity_prices")
            .upsert(closeRows.slice(index, index + 400), { onConflict: "commodity_id,ts" });
          if (error) throw error;
        }
      }

      rowsUpserted += normalized.length;
      instruments.push({
        symbol: metal.symbol,
        providerSymbol: metal.providerSymbol,
        rows: normalized.length,
        firstDate: normalized[0]?.trade_date ?? null,
        lastDate: normalized.at(-1)?.trade_date ?? null,
        error: null,
      });
    } catch (error) {
      instruments.push({
        symbol: metal.symbol,
        providerSymbol: metal.providerSymbol,
        rows: 0,
        firstDate: null,
        lastDate: null,
        error: eodhdErrorMessage(error),
      });
    }
  }

  const failures = instruments.filter((item) => item.error);
  const status: SwingMetalsIngestResult["status"] = failures.length === 0
    ? "success"
    : failures.length === instruments.length
      ? "failed"
      : "partial";
  const finishedAt = new Date().toISOString();
  if (runId) {
    await db.from("ingestion_runs").update({
      status: status === "failed" ? "failed" : status,
      finished_at: finishedAt,
      rows_ingested: rowsUpserted,
      error: failures.length ? failures.map((item) => `${item.symbol}: ${item.error}`).join(" | ") : null,
      details: { engine: "swing_v2", instruments },
    }).eq("id", runId);
  }

  return { status, startedAt, finishedAt, rowsUpserted, instruments };
}
