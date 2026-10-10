import { createFileRoute } from "@tanstack/react-router";
import { summarizeFundamentalsBatch } from "@/lib/ingestion/fundamentals/batch-health";

const DEFAULT_BATCH_SIZE = 25;
const MAX_BATCH_SIZE = 100;

/**
 * Fundamentals ingestion — pulls FMP TTM key-metrics + ratios + profile for a
 * rotating slice of the active equity universe and writes canonical metrics to
 * data_points. A bounded batch prevents the daily FMP allowance from repeatedly
 * being consumed by the same early-alphabet companies after the universe grows.
 */
export const Route = createFileRoute("/api/public/ingest/fundamentals")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const anon = process.env.SUPABASE_PUBLISHABLE_KEY;
        const apikey = request.headers.get("apikey");
        if (!anon || apikey !== anon) return new Response("Unauthorized", { status: 401 });

        const url = new URL(request.url);
        const ticker = url.searchParams.get("ticker");
        const { runFundamentalsIngest, runAllFundamentalsIngest } = await import(
          "@/lib/ingestion/fundamentals/ingest.server"
        );

        try {
          if (ticker) {
            const result = await runFundamentalsIngest(ticker.toUpperCase());
            const health = summarizeFundamentalsBatch([result]);
            return Response.json({ ...result, outcome: health.outcome }, { status: health.httpStatus });
          }

          const batch = await selectFundamentalBatch({
            limit: integerParam(url, "limit"),
            offset: integerParam(url, "offset"),
          });
          const results = await runAllFundamentalsIngest({ assetIds: batch.assetIds });
          const health = summarizeFundamentalsBatch(results);

          // Zero observations or an FMP entitlement block must never trigger
          // an expensive universe-wide score refresh.
          let scoreRefresh: Awaited<ReturnType<
            typeof import("@/lib/scoring/run.server")["runFundamentalScoresForAllAssets"]
          >> | null = null;
          if (health.rowsInserted > 0) {
            const { runFundamentalScoresForAllAssets } = await import("@/lib/scoring/run.server");
            scoreRefresh = await runFundamentalScoresForAllAssets();
          }

          return Response.json({
            outcome: health.outcome,
            ingestionHealth: health,
            results,
            count: results.length,
            totalActiveEquities: batch.totalActiveEquities,
            offset: batch.offset,
            requested: batch.requested,
            processed: batch.assetIds.length,
            nextOffset: batch.nextOffset,
            completeUniversePass: batch.assetIds.length >= batch.totalActiveEquities,
            scoreRefresh,
          }, { status: health.httpStatus });
        } catch (e) {
          return new Response(`Ingestion error: ${(e as Error).message}`, { status: 500 });
        }
      },
    },
  },
});

async function selectFundamentalBatch(options: {
  limit?: number;
  offset?: number;
}): Promise<{
  assetIds: string[];
  totalActiveEquities: number;
  offset: number;
  requested: number;
  nextOffset: number;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const requested = clampInteger(options.limit ?? DEFAULT_BATCH_SIZE, 1, MAX_BATCH_SIZE);
  const { count, error: countError } = await supabaseAdmin
    .from("assets")
    .select("id", { count: "exact", head: true })
    .eq("active", true)
    .eq("asset_class", "equity");
  if (countError) throw countError;

  const totalActiveEquities = count ?? 0;
  if (totalActiveEquities === 0) {
    return { assetIds: [], totalActiveEquities: 0, offset: 0, requested, nextOffset: 0 };
  }

  const offset = normalizeOffset(
    options.offset ?? rotatingOffset(totalActiveEquities, requested),
    totalActiveEquities,
  );
  const end = Math.min(totalActiveEquities - 1, offset + requested - 1);
  const { data, error } = await supabaseAdmin
    .from("assets")
    .select("id,symbol,exchange")
    .eq("active", true)
    .eq("asset_class", "equity")
    .order("symbol", { ascending: true })
    .order("exchange", { ascending: true })
    .range(offset, end);
  if (error) throw error;

  const assetIds = (data ?? []).map((asset) => String(asset.id));
  return {
    assetIds,
    totalActiveEquities,
    offset,
    requested,
    nextOffset: assetIds.length === 0 ? offset : (offset + assetIds.length) % totalActiveEquities,
  };
}

function rotatingOffset(total: number, batchSize: number): number {
  const batches = Math.max(1, Math.ceil(total / batchSize));
  const utcDay = Math.floor(Date.now() / 86_400_000);
  return (utcDay % batches) * batchSize;
}

function normalizeOffset(value: number, total: number): number {
  if (total <= 0) return 0;
  const integer = Math.floor(Number.isFinite(value) ? value : 0);
  return ((integer % total) + total) % total;
}

function integerParam(url: URL, key: string): number | undefined {
  const raw = url.searchParams.get(key);
  if (raw === null || raw.trim() === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.floor(value) : undefined;
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  const integer = Math.floor(Number.isFinite(value) ? value : minimum);
  return Math.max(minimum, Math.min(maximum, integer));
}
