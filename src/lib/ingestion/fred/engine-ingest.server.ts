/**
 * Shared vintage-preserving FRED ingest for registry-backed macro engines.
 *
 * An immutable vintage is created only when a date is new or its value has
 * changed. The payload hash is deterministic, so retrying the same release
 * cannot manufacture a second vintage.
 */
import { createHash } from "node:crypto";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { fetchSeriesObservations } from "./client.server";

export interface EngineIngestResult {
  conceptCode: string;
  seriesCode: string;
  status: "success" | "insufficient" | "failed";
  observationsFetched: number;
  newObservations: number;
  revisions: number;
  latestDate: string | null;
  latestValue: number | null;
  error?: string;
}

export interface EngineIngestSummary {
  engine: string;
  runId: string | null;
  results: EngineIngestResult[];
  totalNewObservations: number;
  totalRevisions: number;
  failed: number;
}

interface RegistryRow {
  id: string;
  concept_code: string;
  series_code_native: string;
  unit: string | null;
  frequency: string;
  seasonal_adj: boolean | null;
}

export async function runFredEngineIngest(options: {
  engine: "labour" | "market";
  yearsBack?: number;
  conceptCodes?: string[];
}): Promise<EngineIngestSummary> {
  const yearsBack = Math.max(5, Math.min(50, options.yearsBack ?? 30));
  const selected = options.conceptCodes?.length ? new Set(options.conceptCodes) : null;
  const { data: region } = await supabaseAdmin
    .from("regions")
    .select("id")
    .eq("code", "US")
    .maybeSingle();
  const { data: source } = await supabaseAdmin
    .from("data_sources")
    .select("id")
    .eq("provider_code", "fred")
    .maybeSingle();
  if (!region || !source) throw new Error("US region or FRED source missing");

  const { data: run, error: runError } = await supabaseAdmin
    .from("ingestion_runs")
    .insert({
      source_id: source.id,
      data_category: "macro_release",
      status: "running",
      details: { pipeline: `us_${options.engine}_fred`, yearsBack },
    })
    .select("id")
    .single();
  if (runError) throw runError;

  const { data: registry, error: registryError } = await supabaseAdmin
    .from("indicator_registry")
    .select("id,concept_code,series_code_native,unit,frequency,seasonal_adj")
    .eq("region_id", region.id)
    .eq("engine", options.engine)
    .eq("is_active", true)
    .order("concept_code");
  if (registryError) throw registryError;

  const rows = (registry ?? []).filter(
    (row) => !selected || selected.has(row.concept_code as string),
  ) as RegistryRow[];
  const start = new Date(Date.now() - yearsBack * 365.25 * 86_400_000).toISOString().slice(0, 10);
  const results: EngineIngestResult[] = [];
  for (const row of rows) results.push(await ingestOne(row, start));

  const totalNewObservations = results.reduce((sum, result) => sum + result.newObservations, 0);
  const totalRevisions = results.reduce((sum, result) => sum + result.revisions, 0);
  const failed = results.filter((result) => result.status === "failed").length;
  const status =
    failed === results.length && results.length ? "failed" : failed ? "partial" : "success";
  await supabaseAdmin
    .from("ingestion_runs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      rows_ingested: totalNewObservations + totalRevisions,
      details: JSON.parse(
        JSON.stringify({ pipeline: `us_${options.engine}_fred`, yearsBack, results }),
      ),
    })
    .eq("id", run.id);

  return {
    engine: options.engine,
    runId: run.id as string,
    results,
    totalNewObservations,
    totalRevisions,
    failed,
  };
}

async function ingestOne(
  indicator: RegistryRow,
  observationStart: string,
): Promise<EngineIngestResult> {
  const result: EngineIngestResult = {
    conceptCode: indicator.concept_code,
    seriesCode: indicator.series_code_native,
    status: "success",
    observationsFetched: 0,
    newObservations: 0,
    revisions: 0,
    latestDate: null,
    latestValue: null,
  };
  try {
    const observations = (
      await fetchSeriesObservations(indicator.series_code_native, { observationStart })
    ).filter(
      (observation): observation is typeof observation & { value: number } =>
        observation.value !== null,
    );
    result.observationsFetched = observations.length;
    if (!observations.length) return { ...result, status: "insufficient" };
    result.latestDate = observations.at(-1)?.date ?? null;
    result.latestValue = observations.at(-1)?.value ?? null;

    const latestByDate = new Map<string, number>();
    for (let from = 0; ; from += 1_000) {
      const { data, error } = await supabaseAdmin
        .from("raw_observations")
        .select("observation_date,value_raw,retrieved_at")
        .eq("indicator_id", indicator.id)
        .order("observation_date", { ascending: true })
        .order("retrieved_at", { ascending: true })
        .range(from, from + 999);
      if (error) throw error;
      for (const row of data ?? []) {
        if (row.value_raw !== null)
          latestByDate.set((row.observation_date as string).slice(0, 10), Number(row.value_raw));
      }
      if ((data?.length ?? 0) < 1_000) break;
    }

    const changes = observations.filter((observation) => {
      const previous = latestByDate.get(observation.date);
      return previous === undefined || Math.abs(previous - observation.value) > 1e-9;
    });
    if (!changes.length) return result;

    const payloadHash = createHash("sha256")
      .update(JSON.stringify(changes.map(({ date, value }) => [date, value])))
      .digest("hex");
    const now = new Date().toISOString();
    const { data: vintage, error: vintageError } = await supabaseAdmin
      .from("data_vintages")
      .upsert(
        {
          indicator_id: indicator.id,
          release_date: now.slice(0, 10),
          source_ref: `fred:${indicator.series_code_native}`,
          payload_hash: payloadHash,
          retrieved_at: now,
        },
        { onConflict: "indicator_id,release_date,payload_hash" },
      )
      .select("id")
      .single();
    if (vintageError) throw vintageError;

    const insertRows = changes.map((observation) => ({
      indicator_id: indicator.id,
      observation_date: observation.date,
      release_date:
        observation.realtime_start !== observation.date ? observation.realtime_start : null,
      value_raw: observation.value,
      unit_raw: indicator.unit,
      vintage_id: vintage.id,
      source_payload_ref: `fred:${indicator.series_code_native}:${observation.date}`,
      meta: {
        source: "FRED",
        series_code: indicator.series_code_native,
        frequency: indicator.frequency,
        seasonal_adjusted: indicator.seasonal_adj,
        revision: latestByDate.has(observation.date),
        previous_value: latestByDate.get(observation.date) ?? null,
      },
    }));
    for (let from = 0; from < insertRows.length; from += 500) {
      const { error } = await supabaseAdmin
        .from("raw_observations")
        .upsert(insertRows.slice(from, from + 500) as never, {
          onConflict: "indicator_id,observation_date,vintage_id",
          ignoreDuplicates: true,
        });
      if (error) throw error;
    }
    result.newObservations = changes.filter(
      (observation) => !latestByDate.has(observation.date),
    ).length;
    result.revisions = changes.length - result.newObservations;
    return result;
  } catch (error) {
    return { ...result, status: "failed", error: (error as Error).message };
  }
}
