import { computeConfidence } from "@/lib/reliability/confidence";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchStooqDaily } from "./client.server";
import { STOOQ_UNIVERSE, toStooqSymbol } from "./universe";
import { validateStooqBars, type QualityReport } from "./quality";

export interface StooqIngestResult {
  status: "success" | "failed";
  rowsInserted: number;
  runId: string;
  symbol: string;
  error?: string;
  quality?: QualityReport;
}

async function stooqSourceId(): Promise<string> {
  const { data } = await supabaseAdmin.from("data_sources").select("id").eq("provider_code", "stooq").maybeSingle();
  if (!data) throw new Error("Stooq source row missing");
  return data.id as string;
}

async function assetIdForSymbol(symbol: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from("assets").select("id").eq("symbol", symbol).eq("active", true).limit(1).maybeSingle();
  return (data?.id as string) ?? null;
}

export async function runStooqIngest(symbol: string): Promise<StooqIngestResult> {
  const sourceId = await stooqSourceId();
  const assetId = await assetIdForSymbol(symbol);
  if (!assetId) throw new Error(`Asset ${symbol} not in universe`);

  const { data: run } = await supabaseAdmin.from("ingestion_runs").insert({
    source_id: sourceId, data_category: "price_daily", status: "running", details: { symbol },
  }).select("id").single();
  const runId = run!.id as string;

  try {
    // Diff against last stored trade_date for this asset.
    const { data: last } = await supabaseAdmin
      .from("prices_daily").select("trade_date").eq("asset_id", assetId)
      .order("trade_date", { ascending: false }).limit(1).maybeSingle();
    const from = last?.trade_date
      ? new Date(new Date(last.trade_date as string).getTime() + 86400_000).toISOString().slice(0, 10)
      : new Date(Date.now() - 3 * 365 * 86400_000).toISOString().slice(0, 10);

    const bars = await fetchStooqDaily(toStooqSymbol(symbol), { from });
    const quality = validateStooqBars(bars, { existingLatest: (last?.trade_date as string) ?? null });
    const fresh = bars.filter((b) => b.close !== null && b.open !== null && b.high !== null && b.low !== null && (b.close ?? 0) > 0);

    if (quality.blocked) {
      await supabaseAdmin.from("ingestion_runs").update({
        status: "failed", finished_at: new Date().toISOString(), rows_ingested: 0,
        error: `Quality gate blocked: ${quality.issues.filter(i => i.severity === "block").map(i => i.code).join(", ")}`,
        details: { symbol, quality },
      }).eq("id", runId);
      return { status: "failed", rowsInserted: 0, runId, symbol, quality, error: "quality_gate_blocked" };
    }

    if (fresh.length === 0) {
      await supabaseAdmin.from("ingestion_runs").update({
        status: "success", finished_at: new Date().toISOString(), rows_ingested: 0,
        details: { symbol, quality },
      }).eq("id", runId);
      return { status: "success", rowsInserted: 0, runId, symbol, quality };
    }

    const rows = fresh.map((b) => ({
      asset_id: assetId,
      trade_date: b.date,
      open: b.open, high: b.high, low: b.low, close: b.close, adj_close: b.close, volume: b.volume,
      source_id: sourceId,
    }));

    const BATCH = 500;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabaseAdmin.from("prices_daily").upsert(chunk as any, { onConflict: "asset_id,trade_date", ignoreDuplicates: true });
      if (error) throw error;
      inserted += chunk.length;
    }

    await supabaseAdmin.from("ingestion_runs").update({
      status: "success", finished_at: new Date().toISOString(), rows_ingested: inserted,
      details: { symbol, quality },
    }).eq("id", runId);

    // Confidence for the latest bar → surfaced later by scorer.
    const latest = fresh[fresh.length - 1];
    const ageSec = Math.max(0, Math.floor((Date.now() - new Date(`${latest.date}T21:00:00Z`).getTime()) / 1000));
    computeConfidence({ tier: "tier2_regulated", category: "price_daily", ageSeconds: ageSec });

    return { status: "success", rowsInserted: inserted, runId, symbol };
  } catch (e) {
    await supabaseAdmin.from("ingestion_runs").update({
      status: "failed", finished_at: new Date().toISOString(), error: (e as Error).message,
    }).eq("id", runId);
    return { status: "failed", rowsInserted: 0, runId, symbol, error: (e as Error).message };
  }
}

export async function runAllStooqIngest(): Promise<StooqIngestResult[]> {
  const out: StooqIngestResult[] = [];
  for (const s of STOOQ_UNIVERSE) {
    try { out.push(await runStooqIngest(s.symbol)); }
    catch (e) { out.push({ status: "failed", rowsInserted: 0, runId: "", symbol: s.symbol, error: (e as Error).message }); }
    // gentle pacing on the free endpoint
    await new Promise((r) => setTimeout(r, 150));
  }
  return out;
}