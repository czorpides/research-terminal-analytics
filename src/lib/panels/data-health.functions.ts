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

export const getDataHealthOverview = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [{ data: sources }, { data: runs }] = await Promise.all([
    supabaseAdmin.from("data_sources").select("id, name, tier, provider_code, active").order("name"),
    supabaseAdmin.from("ingestion_runs")
      .select("id, source_id, status, data_category, started_at, finished_at, rows_ingested, error")
      .order("started_at", { ascending: false })
      .limit(20),
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

  return { sources: sourceRows, recentRuns };
});