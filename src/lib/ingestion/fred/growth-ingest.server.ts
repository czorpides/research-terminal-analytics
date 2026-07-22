/**
 * US Growth Engine — vintage-preserving FRED ingest.
 *
 * Writes into `raw_observations` keyed by (indicator_id, observation_date,
 * vintage_id). Prior releases are NEVER overwritten: a new vintage row is
 * added only when
 *   (a) no row exists for this observation_date, or
 *   (b) the latest stored value differs from FRED's current value (revision).
 *
 * Every ingest run also records:
 *   - release_date  (from FRED realtime_start when different from obs date)
 *   - retrieved_at  (retrieval timestamp)
 *   - unit / frequency / seasonal-adjustment from the registry
 *   - source name  (FRED)
 *
 * Called from POST /api/public/ingest/us-growth-fred.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchSeriesObservations } from "./client.server";

const US_GROWTH_CONCEPTS = new Set([
  "industrial_production",
  "retail_sales",
  "housing_starts",
  "initial_jobless_claims",
  "nonfarm_payrolls",
]);

export interface GrowthIngestResult {
  concept_code: string;
  series_code: string;
  status: "success" | "insufficient" | "failed" | "skipped";
  observations_fetched: number;
  new_observations: number;
  new_revisions: number;
  latest_observation_date: string | null;
  latest_value: number | null;
  error?: string;
}

export async function runUsGrowthFredIngest(opts: { yearsBack?: number } = {}): Promise<GrowthIngestResult[]> {
  const yearsBack = opts.yearsBack ?? 30;

  const { data: region } = await supabaseAdmin
    .from("regions").select("id").eq("code", "US").maybeSingle();
  if (!region) throw new Error("US region missing");

  const { data: source } = await supabaseAdmin
    .from("data_sources").select("id, name").eq("provider_code", "fred").maybeSingle();
  if (!source) throw new Error("FRED data source missing");

  const { data: indicators, error } = await supabaseAdmin
    .from("indicator_registry")
    .select("id, concept_code, series_code_native, unit, frequency, seasonal_adj")
    .eq("region_id", region.id).eq("engine", "growth").eq("is_active", true);
  if (error) throw error;

  const relevant = (indicators ?? []).filter((i) => US_GROWTH_CONCEPTS.has(i.concept_code as string));
  const startDate = new Date(Date.now() - yearsBack * 365 * 86_400_000).toISOString().slice(0, 10);

  const results: GrowthIngestResult[] = [];
  for (const ind of relevant) {
    results.push(await ingestOne(ind as {
      id: string; concept_code: string; series_code_native: string;
      unit: string | null; frequency: string; seasonal_adj: boolean | null;
    }, source.id as string, startDate));
  }
  return results;
}

async function ingestOne(
  ind: { id: string; concept_code: string; series_code_native: string; unit: string | null; frequency: string; seasonal_adj: boolean | null },
  sourceId: string,
  observationStart: string,
): Promise<GrowthIngestResult> {
  const result: GrowthIngestResult = {
    concept_code: ind.concept_code, series_code: ind.series_code_native,
    status: "success", observations_fetched: 0, new_observations: 0, new_revisions: 0,
    latest_observation_date: null, latest_value: null,
  };
  try {
    const observations = await fetchSeriesObservations(ind.series_code_native, { observationStart });
    const fresh = observations.filter((o) => o.value !== null);
    result.observations_fetched = fresh.length;

    if (fresh.length === 0) {
      result.status = "insufficient";
      return result;
    }

    // Load latest stored value per observation_date to detect revisions.
    const { data: prior } = await supabaseAdmin
      .from("raw_observations")
      .select("observation_date, value_raw, retrieved_at")
      .eq("indicator_id", ind.id)
      .order("observation_date", { ascending: false });
    const latestByDate = new Map<string, number | null>();
    for (const p of prior ?? []) {
      const key = (p.observation_date as string).slice(0, 10);
      if (!latestByDate.has(key)) latestByDate.set(key, p.value_raw === null ? null : Number(p.value_raw));
    }

    // Build rows to insert: (new dates) + (dates whose FRED value differs from stored)
    type Row = {
      indicator_id: string;
      observation_date: string;
      release_date: string | null;
      value_raw: number;
      unit_raw: string | null;
      vintage_id: string | null;
      source_payload_ref: string | null;
      meta: Record<string, unknown>;
    };
    const toInsert: Row[] = [];
    let newCount = 0;
    let revCount = 0;
    let vintageId: string | null = null;

    const nowIso = new Date().toISOString();
    // Reuse a single vintage per (indicator, run) so revision rows share it.
    const { data: vintage } = await supabaseAdmin
      .from("data_vintages")
      .insert({
        indicator_id: ind.id,
        release_date: new Date().toISOString().slice(0, 10),
        source_ref: `fred:${ind.series_code_native}`,
        retrieved_at: nowIso,
      })
      .select("id").single();
    vintageId = (vintage?.id as string) ?? null;

    for (const o of fresh) {
      const stored = latestByDate.get(o.date);
      const isNew = stored === undefined;
      const isRevised = !isNew && stored !== null && Math.abs((stored ?? 0) - (o.value as number)) > 1e-9;
      if (!isNew && !isRevised) continue;

      toInsert.push({
        indicator_id: ind.id,
        observation_date: o.date,
        release_date: o.realtime_start && o.realtime_start !== o.date ? o.realtime_start : null,
        value_raw: o.value as number,
        unit_raw: ind.unit,
        vintage_id: vintageId,
        source_payload_ref: `fred:${ind.series_code_native}:${o.date}`,
        meta: {
          source: "FRED",
          series_code: ind.series_code_native,
          frequency: ind.frequency,
          seasonal_adjusted: ind.seasonal_adj ?? null,
          realtime_start: o.realtime_start,
          realtime_end: o.realtime_end,
          previous_value: isRevised ? stored : null,
          revision: isRevised,
        },
      });
      if (isRevised) revCount++;
      else newCount++;
    }

    if (toInsert.length) {
      const BATCH = 500;
      for (let i = 0; i < toInsert.length; i += BATCH) {
        const { error: insErr } = await supabaseAdmin
          .from("raw_observations")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert(toInsert.slice(i, i + BATCH) as any);
        if (insErr) throw insErr;
      }
    }

    const latest = fresh[fresh.length - 1];
    result.latest_observation_date = latest?.date ?? null;
    result.latest_value = (latest?.value as number | null) ?? null;
    result.new_observations = newCount;
    result.new_revisions = revCount;
    return result;
  } catch (e) {
    result.status = "failed";
    result.error = (e as Error).message;
    return result;
  }
}