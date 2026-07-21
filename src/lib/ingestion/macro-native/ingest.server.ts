/**
 * Native macro ingest runner. Mirrors the FRED runner shape (dedupe on
 * indicator + metric_code + as_of, write ingestion_runs rows) but sources
 * data from ECB SDW, ONS, BoE IADB, or HMRC depending on `provider`.
 */
import { computeConfidence } from "@/lib/reliability/confidence";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { NATIVE_SERIES, type NativeSeriesSpec } from "./registry";
import { fetchEcbSeries } from "./ecb.server";
import { fetchOnsSeries } from "./ons.server";
import { fetchBoeSeries } from "./boe.server";
import { fetchHmrcSeries } from "./hmrc.server";
import type { NativeObs } from "./types";

export interface NativeIngestResult {
  status: "success" | "failed";
  provider: string;
  seriesCode: string;
  rowsInserted: number;
  runId: string;
  error?: string;
}

const PROVIDER_TO_SOURCE: Record<NativeSeriesSpec["provider"], string> = {
  ecb: "ecb_sdw", ons: "ons", boe: "boe", hmrc: "hmrc",
};

async function fetchForSpec(spec: NativeSeriesSpec, startDate?: string): Promise<NativeObs[]> {
  switch (spec.provider) {
    case "ecb":  return fetchEcbSeries(spec.seriesCode, { startPeriod: startDate });
    case "ons":  return fetchOnsSeries(spec.seriesCode);
    case "boe":  return fetchBoeSeries(spec.seriesCode, { startDate });
    case "hmrc": return fetchHmrcSeries(spec.seriesCode);
  }
}

export async function runNativeIngest(seriesCode: string): Promise<NativeIngestResult> {
  const spec = NATIVE_SERIES.find((s) => s.seriesCode === seriesCode);
  if (!spec) throw new Error(`Unknown native series: ${seriesCode}`);

  const { data: source } = await supabaseAdmin
    .from("data_sources").select("id").eq("provider_code", PROVIDER_TO_SOURCE[spec.provider]).maybeSingle();
  if (!source) throw new Error(`data_sources row missing for ${spec.provider}`);

  const { data: indicator } = await supabaseAdmin
    .from("economic_indicators").select("id").eq("code", spec.indicatorCode).maybeSingle();
  if (!indicator) throw new Error(`indicator ${spec.indicatorCode} missing`);

  const { data: run } = await supabaseAdmin
    .from("ingestion_runs")
    .insert({ source_id: source.id, data_category: "macro_release", status: "running", details: { seriesCode, provider: spec.provider } })
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
      : yearsAgo(spec.cadence === "daily" ? 3 : 8);

    const observations = await fetchForSpec(spec, startDate);
    const fresh = observations.filter((o) => o.date >= startDate);
    if (fresh.length === 0) {
      await supabaseAdmin.from("ingestion_runs").update({
        status: "success", finished_at: new Date().toISOString(), rows_ingested: 0,
      }).eq("id", runId);
      return { status: "success", provider: spec.provider, seriesCode, rowsInserted: 0, runId };
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
        raw: { provider: spec.provider, date: o.date, value: o.value } as Record<string, unknown>,
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

    await supabaseAdmin.from("ingestion_runs").update({
      status: "success", finished_at: new Date().toISOString(), rows_ingested: inserted,
    }).eq("id", runId);

    return { status: "success", provider: spec.provider, seriesCode, rowsInserted: inserted, runId };
  } catch (e) {
    await supabaseAdmin.from("ingestion_runs").update({
      status: "failed", finished_at: new Date().toISOString(), error: (e as Error).message,
    }).eq("id", runId);
    return { status: "failed", provider: spec.provider, seriesCode, rowsInserted: 0, runId, error: (e as Error).message };
  }
}

export async function runAllNativeIngest(providerFilter?: NativeSeriesSpec["provider"]): Promise<NativeIngestResult[]> {
  const results: NativeIngestResult[] = [];
  const specs = providerFilter ? NATIVE_SERIES.filter((s) => s.provider === providerFilter) : NATIVE_SERIES;
  for (const s of specs) {
    try { results.push(await runNativeIngest(s.seriesCode)); }
    catch (e) { results.push({ status: "failed", provider: s.provider, seriesCode: s.seriesCode, rowsInserted: 0, runId: "", error: (e as Error).message }); }
  }
  return results;
}

function yearsAgo(n: number): string {
  return new Date(Date.now() - 365 * n * 86400_000).toISOString().slice(0, 10);
}