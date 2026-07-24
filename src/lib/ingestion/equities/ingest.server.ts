import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { computeConfidence } from "@/lib/reliability/confidence";
import { fetchWithFailover, crossVerifyLatest } from "@/lib/ingestion/providers/registry.server";
import type { ProviderCode } from "@/lib/ingestion/providers/types";
import { validateStooqBars, type QualityReport } from "@/lib/ingestion/stooq/quality";
import { STOOQ_UNIVERSE } from "@/lib/ingestion/stooq/universe";

export interface EquityIngestResult {
  status: "success" | "failed";
  rowsInserted: number;
  runId: string;
  symbol: string;
  provider?: ProviderCode;
  crossVerify?: { verifier: string | null; agrees: boolean; detail: string; delta?: number };
  attempts?: Array<{ provider: string; error: string }>;
  quality?: QualityReport;
  scoreRefresh?: { ok: boolean; error?: string };
  error?: string;
}

async function sourceIdFor(providerCode: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("data_sources")
    .select("id")
    .eq("provider_code", providerCode)
    .maybeSingle();
  return (data?.id as string) ?? null;
}

async function assetIdForSymbol(symbol: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("assets")
    .select("id")
    .eq("symbol", symbol)
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  return (data?.id as string) ?? null;
}

/**
 * Multi-provider equity ingester. Uses the reliability-pool `fetchWithFailover`
 * (Tiingo → Twelve Data → FMP → Alpha Vantage) and cross-verifies the latest
 * close against a second provider. Writes append-only into `prices_daily` and
 * records the run under whichever provider actually served the data.
 */
export async function runEquityIngest(symbol: string): Promise<EquityIngestResult> {
  const assetId = await assetIdForSymbol(symbol);
  if (!assetId) throw new Error(`Asset ${symbol} not in universe`);

  // Record the run against the Stooq source row for continuity with existing
  // Data Health views; the actual serving provider is captured in `details.provider`.
  const bookkeepingSourceId = (await sourceIdFor("stooq")) ?? (await sourceIdFor("tiingo"));
  if (!bookkeepingSourceId) throw new Error("No equity data source registered");

  const { data: run } = await supabaseAdmin
    .from("ingestion_runs")
    .insert({
      source_id: bookkeepingSourceId,
      data_category: "price_daily",
      status: "running",
      details: { symbol },
    })
    .select("id")
    .single();
  const runId = run!.id as string;

  try {
    const { data: last } = await supabaseAdmin
      .from("prices_daily")
      .select("trade_date")
      .eq("asset_id", assetId)
      .order("trade_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    const from = last?.trade_date
      ? new Date(new Date(last.trade_date as string).getTime() + 86400_000)
          .toISOString()
          .slice(0, 10)
      : new Date(Date.now() - 3 * 365 * 86400_000).toISOString().slice(0, 10);
    const to = new Date().toISOString().slice(0, 10);

    const { provider, bars, attempts } = await fetchWithFailover(symbol, { from, to });
    const servedSourceId = (await sourceIdFor(provider)) ?? bookkeepingSourceId;

    // Reuse Stooq quality gate — the shape (open/high/low/close/volume/date) is identical.
    const quality = validateStooqBars(bars, {
      existingLatest: (last?.trade_date as string) ?? null,
    });
    const fresh = bars.filter(
      (b) =>
        b.close !== null &&
        b.open !== null &&
        b.high !== null &&
        b.low !== null &&
        (b.close ?? 0) > 0,
    );

    if (quality.blocked) {
      await supabaseAdmin
        .from("ingestion_runs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          rows_ingested: 0,
          error: `Quality gate blocked: ${quality.issues
            .filter((i) => i.severity === "block")
            .map((i) => i.code)
            .join(", ")}`,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          details: { symbol, provider, quality, attempts } as any,
        })
        .eq("id", runId);
      return {
        status: "failed",
        rowsInserted: 0,
        runId,
        symbol,
        provider,
        quality,
        attempts,
        error: "quality_gate_blocked",
      };
    }

    let inserted = 0;
    if (fresh.length > 0) {
      const rows = fresh.map((b) => ({
        asset_id: assetId,
        trade_date: b.date,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        adj_close: b.adjClose ?? b.close,
        volume: b.volume,
        source_id: servedSourceId,
      }));
      const BATCH = 500;
      for (let i = 0; i < rows.length; i += BATCH) {
        const chunk = rows.slice(i, i + BATCH);
        const { error } = await supabaseAdmin
          .from("prices_daily")
          .upsert(chunk, { onConflict: "asset_id,trade_date", ignoreDuplicates: true });
        if (error) throw error;
        inserted += chunk.length;
      }
    }

    // Cross-verify the latest close against a second provider.
    let crossVerify: EquityIngestResult["crossVerify"];
    const latest = fresh[fresh.length - 1];
    if (latest) {
      const cv = await crossVerifyLatest(symbol, provider, latest.close, latest.date);
      crossVerify = {
        verifier: cv.verifier,
        agrees: cv.agrees,
        detail: cv.detail,
        delta: cv.delta,
      };
      const ageSec = Math.max(
        0,
        Math.floor((Date.now() - new Date(`${latest.date}T21:00:00Z`).getTime()) / 1000),
      );
      computeConfidence({
        tier: "tier2_regulated",
        category: "price_daily",
        ageSeconds: ageSec,
        crossSourceAgreement: cv.verifier ? (cv.agrees ? 1 : 0) : undefined,
      });
    }

    await supabaseAdmin
      .from("ingestion_runs")
      .update({
        status: "success",
        finished_at: new Date().toISOString(),
        rows_ingested: inserted,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        details: { symbol, provider, quality, attempts, crossVerify } as any,
      })
      .eq("id", runId);

    // Keep technical evidence current whenever a daily price refresh succeeds.
    // Fundamental peer ranks are refreshed separately after earnings.
    let scoreRefresh: EquityIngestResult["scoreRefresh"];
    try {
      const { runScoresForAsset } = await import("@/lib/scoring/run.server");
      scoreRefresh = await runScoresForAsset(assetId);
    } catch (error) {
      scoreRefresh = { ok: false, error: (error as Error).message };
    }

    return {
      status: "success",
      rowsInserted: inserted,
      runId,
      symbol,
      provider,
      quality,
      attempts,
      crossVerify,
      scoreRefresh,
    };
  } catch (e) {
    await supabaseAdmin
      .from("ingestion_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error: (e as Error).message,
      })
      .eq("id", runId);
    return { status: "failed", rowsInserted: 0, runId, symbol, error: (e as Error).message };
  }
}

export async function runAllEquityIngest(): Promise<EquityIngestResult[]> {
  const out: EquityIngestResult[] = [];
  for (const s of STOOQ_UNIVERSE) {
    try {
      out.push(await runEquityIngest(s.symbol));
    } catch (e) {
      out.push({
        status: "failed",
        rowsInserted: 0,
        runId: "",
        symbol: s.symbol,
        error: (e as Error).message,
      });
    }
    // pacing to respect Twelve Data's 8s spacing when it becomes primary
    await new Promise((r) => setTimeout(r, 300));
  }
  return out;
}
