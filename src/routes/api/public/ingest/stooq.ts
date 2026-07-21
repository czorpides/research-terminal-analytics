import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/ingest/stooq")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const anon = process.env.SUPABASE_PUBLISHABLE_KEY;
        const apikey = request.headers.get("apikey");
        if (!anon || apikey !== anon) return new Response("Unauthorized", { status: 401 });

        const url = new URL(request.url);
        const ticker = url.searchParams.get("ticker");
        const { runStooqIngest, runAllStooqIngest } = await import("@/lib/ingestion/stooq/ingest.server");

        try {
          if (ticker) return Response.json(await runStooqIngest(ticker.toUpperCase()));
          const results = await runAllStooqIngest();
          return Response.json({ results, count: results.length });
        } catch (e) {
          return new Response(`Ingestion error: ${(e as Error).message}`, { status: 500 });
        }
      },
    },
  },
});