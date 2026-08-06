import { computeSwingTradeV2 } from "@/lib/swing/model-v21";
import { loadPreciousMetalMacroContexts } from "@/lib/swing/context-v2.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const out: any = {};
const macro = await loadPreciousMetalMacroContexts();
for (const symbol of ["XAUUSD", "XAGUSD"] as const) {
  const { data: asset } = await supabaseAdmin.from("assets").select("id,symbol,name,exchange,currency,asset_class,active").eq("symbol", symbol).maybeSingle();
  if (!asset) { out[symbol] = { error: "asset missing" }; continue; }
  const { data: rows } = await supabaseAdmin.from("prices_daily").select("trade_date,open,high,low,close,adj_close,volume").eq("asset_id", asset.id).order("trade_date", { ascending: false }).limit(400);
  const bars = (rows ?? []).map((r: any) => ({ date: r.trade_date, open: Number(r.open ?? r.close), high: Number(r.high ?? r.close), low: Number(r.low ?? r.close), close: Number(r.adj_close ?? r.close), volume: r.volume === null ? null : Number(r.volume) }))
    .filter((b: any) => Number.isFinite(b.close)).reverse();
  const setup = computeSwingTradeV2(bars, { existingMomentum: null, existingTrend: null, quality: null, valuation: null, catalyst: { score: null, label: null, confidence: 0, daysToEarnings: null, positiveRevision: false, negativeRevision: false, reasons: [], risks: [] }, macro: macro[symbol], instrumentType: "commodity" } as any);
  out[symbol] = { asset, bars: bars.length, priceAsOf: bars.at(-1)?.date, macro: macro[symbol], setup };
}
console.log(JSON.stringify(out, null, 1));
