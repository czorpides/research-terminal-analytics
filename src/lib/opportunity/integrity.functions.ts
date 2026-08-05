import { createServerFn } from "@tanstack/react-start";

export interface CandidateFreshnessRow {
  assetId: string;
  momentumAt: string | null;
  trendAt: string | null;
  volatilityAt: string | null;
  fundamentalAsOf: string | null;
  fundamentalNewestAsOf: string | null;
  fundamentalMetricCount: number;
}

export interface OpportunityFreshnessPayload {
  asOf: string;
  latestBulkFinishedAt: string | null;
  assets: CandidateFreshnessRow[];
}

export const getOpportunityCandidateFreshness = createServerFn({ method: "GET" }).handler(
  async (): Promise<OpportunityFreshnessPayload> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Migration-backed and fail-soft: publishing application code before the
    // migration must not make the Radar route unavailable.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    try {
      const { data, error } = await db.rpc("get_opportunity_candidate_freshness");
      if (error) throw error;
      const raw = (data ?? {}) as Record<string, unknown>;
      const assets = Array.isArray(raw.assets)
        ? raw.assets.flatMap(parseRow)
        : [];
      return {
        asOf: text(raw.asOf) ?? new Date().toISOString(),
        latestBulkFinishedAt: text(raw.latestBulkFinishedAt),
        assets,
      };
    } catch {
      return {
        asOf: new Date().toISOString(),
        latestBulkFinishedAt: null,
        assets: [],
      };
    }
  },
);

function parseRow(value: unknown): CandidateFreshnessRow[] {
  if (!value || typeof value !== "object") return [];
  const row = value as Record<string, unknown>;
  const assetId = text(row.assetId);
  if (!assetId) return [];
  return [
    {
      assetId,
      momentumAt: text(row.momentumAt),
      trendAt: text(row.trendAt),
      volatilityAt: text(row.volatilityAt),
      fundamentalAsOf: text(row.fundamentalAsOf),
      fundamentalNewestAsOf: text(row.fundamentalNewestAsOf),
      fundamentalMetricCount: integer(row.fundamentalMetricCount),
    },
  ];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function integer(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}
