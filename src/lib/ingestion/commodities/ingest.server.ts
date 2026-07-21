/**
 * Commodity spot ingestion via FMP /stable/quote. One row per commodity per
 * UTC day (unique on commodity_id + ts). Failures per symbol are logged but
 * don't abort the run.
 */
interface CommodityMap { code: string; fmpSymbol: string }

const FMP_MAP: CommodityMap[] = [
  { code: "WTI",    fmpSymbol: "CLUSD" },
  { code: "BRENT",  fmpSymbol: "BZUSD" },
  { code: "NG",     fmpSymbol: "NGUSD" },
  { code: "GOLD",   fmpSymbol: "GCUSD" },
  { code: "SILVER", fmpSymbol: "SIUSD" },
  { code: "COPPER", fmpSymbol: "HGUSD" },
  { code: "WHEAT",  fmpSymbol: "ZWUSD" },
  { code: "CORN",   fmpSymbol: "ZCUSD" },
  { code: "SOY",    fmpSymbol: "ZSUSD" },
];

export interface CommodityIngestResult {
  ok: boolean;
  ingested: number;
  skipped: string[];
  errors: string[];
}

export async function runCommoditiesIngest(): Promise<CommodityIngestResult> {
  const key = process.env.FMP_API_KEY;
  if (!key) return { ok: false, ingested: 0, skipped: [], errors: ["FMP_API_KEY missing"] };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: commodities } = await supabaseAdmin
    .from("commodities").select("id, code")
    .in("code", FMP_MAP.map((m) => m.code));
  const idByCode = new Map<string, string>();
  for (const c of commodities ?? []) idByCode.set(c.code as string, c.id as string);

  const skipped: string[] = [];
  const errors: string[] = [];
  let ingested = 0;

  for (const m of FMP_MAP) {
    const commodityId = idByCode.get(m.code);
    if (!commodityId) { skipped.push(m.code); continue; }
    try {
      const res = await fetch(
        `https://financialmodelingprep.com/stable/quote?symbol=${m.fmpSymbol}&apikey=${key}`,
      );
      if (!res.ok) { errors.push(`${m.code}: HTTP ${res.status}`); continue; }
      const j = await res.json() as unknown;
      const arr = Array.isArray(j) ? j as Array<{ price?: number; timestamp?: number }> : [];
      if (arr.length === 0 || arr[0].price == null) { errors.push(`${m.code}: empty response`); continue; }
      const q = arr[0];
      if (q.price == null) { errors.push(`${m.code}: no price`); continue; }
      const ts = q.timestamp ? new Date(q.timestamp * 1000) : new Date();
      const bucket = new Date(Date.UTC(ts.getUTCFullYear(), ts.getUTCMonth(), ts.getUTCDate(), 21, 0, 0));
      const { error } = await supabaseAdmin
        .from("commodity_prices")
        .upsert(
          { commodity_id: commodityId, ts: bucket.toISOString(), price: q.price },
          { onConflict: "commodity_id,ts" },
        );
      if (error) errors.push(`${m.code}: ${error.message}`);
      else ingested += 1;
      await new Promise((r) => setTimeout(r, 300));
    } catch (e) {
      errors.push(`${m.code}: ${(e as Error).message}`);
    }
  }

  return { ok: errors.length < FMP_MAP.length, ingested, skipped, errors };
}