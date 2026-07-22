import { createServerFn } from "@tanstack/react-start";

export interface SourceRow {
  id: string;
  name: string;
  tier: string;
  providerCode: string | null;
  active: boolean;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  rowsIngested24h: number;
}

export interface RunRow {
  id: string;
  sourceName: string | null;
  status: string;
  category: string;
  startedAt: string;
  finishedAt: string | null;
  rowsIngested: number | null;
  error: string | null;
}

export interface VerifyRunRow {
  id: string;
  checkId: string;
  panelId: string;
  verifier: string;
  status: string;
  detail: string | null;
  runnerKey: string | null;
  calcVersion: string | null;
  trigger: string | null;
  confidence: number | null;
  startedAt: string;
  durationMs: number | null;
}

export const getDataHealthOverview = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [{ data: sources }, { data: runs }, { data: vruns }] = await Promise.all([
    supabaseAdmin.from("data_sources").select("id, name, tier, provider_code, active").order("name"),
    supabaseAdmin.from("ingestion_runs")
      .select("id, source_id, status, data_category, started_at, finished_at, rows_ingested, error")
      .order("started_at", { ascending: false })
      .limit(20),
    supabaseAdmin.from("verify_runs")
      .select("id, check_id, panel_id, verifier, status, detail, runner_key, calc_version, trigger_source, confidence, started_at, duration_ms")
      .order("started_at", { ascending: false })
      .limit(25),
  ]);

  const sourceMap = new Map((sources ?? []).map((s) => [s.id as string, s]));

  const dayAgo = Date.now() - 24 * 3600_000;
  const rowsBySource = new Map<string, { last: RunRow; rows24h: number }>();
  (runs ?? []).forEach((r) => {
    const sid = r.source_id as string;
    const rec = rowsBySource.get(sid);
    const isLast = !rec;
    const inWindow = new Date(r.started_at as string).getTime() >= dayAgo;
    const nextRows = (rec?.rows24h ?? 0) + (inWindow ? (r.rows_ingested ?? 0) : 0);
    rowsBySource.set(sid, {
      last: rec?.last ?? {
        id: r.id as string,
        sourceName: sourceMap.get(sid)?.name ?? null,
        status: r.status as string,
        category: r.data_category as string,
        startedAt: r.started_at as string,
        finishedAt: (r.finished_at as string | null) ?? null,
        rowsIngested: (r.rows_ingested as number | null) ?? null,
        error: (r.error as string | null) ?? null,
      },
      rows24h: nextRows,
    });
    void isLast;
  });

  const sourceRows: SourceRow[] = (sources ?? []).map((s) => {
    const rec = rowsBySource.get(s.id as string);
    return {
      id: s.id as string,
      name: s.name as string,
      tier: s.tier as string,
      providerCode: (s.provider_code as string | null) ?? null,
      active: Boolean(s.active),
      lastRunAt: rec?.last.startedAt ?? null,
      lastRunStatus: rec?.last.status ?? null,
      rowsIngested24h: rec?.rows24h ?? 0,
    };
  });

  const recentRuns: RunRow[] = (runs ?? []).map((r) => ({
    id: r.id as string,
    sourceName: sourceMap.get(r.source_id as string)?.name ?? null,
    status: r.status as string,
    category: r.data_category as string,
    startedAt: r.started_at as string,
    finishedAt: (r.finished_at as string | null) ?? null,
    rowsIngested: (r.rows_ingested as number | null) ?? null,
    error: (r.error as string | null) ?? null,
  }));

  const verifyRuns: VerifyRunRow[] = (vruns ?? []).map((r) => ({
    id: r.id as string,
    checkId: r.check_id as string,
    panelId: r.panel_id as string,
    verifier: r.verifier as string,
    status: r.status as string,
    detail: (r.detail as string | null) ?? null,
    runnerKey: (r.runner_key as string | null) ?? null,
    calcVersion: (r.calc_version as string | null) ?? null,
    trigger: (r.trigger_source as string | null) ?? null,
    confidence: (r.confidence as number | null) ?? null,
    startedAt: r.started_at as string,
    durationMs: (r.duration_ms as number | null) ?? null,
  }));

  return { sources: sourceRows, recentRuns, verifyRuns };
});

export const getPhase45Health = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: region } = await supabaseAdmin.from("regions").select("id").eq("code", "US").maybeSingle();
  if (!region) return { engines: [], model: null, warnings: ["US region is not configured."] };
  const { data: registry } = await supabaseAdmin.from("indicator_registry")
    .select("id,engine,concept_code,series_code_native,frequency,min_history")
    .eq("region_id", region.id).in("engine", ["labour", "market"]).eq("is_active", true).order("engine").order("concept_code");
  const indicators = await Promise.all((registry ?? []).map(async (indicator) => {
    const [{ count }, { data: latest }] = await Promise.all([
      supabaseAdmin.from("raw_observations").select("id", { count: "exact", head: true }).eq("indicator_id", indicator.id),
      supabaseAdmin.from("raw_observations").select("observation_date").eq("indicator_id", indicator.id).order("observation_date", { ascending: false }).limit(1),
    ]);
    return { engine: indicator.engine as string, concept: indicator.concept_code as string, series: indicator.series_code_native as string, frequency: indicator.frequency as string, observations: count ?? 0, minHistory: (indicator.min_history as number | null) ?? null, latest: (latest?.[0]?.observation_date as string | null) ?? null };
  }));
  const engines = ["labour", "market"].map((engine) => {
    const rows = indicators.filter((indicator) => indicator.engine === engine);
    return { engine, registered: rows.length, withData: rows.filter((row) => row.observations > 0).length, eligible: rows.filter((row) => row.minHistory === null || row.observations >= row.minHistory).length, indicators: rows };
  });
  const { data: modelRuns } = await supabaseAdmin.from("model_runs").select("status,started_at,finished_at,output_summary,error,model_version")
    .eq("model_key", "market_regime.us.pipeline").order("started_at", { ascending: false }).limit(1);
  const model = modelRuns?.[0] ?? null;
  const warnings: string[] = [];
  for (const engine of engines) {
    if (engine.withData < engine.registered) warnings.push(`${engine.engine}: ${engine.registered - engine.withData} active indicators have no observations.`);
  }
  if (!model) warnings.push("Phase 5 PCA/HMM shadow pipeline has not run yet.");
  return { engines, model, warnings };
});

export const triggerVerifierRun = createServerFn({ method: "POST" })
  .inputValidator((input: { panelId?: string } | undefined) => input ?? {})
  .handler(async ({ data }) => {
    const { runVerificationForPanel, runAllVerifications } = await import("@/lib/verify/executor.server");
    const results = data.panelId
      ? await runVerificationForPanel(data.panelId, "manual")
      : await runAllVerifications("manual");
    return { ok: true, count: results.length };
  });
