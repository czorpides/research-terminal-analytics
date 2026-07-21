import { computeConfidence } from "@/lib/reliability/confidence";
import { FRED_SERIES, findSeries } from "./series";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchSeriesObservations } from "./client.server";
import { runVerificationForSeries } from "@/lib/verify/executor.server";

export interface IngestResult {
  status: "success" | "partial" | "failed";
  rowsInserted: number;
  runId: string;
  seriesCode: string;
  error?: string;
}

export async function runFredIngest(seriesCode: string): Promise<IngestResult> {
  const spec = findSeries(seriesCode);
  if (!spec) throw new Error(`Unknown FRED series: ${seriesCode}`);

  const { data: source } = await supabaseAdmin
    .from("data_sources").select("id, tier").eq("provider_code", "fred").maybeSingle();
  if (!source) throw new Error("FRED source row missing");

  const { data: indicator } = await supabaseAdmin
    .from("economic_indicators").select("id").eq("code", spec.indicatorCode).maybeSingle();
  if (!indicator) throw new Error(`Indicator ${spec.indicatorCode} missing`);

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
      : (spec.cadence === "daily" ? yearsAgo(2) : yearsAgo(5));

    const observations = await fetchSeriesObservations(spec.seriesCode, { observationStart: startDate });
    const fresh = observations.filter((o) => o.value !== null);

    if (fresh.length === 0) {
      await supabaseAdmin.from("ingestion_runs").update({
        status: "success", finished_at: new Date().toISOString(), rows_ingested: 0,
      }).eq("id", runId);
      return { status: "success", rowsInserted: 0, runId, seriesCode };
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
        penalties: c.penalties as unknown as Record<string, unknown>[],
        raw: { date: o.date, value: o.value, realtime_start: o.realtime_start, realtime_end: o.realtime_end } as Record<string, unknown>,
      };
    });

    const BATCH = 500;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabaseAdmin.from("data_points").insert(chunk as any);
      if (error) throw error;
      inserted += chunk.length;
    }

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

    // Auto-verify: now that fresh data has landed for this series, walk any
    // check definitions that depend on it (algo → api → ai).
    try { await runVerificationForSeries([spec.seriesCode], "ingest"); } catch { /* non-fatal */ }

    return { status: "success", rowsInserted: inserted, runId, seriesCode };
  } catch (e) {
    await supabaseAdmin.from("ingestion_runs").update({
      status: "failed", finished_at: new Date().toISOString(), error: (e as Error).message,
    }).eq("id", runId);
    return { status: "failed", rowsInserted: 0, runId, seriesCode, error: (e as Error).message };
  }
}

export async function runAllFredIngest(): Promise<IngestResult[]> {
  const results: IngestResult[] = [];
  for (const s of FRED_SERIES) {
    try {
      results.push(await runFredIngest(s.seriesCode));
    } catch (e) {
      results.push({ status: "failed", rowsInserted: 0, runId: "", seriesCode: s.seriesCode, error: (e as Error).message });
    }
  }
  return results;
}

function yearsAgo(n: number): string {
  return new Date(Date.now() - 365 * n * 86400_000).toISOString().slice(0, 10);
}