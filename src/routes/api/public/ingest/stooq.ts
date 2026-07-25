import { createFileRoute } from "@tanstack/react-router";

/**
 * Equity ingestion endpoint. Kept under the historical `/ingest/stooq` path so
 * the existing pg_cron schedule keeps firing. It can refresh the tracked US
 * universe, ingest one ticker, or process a rotating database-backed batch.
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
          return Response.json(
            await runEquityIngestBatch({
              limit: integerParam(url, "limit"),
              offset: integerParam(url, "offset"),
            }),
          );
        } catch (e) {
          return new Response(`Ingestion error: ${(e as Error).message}`, { status: 500 });
        }
      },
    },
  },
});

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
