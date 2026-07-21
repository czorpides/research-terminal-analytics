import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { FUNDAMENTAL_METRICS } from "./metrics";

export interface FundamentalsIngestResult {
  status: "success" | "failed" | "skipped";
  symbol: string;
  runId: string;
  rowsInserted: number;
  values?: Record<string, number | null>;
  error?: string;
}

interface FmpKeyMetrics {
  marketCap?: number;
  evToEBITDATTM?: number;
  freeCashFlowYieldTTM?: number;
  returnOnEquityTTM?: number;
  returnOnInvestedCapitalTTM?: number;
  currentRatioTTM?: number;
}
interface FmpRatios {
  priceToEarningsRatioTTM?: number;
  priceToBookRatioTTM?: number;
  priceToSalesRatioTTM?: number;
  grossProfitMarginTTM?: number;
  netProfitMarginTTM?: number;
  debtToEquityRatioTTM?: number;
  currentRatioTTM?: number;
}
interface FmpProfile {
  marketCap?: number;
  beta?: number;
}

async function fmp<T>(endpoint: string, symbol: string, apiKey: string): Promise<T[] | null> {
  const url = `https://financialmodelingprep.com/stable/${endpoint}?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FMP ${endpoint} HTTP ${res.status}`);
  const j = (await res.json()) as unknown;
  if (!Array.isArray(j)) return null;
  return j as T[];
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function runFundamentalsIngest(symbol: string): Promise<FundamentalsIngestResult> {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) throw new Error("FMP_API_KEY missing");

  const { data: asset } = await supabaseAdmin.from("assets")
    .select("id").eq("symbol", symbol).eq("active", true).maybeSingle();
  if (!asset) throw new Error(`Asset ${symbol} not in universe`);
  const assetId = asset.id as string;

  const { data: source } = await supabaseAdmin.from("data_sources")
    .select("id").eq("provider_code", "fmp").maybeSingle();
  const sourceId = (source?.id as string | undefined) ?? null;

  const { data: run } = await supabaseAdmin.from("ingestion_runs").insert({
    source_id: sourceId ?? asset.id, data_category: "fundamentals",
    status: "running", details: { symbol, category: "fundamentals" },
  }).select("id").single();
  const runId = run!.id as string;

  try {
    const [km, ra, pr] = await Promise.all([
      fmp<FmpKeyMetrics>("key-metrics-ttm", symbol, apiKey),
      fmp<FmpRatios>("ratios-ttm", symbol, apiKey),
      fmp<FmpProfile>("profile", symbol, apiKey),
    ]);
    const k = km?.[0] ?? {};
    const r = ra?.[0] ?? {};
    const p = pr?.[0] ?? {};

    const marketCap = num(p.marketCap ?? k.marketCap);
    if (!marketCap) throw new Error("missing marketCap — provider returned empty payload");

    const values: Record<string, number | null> = {
      [FUNDAMENTAL_METRICS.pe]:           num(r.priceToEarningsRatioTTM),
      [FUNDAMENTAL_METRICS.pb]:           num(r.priceToBookRatioTTM),
      [FUNDAMENTAL_METRICS.ps]:           num(r.priceToSalesRatioTTM),
      [FUNDAMENTAL_METRICS.evEbitda]:     num(k.evToEBITDATTM),
      [FUNDAMENTAL_METRICS.fcfYield]:     num(k.freeCashFlowYieldTTM),
      [FUNDAMENTAL_METRICS.roe]:          num(k.returnOnEquityTTM),
      [FUNDAMENTAL_METRICS.roic]:         num(k.returnOnInvestedCapitalTTM),
      [FUNDAMENTAL_METRICS.grossMargin]:  num(r.grossProfitMarginTTM),
      [FUNDAMENTAL_METRICS.netMargin]:    num(r.netProfitMarginTTM),
      [FUNDAMENTAL_METRICS.debtEquity]:   num(r.debtToEquityRatioTTM),
      [FUNDAMENTAL_METRICS.currentRatio]: num(k.currentRatioTTM ?? r.currentRatioTTM),
      [FUNDAMENTAL_METRICS.marketCap]:    marketCap,
      [FUNDAMENTAL_METRICS.beta]:         num(p.beta),
    };

    // Quality gate — reject negative values where they are impossible.
    const negativeImpossible = new Set<string>([
      FUNDAMENTAL_METRICS.grossMargin, FUNDAMENTAL_METRICS.currentRatio, FUNDAMENTAL_METRICS.marketCap,
    ]);
    for (const [code, v] of Object.entries(values)) {
      if (v !== null && v < 0 && negativeImpossible.has(code)) values[code] = null;
    }

    const asOf = new Date().toISOString();
    const rows = Object.entries(values)
      .filter(([, v]) => v !== null)
      .map(([metric_code, value_num]) => ({
        subject_type: "asset" as const, subject_id: assetId,
        metric_code, value_num, as_of: asOf, source_id: sourceId,
        confidence: 90, penalties: [] as unknown as object,
        raw: null as unknown as object,
      }));

    if (rows.length === 0) throw new Error("no usable fundamentals fields returned");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabaseAdmin.from("data_points").insert(rows as any);
    if (error) throw error;

    await supabaseAdmin.from("ingestion_runs").update({
      status: "success", finished_at: new Date().toISOString(), rows_ingested: rows.length,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      details: { symbol, provider: "fmp", values } as any,
    }).eq("id", runId);

    return { status: "success", symbol, runId, rowsInserted: rows.length, values };
  } catch (e) {
    await supabaseAdmin.from("ingestion_runs").update({
      status: "failed", finished_at: new Date().toISOString(), error: (e as Error).message,
    }).eq("id", runId);
    return { status: "failed", symbol, runId, rowsInserted: 0, error: (e as Error).message };
  }
}

export async function runAllFundamentalsIngest(opts: { symbols?: string[] } = {}): Promise<FundamentalsIngestResult[]> {
  let syms = opts.symbols;
  if (!syms) {
    const { data } = await supabaseAdmin.from("assets").select("symbol").eq("active", true);
    syms = (data ?? []).map((a) => a.symbol as string);
  }
  const out: FundamentalsIngestResult[] = [];
  for (const s of syms) {
    try { out.push(await runFundamentalsIngest(s)); }
    catch (e) { out.push({ status: "failed", symbol: s, runId: "", rowsInserted: 0, error: (e as Error).message }); }
    // Pace FMP calls (~4/sec well under free-tier).
    await new Promise((r) => setTimeout(r, 250));
  }
  return out;
}