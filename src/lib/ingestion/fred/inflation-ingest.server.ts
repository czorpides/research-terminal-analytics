/**
 * US Inflation Engine — vintage-preserving FRED ingest.
 * Mirrors growth-ingest.server.ts: writes raw_observations keyed by
 * (indicator_id, observation_date, vintage_id) and only opens a new
 * data_vintages row when a value is genuinely new or revised.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchSeriesObservations } from "./client.server";

const US_INFLATION_CONCEPTS = new Set([
  "cpi_headline","cpi_core","pce_headline","pce_core","ppi_final_demand",
  "wage_ahe","wage_atlanta_tracker","cpi_shelter","import_prices",
  "breakeven_5y5y","breakeven_10y","umich_1y_expectations","freight_truck_tonnage",
]);

export interface InflationIngestResult {
  concept_code: string; series_code: string;
  status: "success" | "insufficient" | "failed" | "skipped";
  observations_fetched: number; new_observations: number; new_revisions: number;
  latest_observation_date: string | null; latest_value: number | null;
  vintage_id: string | null; error?: string;
}

export interface InflationIngestRunSummary {
  runId: string | null; results: InflationIngestResult[];
  totalNewObservations: number; totalRevisions: number; failed: number;
}

export async function runUsInflationFredIngest(
  opts: { yearsBack?: number; conceptCodes?: string[] } = {},
): Promise<InflationIngestRunSummary> {
  const yearsBack = opts.yearsBack ?? 30;
  const scopeFilter = opts.conceptCodes && opts.conceptCodes.length
    ? new Set(opts.conceptCodes) : null;

  const { data: region } = await supabaseAdmin.from("regions").select("id").eq("code", "US").maybeSingle();
  if (!region) throw new Error("US region missing");
  const { data: source } = await supabaseAdmin.from("data_sources").select("id, name").eq("provider_code", "fred").maybeSingle();
  if (!source) throw new Error("FRED data source missing");

  const { data: run } = await supabaseAdmin.from("ingestion_runs").insert({
    source_id: source.id, data_category: "macro_release", status: "running",
    details: { pipeline: "us_inflation_fred", yearsBack },
  }).select("id").single();
  const runId = (run?.id as string | null) ?? null;

  const { data: indicators, error } = await supabaseAdmin
    .from("indicator_registry")
    .select("id, concept_code, series_code_native, unit, frequency, seasonal_adj")
    .eq("region_id", region.id).eq("engine", "inflation").eq("is_active", true);
  if (error) throw error;

  const relevant = (indicators ?? [])
    .filter((i) => US_INFLATION_CONCEPTS.has(i.concept_code as string))
    .filter((i) => (scopeFilter ? scopeFilter.has(i.concept_code as string) : true));
  const startDate = new Date(Date.now() - yearsBack * 365 * 86_400_000).toISOString().slice(0, 10);

  const results: InflationIngestResult[] = [];
  for (const ind of relevant) results.push(await ingestOne(ind as any, startDate));

  const totalNewObservations = results.reduce((a, r) => a + r.new_observations, 0);
  const totalRevisions = results.reduce((a, r) => a + r.new_revisions, 0);
  const failed = results.filter((r) => r.status === "failed").length;
  const overall = failed === results.length && results.length > 0 ? "failed" : failed > 0 ? "partial" : "success";

  if (runId) {
    await supabaseAdmin.from("ingestion_runs").update({
      status: overall, finished_at: new Date().toISOString(),
      rows_ingested: totalNewObservations + totalRevisions,
      details: JSON.parse(JSON.stringify({ pipeline: "us_inflation_fred", yearsBack, results, totals: { totalNewObservations, totalRevisions, failed } })),
    }).eq("id", runId);
  }

  return { runId, results, totalNewObservations, totalRevisions, failed };
}

async function ingestOne(
  ind: { id: string; concept_code: string; series_code_native: string; unit: string | null; frequency: string; seasonal_adj: boolean | null },
  observationStart: string,
): Promise<InflationIngestResult> {
  const result: InflationIngestResult = {
    concept_code: ind.concept_code, series_code: ind.series_code_native,
    status: "success", observations_fetched: 0, new_observations: 0, new_revisions: 0,
    latest_observation_date: null, latest_value: null, vintage_id: null,
  };
  try {
    const observations = await fetchSeriesObservations(ind.series_code_native, { observationStart });
    const fresh = observations.filter((o) => o.value !== null);
    result.observations_fetched = fresh.length;
    if (fresh.length === 0) { result.status = "insufficient"; return result; }
    const last = fresh[fresh.length - 1];
    result.latest_observation_date = last.date; result.latest_value = last.value as number;

    const { data: prior } = await supabaseAdmin
      .from("raw_observations")
      .select("observation_date, value_raw, retrieved_at")
      .eq("indicator_id", ind.id)
      .order("observation_date", { ascending: false })
      .order("retrieved_at", { ascending: false });
    const latestByDate = new Map<string, number | null>();
    for (const p of prior ?? []) {
      const key = (p.observation_date as string).slice(0, 10);
      if (!latestByDate.has(key)) latestByDate.set(key, p.value_raw === null ? null : Number(p.value_raw));
    }

    const pending: Array<{ kind: "new" | "revision"; previous: number | null; row: Record<string, unknown> }> = [];
    for (const o of fresh) {
      const stored = latestByDate.get(o.date);
      const isNew = stored === undefined;
      const isRevised = !isNew && stored !== null && Math.abs((stored ?? 0) - (o.value as number)) > 1e-9;
      if (!isNew && !isRevised) continue;
      pending.push({
        kind: isRevised ? "revision" : "new",
        previous: isRevised ? stored ?? null : null,
        row: {
          indicator_id: ind.id, observation_date: o.date,
          release_date: o.realtime_start && o.realtime_start !== o.date ? o.realtime_start : null,
          value_raw: o.value as number, unit_raw: ind.unit,
          source_payload_ref: `fred:${ind.series_code_native}:${o.date}`,
          meta: {
            source: "FRED", series_code: ind.series_code_native, frequency: ind.frequency,
            seasonal_adjusted: ind.seasonal_adj ?? null,
            realtime_start: o.realtime_start, realtime_end: o.realtime_end,
          },
        },
      });
    }
    if (pending.length === 0) return result;

    const nowIso = new Date().toISOString();
    const { data: vintage, error: vErr } = await supabaseAdmin.from("data_vintages").insert({
      indicator_id: ind.id, release_date: new Date().toISOString().slice(0, 10),
      source_ref: `fred:${ind.series_code_native}`, payload_hash: `fred:${ind.series_code_native}:${nowIso}`,
      retrieved_at: nowIso,
    }).select("id").single();
    if (vErr) throw vErr;
    result.vintage_id = (vintage?.id as string) ?? null;

    const toInsert = pending.map((p) => ({
      ...p.row, vintage_id: result.vintage_id,
      meta: { ...(p.row.meta as Record<string, unknown>), previous_value: p.previous, revision: p.kind === "revision" },
    }));
    const BATCH = 500;
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const { error: insErr } = await supabaseAdmin.from("raw_observations").insert(toInsert.slice(i, i + BATCH) as any);
      if (insErr) throw insErr;
    }
    result.new_observations = pending.filter((p) => p.kind === "new").length;
    result.new_revisions = pending.filter((p) => p.kind === "revision").length;
    return result;
  } catch (e) {
    result.status = "failed"; result.error = (e as Error).message; return result;
  }
}