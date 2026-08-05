import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type SwingMonitorSource = "scheduled" | "manual";

export interface SwingMonitorRunUpdate {
  workspaceAsOf?: string | null;
  screened?: number;
  deepScanned?: number;
  surfaced?: number;
  captured?: number;
  evaluated?: number;
  quotesUpdated?: number;
  failures?: Array<{ symbol: string; error: string }>;
  providers?: Record<string, number>;
}

export async function beginSwingMonitorRun(source: SwingMonitorSource): Promise<string | null> {
  try {
    const db = looseDb();
    const { data, error } = await db
      .from("swing_monitor_runs")
      .insert({ source, status: "running", started_at: new Date().toISOString() })
      .select("id")
      .single();
    if (error) return null;
    return data?.id ? String(data.id) : null;
  } catch {
    // Runtime telemetry must never stop the trading engine itself.
    return null;
  }
}

export async function completeSwingMonitorRun(
  id: string | null,
  status: "success" | "failed",
  update: SwingMonitorRunUpdate,
  errorMessage?: string,
): Promise<void> {
  if (!id) return;
  try {
    const db = looseDb();
    await db
      .from("swing_monitor_runs")
      .update({
        status,
        finished_at: new Date().toISOString(),
        workspace_as_of: update.workspaceAsOf?.slice(0, 10) ?? null,
        screened: update.screened ?? 0,
        deep_scanned: update.deepScanned ?? 0,
        surfaced: update.surfaced ?? 0,
        captured: update.captured ?? 0,
        evaluated: update.evaluated ?? 0,
        quotes_updated: update.quotesUpdated ?? 0,
        failures: update.failures ?? [],
        providers: update.providers ?? {},
        error: errorMessage ?? null,
      })
      .eq("id", id);
  } catch {
    // Health logging is best-effort and must not turn a successful monitor into
    // a failed market-data run.
  }
}

// New migration table is intentionally accessed loosely until generated types refresh.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function looseDb(): any {
  return supabaseAdmin as any;
}
