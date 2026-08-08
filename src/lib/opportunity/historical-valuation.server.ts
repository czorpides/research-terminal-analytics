import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { HistoricalValuationPoint } from "./advanced-valuation";

export interface HistoricalValuationLoadResult {
  byAsset: Map<string, HistoricalValuationPoint[]>;
  warnings: string[];
}

interface HistoricalValuationRow {
  asset_id: string;
  period_end: string;
  price_date: string | null;
  market_cap: number | null;
  ev_ebitda: number | null;
  fcf_yield: number | null;
  ev_revenue: number | null;
  ptbv: number | null;
}

/**
 * Read observed annual self-valuation through the database-side lateral price
 * join. Failure is deliberately non-fatal so a migration rollout cannot take
 * the existing Radar offline; the advanced valuation gate simply reports the
 * historical lens as missing until the RPC is available.
 */
export async function loadHistoricalValuationHistory(
  assetIds: string[],
  maxPeriods = 10,
): Promise<HistoricalValuationLoadResult> {
  const byAsset = new Map<string, HistoricalValuationPoint[]>();
  const warnings: string[] = [];
  if (!assetIds.length) return { byAsset, warnings };

  const batches = chunk(assetIds, 60);
  for (let start = 0; start < batches.length; start += 8) {
    const wave = batches.slice(start, start + 8);
    const results = await Promise.all(
      wave.map(async (batch) => {
        // RPC is introduced by the same PR and therefore may briefly be absent
        // during a rolling deploy. Keep the current Radar available in that case.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = supabaseAdmin as any;
        return db.rpc("get_opportunity_historical_valuation", {
          p_asset_ids: batch,
          p_max_periods: Math.max(1, Math.min(10, Math.trunc(maxPeriods))),
        });
      }),
    );

    for (const result of results) {
      if (result.error) {
        warnings.push(`Historical self-valuation unavailable: ${result.error.message ?? String(result.error)}`);
        continue;
      }
      for (const row of (result.data ?? []) as HistoricalValuationRow[]) {
        const point: HistoricalValuationPoint = {
          assetId: String(row.asset_id),
          periodEnd: String(row.period_end),
          priceDate: row.price_date ? String(row.price_date) : null,
          marketCap: finite(row.market_cap),
          evEbitda: finite(row.ev_ebitda),
          fcfYield: finite(row.fcf_yield),
          evRevenue: finite(row.ev_revenue),
          ptbv: finite(row.ptbv),
        };
        byAsset.set(point.assetId, [...(byAsset.get(point.assetId) ?? []), point]);
      }
    }
  }

  for (const [assetId, rows] of byAsset) {
    byAsset.set(
      assetId,
      rows.sort((left, right) => right.periodEnd.localeCompare(left.periodEnd)).slice(0, maxPeriods),
    );
  }

  return { byAsset, warnings: unique(warnings).slice(0, 10) };
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function chunk<T>(values: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size));
  }
  return output;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
