import { createFileRoute } from "@tanstack/react-router";

const MINIMUM_MANAGED_EQUITIES = 400;

/**
 * Equity ingestion endpoint. Kept under the historical `/ingest/stooq` path so
 * the existing pg_cron schedule keeps firing. It can refresh the tracked US
 * universe, ingest one ticker, or process a rotating database-backed batch.
 *
 * A normal scheduled batch also performs a best-effort universe bootstrap when
 * fewer than 400 active equities are present. Failure to reach FMP must not stop
 * the existing price universe from continuing to refresh.
 */
export const Route = createFileRoute("/api/public/ingest/stooq")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const anon = process.env.SUPABASE_PUBLISHABLE_KEY;
        const apikey = request.headers.get("apikey");
        if (!anon || apikey !== anon) return new Response("Unauthorized", { status: 401 });

        const url = new URL(request.url);
        const ticker = url.searchParams.get("ticker");
        const syncUniverse = url.searchParams.get("syncUniverse") === "1";

        try {
          if (syncUniverse) {
            const { syncUsEquityUniverse } = await import(
              "@/lib/ingestion/equities/universe.server"
            );
            return Response.json(
              await syncUsEquityUniverse({
                limit: integerParam(url, "limit"),
                minMarketCap: numberParam(url, "minMarketCap"),
                minPrice: numberParam(url, "minPrice"),
                minVolume: numberParam(url, "minVolume"),
                exchanges: url.searchParams
                  .get("exchanges")
                  ?.split(",")
                  .map((value) => value.trim())
                  .filter(Boolean),
              }),
            );
          }

          const { runEquityIngest, runEquityIngestBatch } = await import(
            "@/lib/ingestion/equities/ingest.server"
          );
          if (ticker) return Response.json(await runEquityIngest(ticker.toUpperCase()));

          const universeBootstrap = await ensureManagedUniverse();
          const batch = await runEquityIngestBatch({
            limit: integerParam(url, "limit"),
            offset: integerParam(url, "offset"),
          });
          return Response.json({ ...batch, universeBootstrap });
        } catch (e) {
          return new Response(`Ingestion error: ${(e as Error).message}`, { status: 500 });
        }
      },
    },
  },
});

async function ensureManagedUniverse(): Promise<
  | { status: "not_needed"; activeEquities: number }
  | { status: "success"; activeEquitiesBefore: number; upserted: number; deactivated: number }
  | { status: "failed"; activeEquities: number; error: string }
> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count, error } = await supabaseAdmin
    .from("assets")
    .select("id", { count: "exact", head: true })
    .eq("active", true)
    .eq("asset_class", "equity");
  if (error) throw error;

  const activeEquities = count ?? 0;
  if (activeEquities >= MINIMUM_MANAGED_EQUITIES) {
    return { status: "not_needed", activeEquities };
  }

  try {
    const { syncUsEquityUniverse } = await import("@/lib/ingestion/equities/universe.server");
    const result = await syncUsEquityUniverse();
    return {
      status: "success",
      activeEquitiesBefore: activeEquities,
      upserted: result.upserted,
      deactivated: result.deactivated,
    };
  } catch (error) {
    return {
      status: "failed",
      activeEquities,
      error: (error as Error).message,
    };
  }
}

function numberParam(url: URL, key: string): number | undefined {
  const raw = url.searchParams.get(key);
  if (raw === null || raw.trim() === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function integerParam(url: URL, key: string): number | undefined {
  const value = numberParam(url, key);
  return value === undefined ? undefined : Math.floor(value);
}
