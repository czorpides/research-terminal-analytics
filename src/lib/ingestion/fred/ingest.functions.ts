import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { computeConfidence } from "@/lib/reliability/confidence";
import { FRED_SERIES, findSeries } from "./series";

/**
 * Ingest one FRED series: fetch observations, diff against the last stored
 * as_of for this indicator, insert new rows into data_points and
 * economic_releases, and log an ingestion_runs row. Uses supabaseAdmin
 * because data_points is append-only under RLS.
 */
export const ingestFredSeries = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ seriesCode: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data }) => {
    const spec = findSeries(data.seriesCode);
    if (!spec) throw new Error(`Unknown FRED series: ${data.seriesCode}`);
    return runIngest(spec.seriesCode);
  });

export const ingestAllFredSeries = createServerFn({ method: "POST" }).handler(async () => {
  const results: Array<{ seriesCode: string; rows: number; status: string; error?: string }> = [];
  for (const s of FRED_SERIES) {
    try {
      const r = await runIngest(s.seriesCode);
      results.push({ seriesCode: s.seriesCode, rows: r.rowsInserted, status: r.status });
    } catch (e) {
      results.push({ seriesCode: s.seriesCode, rows: 0, status: "failed", error: (e as Error).message });
    }
  }
  return { results };
});

async function runIngest(seriesCode: string): Promise<{ status: "success" | "partial"; rowsInserted: number; runId: string }> {
  const spec = findSeries(seriesCode);
  if (!spec) throw new Error(`Unknown series ${seriesCode}`);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { fetchSeriesObservations } = await import("./client.server");

  // Look up source + indicator ids
  const { data: source } = await supabaseAdmin
    .from("data_sources").select("id, tier").eq("provider_code", "fred").maybeSingle();
  if (!source) throw new Error("FRED source row missing");

  const { data: indicator } = await supabaseAdmin
    .from("economic_indicators").select("id").eq("code", spec.indicatorCode).maybeSingle();
  if (!indicator) throw new Error(`Indicator ${spec.indicatorCode} missing`);

  // Open run
  const { data: run } = await supabaseAdmin
    .from("ingestion_runs")
    .insert({
      source_id: source.id,
      data_category: "macro_release",
      status: "running",
      details: { seriesCode },
    })
    .select("id").single();
  const runId = run!.id as string;

  try {
    // Find last as_of for this indicator
    const { data: last } = await supabaseAdmin
      .from("data_points")
      .select("as_of")
      .eq("subject_type", "indicator")
      .eq("subject_id", indicator.id)
      .eq("metric_code", spec.seriesCode)
      .order("as_of", { ascending: false })
      .limit(1)
      .maybeSingle();

    const startDate = last?.as_of
      ? new Date(new Date(last.as_of as string).getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      : (spec.cadence === "daily" ? twoYearsAgo() : fiveYearsAgo());

    const observations = await fetchSeriesObservations(spec.seriesCode, { observationStart: startDate });
    const fresh = observations.filter((o) => o.value !== null);

    if (fresh.length === 0) {
      await supabaseAdmin.from("ingestion_runs").update({
        status: "success", finished_at: new Date().toISOString(), rows_ingested: 0,
      }).eq("id", runId);
      return { status: "success", rowsInserted: 0, runId };
    }

    const now = Date.now();
    const rows = fresh.map((o) => {
      const asOf = new Date(`${o.date}T00:00:00Z`);
      const ageSeconds = Math.max(0, Math.floor((now - asOf.getTime()) / 1000));
      const c = computeConfidence({ tier: "tier1_official", category: "macro_release", ageSeconds });
      return {
        subject_type: "indicator" as const,
        subject_id: indicator.id,
        metric_code: spec.seriesCode,
        value_num: o.value,
        as_of: asOf.toISOString(),
        source_id: source.id,
        confidence: c.value,
        penalties: c.penalties,
        raw: { date: o.date, value: o.value, realtime_start: o.realtime_start, realtime_end: o.realtime_end },
      };
    });

    // Insert in batches
    const BATCH = 500;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const { error } = await supabaseAdmin.from("data_points").insert(chunk);
      if (error) throw error;
      inserted += chunk.length;
    }

    // Latest observation → economic_releases (upsert-style: just insert if new)
    const latest = fresh[fresh.length - 1];
    if (latest) {
      await supabaseAdmin.from("economic_releases").insert({
        indicator_id: indicator.id,
        release_time: new Date(`${latest.date}T00:00:00Z`).toISOString(),
        period_ref: latest.date,
        actual: latest.value,
        source_id: source.id,
      });
    }

    await supabaseAdmin.from("ingestion_runs").update({
      status: "success", finished_at: new Date().toISOString(), rows_ingested: inserted,
    }).eq("id", runId);

    return { status: "success", rowsInserted: inserted, runId };
  } catch (e) {
    await supabaseAdmin.from("ingestion_runs").update({
      status: "failed", finished_at: new Date().toISOString(), error: (e as Error).message,
    }).eq("id", runId);
    throw e;
  }
}

function twoYearsAgo(): string {
  return new Date(Date.now() - 365 * 2 * 86400_000).toISOString().slice(0, 10);
}
function fiveYearsAgo(): string {
  return new Date(Date.now() - 365 * 5 * 86400_000).toISOString().slice(0, 10);
}