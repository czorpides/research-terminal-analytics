import { WIKIPEDIA_TITLES, WIKIPEDIA_ATTENTION_VERSION } from "./wikipedia";

/**
 * Wikipedia pageview ingestion. For each tracked asset we pull the last ~90
 * days of daily pageviews, compute a z-score of today vs the trailing 60-day
 * baseline, and store both the raw pageview count and the anomaly score in
 * alt_data_signals (subject_type='asset').
 *
 * Two signal codes are written per asset:
 *  - WIKI_PV_DAILY   → raw pageview count, one row per day
 *  - WIKI_ATTENTION  → single "today" row with z-score in `value` and
 *                      supporting stats in `meta` (baseline, sd, spikePct)
 *
 * Everything is Tier 4 alt-data — visible confidence penalty on the panel.
 */

export interface AssetIngestResult {
  symbol: string;
  status: "success" | "failed" | "skipped";
  rowsInserted: number;
  zScore?: number;
  error?: string;
}

export interface AltDataIngestSummary {
  ranAt: string;
  provider: "wikipedia_pv";
  version: string;
  results: AssetIngestResult[];
  totals: { success: number; failed: number; skipped: number; rows: number };
}

const USER_AGENT = "LovableResearchTerminal/0.1 (alt-data attention signal; contact via project)";
const WIKI_HOST = "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/all-agents";

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

async function fetchPageviews(article: string, days = 90): Promise<Array<{ date: string; views: number }>> {
  const end = new Date(Date.now() - 2 * 86_400_000); // Wikipedia trails ~2d
  const start = new Date(end.getTime() - days * 86_400_000);
  const url = `${WIKI_HOST}/${article}/daily/${fmtDate(start)}/${fmtDate(end)}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Accept": "application/json" } });
  if (!res.ok) throw new Error(`Wikipedia ${res.status} for ${article}`);
  const json = (await res.json()) as { items?: Array<{ timestamp: string; views: number }> };
  return (json.items ?? []).map((it) => ({
    date: `${it.timestamp.slice(0, 4)}-${it.timestamp.slice(4, 6)}-${it.timestamp.slice(6, 8)}`,
    views: it.views,
  }));
}

function zScore(latest: number, series: number[]): { z: number; mean: number; sd: number } {
  if (series.length < 5) return { z: 0, mean: latest, sd: 0 };
  const mean = series.reduce((a, b) => a + b, 0) / series.length;
  const variance = series.reduce((a, b) => a + (b - mean) ** 2, 0) / series.length;
  const sd = Math.sqrt(variance);
  return { z: sd === 0 ? 0 : (latest - mean) / sd, mean, sd };
}

export async function runAltDataIngest(): Promise<AltDataIngestSummary> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: source } = await supabaseAdmin
    .from("data_sources").select("id").eq("provider_code", "wikipedia_pv").maybeSingle();
  if (!source) throw new Error("Wikipedia data_source row missing");

  const symbols = Object.keys(WIKIPEDIA_TITLES);
  const { data: assets } = await supabaseAdmin
    .from("assets").select("id, symbol").in("symbol", symbols);
  const idBySym = new Map<string, string>();
  for (const a of assets ?? []) idBySym.set(a.symbol as string, a.id as string);

  const { data: run } = await supabaseAdmin
    .from("ingestion_runs").insert({
      source_id: source.id, data_category: "alt_data",
      status: "running", details: { provider: "wikipedia_pv", symbols: symbols.length },
    }).select("id").single();
  const runId = run!.id as string;

  const results: AssetIngestResult[] = [];
  let totalRows = 0;

  for (const symbol of symbols) {
    const subjectId = idBySym.get(symbol);
    if (!subjectId) {
      results.push({ symbol, status: "skipped", rowsInserted: 0, error: "asset not in universe" });
      continue;
    }
    const article = WIKIPEDIA_TITLES[symbol];
    try {
      const rows = await fetchPageviews(article, 90);
      if (rows.length < 10) {
        results.push({ symbol, status: "skipped", rowsInserted: 0, error: `only ${rows.length} datapoints` });
        continue;
      }
      // Persist daily raw pageviews (upsert)
      const dailyPayload = rows.map((r) => ({
        signal_code: "WIKI_PV_DAILY",
        subject_type: "asset" as const,
        subject_id: subjectId,
        ts: new Date(`${r.date}T00:00:00Z`).toISOString(),
        value: r.views,
        meta: { article, symbol } as unknown as import("@/integrations/supabase/types").Json,
        source_id: source.id,
      }));
      const { error: eDaily } = await supabaseAdmin
        .from("alt_data_signals").upsert(dailyPayload, { onConflict: "signal_code,subject_type,subject_id,ts" });
      if (eDaily) throw new Error(eDaily.message);

      // Anomaly: today's views vs trailing 60 days
      const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
      const latest = sorted[sorted.length - 1];
      const baseline = sorted.slice(-61, -1).map((r) => r.views);
      const { z, mean, sd } = zScore(latest.views, baseline);
      const spikePct = mean > 0 ? ((latest.views - mean) / mean) * 100 : 0;

      const attentionRow = {
        signal_code: "WIKI_ATTENTION",
        subject_type: "asset" as const,
        subject_id: subjectId,
        ts: new Date(`${latest.date}T00:00:00Z`).toISOString(),
        value: Number(z.toFixed(3)),
        meta: {
          article, symbol, latestViews: latest.views, baselineMean: Math.round(mean),
          baselineSd: Math.round(sd), spikePct: Number(spikePct.toFixed(1)),
          version: WIKIPEDIA_ATTENTION_VERSION,
        } as unknown as import("@/integrations/supabase/types").Json,
        source_id: source.id,
      };
      const { error: eAtt } = await supabaseAdmin
        .from("alt_data_signals").upsert([attentionRow], { onConflict: "signal_code,subject_type,subject_id,ts" });
      if (eAtt) throw new Error(eAtt.message);

      results.push({ symbol, status: "success", rowsInserted: dailyPayload.length + 1, zScore: z });
      totalRows += dailyPayload.length + 1;
    } catch (e) {
      results.push({ symbol, status: "failed", rowsInserted: 0, error: (e as Error).message });
    }
  }

  const totals = {
    success: results.filter((r) => r.status === "success").length,
    failed: results.filter((r) => r.status === "failed").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    rows: totalRows,
  };

  await supabaseAdmin.from("ingestion_runs").update({
    status: totals.failed === 0 ? "success" : totals.success > 0 ? "partial" : "failed",
    finished_at: new Date().toISOString(),
    rows_ingested: totalRows,
    error: totals.failed > 0 ? `${totals.failed}/${symbols.length} assets failed` : null,
  }).eq("id", runId);

  return { ranAt: new Date().toISOString(), provider: "wikipedia_pv", version: WIKIPEDIA_ATTENTION_VERSION, results, totals };
}