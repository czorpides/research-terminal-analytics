import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { computeConfidence } from "@/lib/reliability/confidence";
import { computeMomentum, MOMENTUM_CALC_VERSION } from "./momentum.server";
import { computeTrend, TREND_CALC_VERSION } from "./trend.server";
import { computeVolatility, VOL_CALC_VERSION } from "./volatility.server";
import type { Bar } from "./series";

export interface ScoreRunResult { assetsScored: number; failures: number }
export interface ScoreRunResultDetailed extends ScoreRunResult { blocked: number; blockedAssets: string[] }

async function loadBars(assetId: string): Promise<Bar[]> {
  const { data } = await supabaseAdmin
    .from("prices_daily")
    .select("trade_date, close, volume")
    .eq("asset_id", assetId)
    .order("trade_date", { ascending: true })
    .limit(2000);
  return (data ?? [])
    .filter((r) => r.close !== null)
    .map((r) => ({ date: r.trade_date as string, close: Number(r.close), volume: r.volume === null ? null : Number(r.volume) }));
}

export async function runScoresForAsset(assetId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    // Quality gate: block scoring if the latest Stooq ingestion run for this
    // asset's symbol was blocked by QC.
    const { data: asset } = await supabaseAdmin.from("assets").select("symbol").eq("id", assetId).maybeSingle();
    const symbol = asset?.symbol as string | undefined;
    if (symbol) {
      const { data: stooqSource } = await supabaseAdmin
        .from("data_sources").select("id").eq("provider_code", "stooq").maybeSingle();
      if (stooqSource?.id) {
        const { data: recent } = await supabaseAdmin
          .from("ingestion_runs")
          .select("status, error, details, started_at")
          .eq("source_id", stooqSource.id as string)
          .eq("data_category", "price_daily")
          .order("started_at", { ascending: false })
          .limit(200);
        const match = (recent ?? []).find((r) => {
          const d = r.details as { symbol?: string } | null;
          return d?.symbol === symbol;
        });
        if (match && match.status === "failed") {
          return { ok: false, error: `quality_gate_blocked: ${match.error ?? "unknown"}` };
        }
      }
    }

    const bars = await loadBars(assetId);
    if (bars.length === 0) return { ok: false, error: "no prices" };
    const latest = bars[bars.length - 1];
    const ageSec = Math.max(0, Math.floor((Date.now() - new Date(`${latest.date}T21:00:00Z`).getTime()) / 1000));
    const dataConf = computeConfidence({ tier: "tier2_regulated", category: "price_daily", ageSeconds: ageSec });

    const momo = computeMomentum(bars);
    const trend = computeTrend(bars);
    const vol = computeVolatility(bars);
    const now = new Date().toISOString();

    const rows = [
      { subject_type: "asset", subject_id: assetId, score_type: "momentum",
        value: momo.value, confidence: Math.round(dataConf.value * 0.9),
        calc_version: MOMENTUM_CALC_VERSION, computed_at: now,
        inputs: momo.inputs, weights: {}, positives: momo.positives, deductions: momo.deductions },
      { subject_type: "asset", subject_id: assetId, score_type: "trend",
        value: trend.value, confidence: dataConf.value,
        calc_version: TREND_CALC_VERSION, computed_at: now,
        inputs: trend.inputs, weights: {}, positives: trend.positives, deductions: trend.deductions },
      { subject_type: "asset", subject_id: assetId, score_type: "volatility",
        value: vol.value, confidence: dataConf.value,
        calc_version: VOL_CALC_VERSION, computed_at: now,
        inputs: vol.inputs, weights: {}, positives: vol.positives, deductions: vol.deductions },
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabaseAdmin.from("scores").insert(rows as any);
    if (error) throw error;
    return { ok: true };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function runScoresForAllAssets(): Promise<ScoreRunResultDetailed> {
  const { data: assets } = await supabaseAdmin.from("assets").select("id").eq("active", true);
  let ok = 0, failed = 0, blocked = 0;
  const blockedAssets: string[] = [];
  for (const a of assets ?? []) {
    const r = await runScoresForAsset(a.id as string);
    if (r.ok) ok++;
    else if (r.error?.startsWith("quality_gate_blocked")) { blocked++; blockedAssets.push(a.id as string); }
    else failed++;
  }
  return { assetsScored: ok, failures: failed, blocked, blockedAssets };
}