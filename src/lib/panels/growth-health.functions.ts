/**
 * Stage 1 Data & Model Health — US Growth Engine.
 *
 * Everything the Stage 1 acceptance checklist asks the health panel to
 * show: ingestion status, vintage coverage, transformation freshness,
 * Kalman-run outcome, analytics-service reachability, model/data versions
 * and staleness warnings. Every field is derived from the database or from
 * a same-turn probe of the analytics service — no hard-coded values.
 */
import { createServerFn } from "@tanstack/react-start";

const MODEL_KEY = "growth_engine.us.kalman_llt";
const US_GROWTH_CONCEPTS = [
  "industrial_production",
  "retail_sales",
  "housing_starts",
  "initial_jobless_claims",
  "nonfarm_payrolls",
];

export interface GrowthIndicatorHealth {
  concept_code: string;
  series_code: string;
  frequency: string;
  observation_count: number;
  vintage_count: number;
  earliest_observation: string | null;
  latest_observation: string | null;
  latest_vintage_at: string | null;
  min_history: number | null;
  meets_min_history: boolean;
  has_kalman_output: boolean;
  latest_output_ts: string | null;
  staleness_days: number | null;
}

export interface GrowthHealthPayload {
  generatedAt: string;
  analytics: {
    urlConfigured: boolean;
    tokenConfigured: boolean;
    reachable: boolean | null;
    detail: string | null;
    serviceVersion: string | null;
    deployEnv: string | null;
  };
  ingestion: {
    lastRun: {
      id: string;
      startedAt: string;
      finishedAt: string | null;
      status: string;
      rowsIngested: number | null;
      newObservations: number;
      revisions: number;
      failedCount: number;
    } | null;
  };
  model: {
    currentModelVersion: string | null;
    currentInputHash: string | null;
    lastRunHash: string | null;
    dataChangedSinceLastRun: boolean;
    lastRun: {
      id: string;
      status: string;
      startedAt: string;
      finishedAt: string | null;
      modelVersion: string;
      calculationMode: string | null;
      indicatorsProcessed: number | null;
      indicatorsSkipped: number | null;
      outputRows: number | null;
      error: string | null;
    } | null;
    successfulRunCount: number;
  };
  indicators: GrowthIndicatorHealth[];
  counts: {
    eligible: number;
    withOutput: number;
    skipped: number;
    failed: number;
  };
  scheduler: {
    silentCron: boolean;
    failuresLast24h: number;
    staleIndicators: Array<{ concept_code: string; frequency: string; latest_observation_date: string | null }>;
    lastRunStatus: string | null;
    lastRunFinishedAt: string | null;
    lastRunScope: string[] | null;
  } | null;
  warnings: string[];
}

export const getGrowthHealth = createServerFn({ method: "GET" }).handler(async (): Promise<GrowthHealthPayload> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { computeCurrentInputHash } = await import("@/lib/analytics/growth-pipeline.server");

  const analyticsUrl = process.env.ANALYTICS_SERVICE_URL ?? "";
  const analyticsToken = process.env.ANALYTICS_SERVICE_TOKEN ?? "";
  const analytics: GrowthHealthPayload["analytics"] = {
    urlConfigured: Boolean(analyticsUrl),
    tokenConfigured: Boolean(analyticsToken),
    reachable: null, detail: null, serviceVersion: null, deployEnv: null,
  };
  if (analyticsUrl) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${analyticsUrl.replace(/\/+$/, "")}/healthz`, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const j = (await res.json()) as { service_version?: string; deploy_env?: string };
        analytics.reachable = true;
        analytics.serviceVersion = j.service_version ?? null;
        analytics.deployEnv = j.deploy_env ?? null;
      } else {
        analytics.reachable = false;
        analytics.detail = `HTTP ${res.status}`;
      }
    } catch (e) {
      analytics.reachable = false;
      analytics.detail = (e as Error).message.slice(0, 200);
    }
  }

  const { data: region } = await supabaseAdmin.from("regions").select("id").eq("code", "US").maybeSingle();
  const regionId = region?.id as string | undefined;

  const { data: registryRows } = regionId
    ? await supabaseAdmin
        .from("indicator_registry")
        .select("id, concept_code, series_code_native, frequency, min_history")
        .eq("region_id", regionId).eq("engine", "growth").eq("is_active", true)
    : { data: [] as Array<{ id: string; concept_code: string; series_code_native: string; frequency: string; min_history: number | null }> };
  const registry = (registryRows ?? []).filter((r) => US_GROWTH_CONCEPTS.includes(r.concept_code as string));
  const ids = registry.map((r) => r.id as string);

  // Observation + vintage counts + min/max dates per indicator
  const obsAggByIndicator = new Map<string, { count: number; earliest: string | null; latest: string | null; latestVintage: string | null }>();
  if (ids.length) {
    const { data: obs } = await supabaseAdmin
      .from("raw_observations")
      .select("indicator_id, observation_date, retrieved_at")
      .in("indicator_id", ids);
    for (const o of obs ?? []) {
      const key = o.indicator_id as string;
      const cur = obsAggByIndicator.get(key) ?? { count: 0, earliest: null as string | null, latest: null as string | null, latestVintage: null as string | null };
      cur.count += 1;
      const d = (o.observation_date as string).slice(0, 10);
      if (!cur.earliest || d < cur.earliest) cur.earliest = d;
      if (!cur.latest || d > cur.latest) cur.latest = d;
      const rt = o.retrieved_at as string;
      if (!cur.latestVintage || rt > cur.latestVintage) cur.latestVintage = rt;
      obsAggByIndicator.set(key, cur);
    }
  }

  const vintageCounts = new Map<string, number>();
  if (ids.length) {
    const { data: v } = await supabaseAdmin
      .from("data_vintages")
      .select("indicator_id")
      .in("indicator_id", ids);
    for (const row of v ?? []) {
      const k = row.indicator_id as string;
      vintageCounts.set(k, (vintageCounts.get(k) ?? 0) + 1);
    }
  }

  const outputSeen = new Map<string, { hasOutput: boolean; latestTs: string | null }>();
  if (ids.length) {
    const { data: outs } = await supabaseAdmin
      .from("model_outputs")
      .select("indicator_id, ts")
      .eq("model_key", MODEL_KEY)
      .in("indicator_id", ids)
      .order("ts", { ascending: false });
    for (const o of outs ?? []) {
      const k = o.indicator_id as string;
      const cur = outputSeen.get(k);
      if (!cur) outputSeen.set(k, { hasOutput: true, latestTs: (o.ts as string).slice(0, 10) });
    }
  }

  const nowMs = Date.now();
  const indicatorHealths: GrowthIndicatorHealth[] = registry.map((r) => {
    const agg = obsAggByIndicator.get(r.id as string);
    const minHist = (r.min_history as number | null) ?? null;
    const count = agg?.count ?? 0;
    const out = outputSeen.get(r.id as string);
    const latest = agg?.latest ?? null;
    return {
      concept_code: r.concept_code as string,
      series_code: r.series_code_native as string,
      frequency: r.frequency as string,
      observation_count: count,
      vintage_count: vintageCounts.get(r.id as string) ?? 0,
      earliest_observation: agg?.earliest ?? null,
      latest_observation: latest,
      latest_vintage_at: agg?.latestVintage ?? null,
      min_history: minHist,
      meets_min_history: minHist === null ? count > 0 : count >= minHist,
      has_kalman_output: Boolean(out?.hasOutput),
      latest_output_ts: out?.latestTs ?? null,
      staleness_days: latest ? Math.max(0, Math.round((nowMs - new Date(`${latest}T00:00:00Z`).getTime()) / 86_400_000)) : null,
    };
  }).sort((a, b) => US_GROWTH_CONCEPTS.indexOf(a.concept_code) - US_GROWTH_CONCEPTS.indexOf(b.concept_code));

  // Latest ingestion_runs row for the FRED source
  const { data: fredSource } = await supabaseAdmin
    .from("data_sources").select("id").eq("provider_code", "fred").maybeSingle();
  let ingestionLast: GrowthHealthPayload["ingestion"]["lastRun"] = null;
  if (fredSource) {
    const { data: runs } = await supabaseAdmin
      .from("ingestion_runs")
      .select("id, started_at, finished_at, status, rows_ingested, details")
      .eq("source_id", fredSource.id)
      .order("started_at", { ascending: false })
      .limit(20);
    const usGrowth = (runs ?? []).find((r) => {
      const d = r.details as { pipeline?: string } | null;
      return d?.pipeline === "us_growth_fred";
    });
    if (usGrowth) {
      const details = (usGrowth.details as { totals?: { totalNewObservations?: number; totalRevisions?: number; failed?: number } } | null) ?? null;
      ingestionLast = {
        id: usGrowth.id as string,
        startedAt: usGrowth.started_at as string,
        finishedAt: (usGrowth.finished_at as string | null) ?? null,
        status: usGrowth.status as string,
        rowsIngested: (usGrowth.rows_ingested as number | null) ?? null,
        newObservations: details?.totals?.totalNewObservations ?? 0,
        revisions: details?.totals?.totalRevisions ?? 0,
        failedCount: details?.totals?.failed ?? 0,
      };
    }
  }

  // Latest model_runs for the Kalman
  const { data: runs } = await supabaseAdmin
    .from("model_runs")
    .select("id, status, started_at, finished_at, model_version, output_summary, input_hash, error")
    .eq("model_key", MODEL_KEY)
    .order("started_at", { ascending: false })
    .limit(10);
  const latestRun = runs?.[0] ?? null;
  const summary = (latestRun?.output_summary as { indicators_processed?: number; indicators_skipped?: number; output_rows?: number; calculation_mode?: string } | null) ?? null;
  const successful = (runs ?? []).filter((r) => r.status === "success" || r.status === "partial").length;

  const currentInputHash = await computeCurrentInputHash();
  const lastRunHash = (runs ?? []).find((r) => r.status === "success")?.input_hash as string | null | undefined ?? null;

  const withOutput = indicatorHealths.filter((i) => i.has_kalman_output).length;
  const skipped = indicatorHealths.filter((i) => !i.meets_min_history).length;
  const failed = summary?.indicators_skipped && summary.indicators_skipped > skipped ? summary.indicators_skipped - skipped : 0;

  const warnings: string[] = [];
  if (!analytics.urlConfigured || !analytics.tokenConfigured) warnings.push("Analytics service secrets missing (ANALYTICS_SERVICE_URL / ANALYTICS_SERVICE_TOKEN).");
  if (analytics.urlConfigured && analytics.reachable === false) warnings.push(`Analytics service unreachable: ${analytics.detail ?? "unknown"}`);
  if (!ingestionLast) warnings.push("No US Growth ingestion run recorded yet — trigger /api/public/ingest/us-growth-fred.");
  if (ingestionLast && ingestionLast.status !== "success") warnings.push(`Latest ingestion status: ${ingestionLast.status}.`);
  for (const i of indicatorHealths) {
    if (i.observation_count === 0) warnings.push(`${i.concept_code}: no raw_observations rows.`);
    else if (!i.meets_min_history) warnings.push(`${i.concept_code}: below min-history (${i.observation_count}/${i.min_history ?? "?"}).`);
    if (i.staleness_days !== null && i.frequency === "weekly" && i.staleness_days > 14) warnings.push(`${i.concept_code}: latest observation is ${i.staleness_days}d old (weekly series).`);
    if (i.staleness_days !== null && i.frequency === "monthly" && i.staleness_days > 45) warnings.push(`${i.concept_code}: latest observation is ${i.staleness_days}d old (monthly series).`);
  }
  if (currentInputHash && lastRunHash && currentInputHash !== lastRunHash) warnings.push("Input data has changed since the last successful Kalman run — a rerun is due.");
  if (!latestRun) warnings.push("No Kalman run has ever been recorded.");

  // Scheduler/staleness surface from the data_health_alerts view.
  const { data: alertRow } = await supabaseAdmin
    .from("data_health_alerts" as any)
    .select("payload")
    .limit(1);
  const payload = (alertRow?.[0] as any)?.payload ?? null;
  const scheduler: GrowthHealthPayload["scheduler"] = payload
    ? {
        silentCron: Boolean(payload.silent_cron),
        failuresLast24h: Number(payload.failures_last_24h ?? 0),
        staleIndicators: Array.isArray(payload.stale_indicators) ? payload.stale_indicators : [],
        lastRunStatus: payload.last_run?.status ?? null,
        lastRunFinishedAt: payload.last_run?.finished_at ?? null,
        lastRunScope: Array.isArray(payload.last_run?.scope) ? payload.last_run.scope : null,
      }
    : null;
  if (scheduler?.silentCron) warnings.push("No pipeline run in the last 26 hours — the recurring scheduler may have stopped.");
  if (scheduler && scheduler.failuresLast24h > 0) warnings.push(`${scheduler.failuresLast24h} pipeline run(s) failed in the last 24 hours.`);

  return {
    generatedAt: new Date().toISOString(),
    analytics,
    ingestion: { lastRun: ingestionLast },
    model: {
      currentModelVersion: (latestRun?.model_version as string | null) ?? null,
      currentInputHash,
      lastRunHash,
      dataChangedSinceLastRun: Boolean(currentInputHash && lastRunHash && currentInputHash !== lastRunHash),
      lastRun: latestRun
        ? {
            id: latestRun.id as string,
            status: latestRun.status as string,
            startedAt: latestRun.started_at as string,
            finishedAt: (latestRun.finished_at as string | null) ?? null,
            modelVersion: latestRun.model_version as string,
            calculationMode: summary?.calculation_mode ?? null,
            indicatorsProcessed: summary?.indicators_processed ?? null,
            indicatorsSkipped: summary?.indicators_skipped ?? null,
            outputRows: summary?.output_rows ?? null,
            error: (latestRun.error as string | null) ?? null,
          }
        : null,
      successfulRunCount: successful,
    },
    indicators: indicatorHealths,
    counts: {
      eligible: indicatorHealths.filter((i) => i.meets_min_history).length,
      withOutput,
      skipped,
      failed,
    },
    scheduler,
    warnings,
  };
});