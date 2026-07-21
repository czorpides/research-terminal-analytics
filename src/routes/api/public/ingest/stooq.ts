import { createFileRoute } from "@tanstack/react-router";

/**
 * Equity price ingestion endpoint. Kept under the historical `/ingest/stooq`
 * path so the existing pg_cron schedule keeps firing; the actual work is now
 * done by the multi-provider reliability pool (Tiingo → Twelve Data → FMP →
 * Alpha Vantage) with cross-provider verification of the latest close.
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
        const { runEquityIngest, runAllEquityIngest } = await import("@/lib/ingestion/equities/ingest.server");

        try {
          if (ticker) return Response.json(await runEquityIngest(ticker.toUpperCase()));
          const results = await runAllEquityIngest();
          return Response.json({ results, count: results.length });
        } catch (e) {
          return new Response(`Ingestion error: ${(e as Error).message}`, { status: 500 });
        }
      },
    },
  },
});