import { createFileRoute } from "@tanstack/react-router";

/**
 * Fundamentals ingestion — pulls FMP TTM key-metrics + ratios + profile
 * for the equity universe and writes canonical metric codes to data_points.
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
        const { runFundamentalsIngest, runAllFundamentalsIngest } = await import("@/lib/ingestion/fundamentals/ingest.server");

        try {
          if (ticker) return Response.json(await runFundamentalsIngest(ticker.toUpperCase()));
          const results = await runAllFundamentalsIngest();
          return Response.json({ results, count: results.length });
        } catch (e) {
          return new Response(`Ingestion error: ${(e as Error).message}`, { status: 500 });
        }
      },
    },
  },
});