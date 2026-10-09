/**
 * Durable, server-only research snapshot cache for expensive read-only scans.
 * Source dates and scoring remain unchanged. Freshness is explicitly bounded.
 * The table is RLS protected and accessible only to Supabase service_role.
 */
interface SnapshotShape {
  modelVersion: string;
  asOf: string;
  candidates: unknown[];
}

const TABLE = "research_workspace_snapshots";

export async function readPersistedResearchWorkspace<T extends SnapshotShape>(
  key: string,
  modelVersion: string,
  maxAgeMs: number,
): Promise<T | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // New additive staging table is not yet in the generated Database type.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const { data, error } = await db.from(TABLE)
      .select("model_version,computed_at,workspace")
      .eq("cache_key", key)
      .maybeSingle();
    if (error || !data || data.model_version !== modelVersion) return null;
    const updated = Date.parse(String(data.computed_at));
    if (!Number.isFinite(updated) || Date.now() - updated > maxAgeMs || updated > Date.now() + 60_000) {
      return null;
    }
    const result: unknown = data.workspace;
    if (!result || typeof result !== "object") return null;
    const record = result as Partial<SnapshotShape>;
    if (record.modelVersion !== modelVersion || typeof record.asOf !== "string" || !Array.isArray(record.candidates)) {
      return null;
    }
    return result as T;
  } catch {
    return null;
  }
}

export async function persistResearchWorkspace<T extends SnapshotShape>(
  key: string,
  workspace: T,
): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const { error } = await db.from(TABLE).upsert({
      cache_key: key,
      model_version: workspace.modelVersion,
      data_asof: workspace.asOf,
      computed_at: new Date().toISOString(),
      workspace,
    }, { onConflict: "cache_key" });
    if (error) {
      console.warn("[research-snapshot] persistence unavailable:", error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[research-snapshot] persistence unavailable:", error instanceof Error ? error.message : String(error));
    return false;
  }
}
