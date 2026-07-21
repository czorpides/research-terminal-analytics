import { createFileRoute } from "@tanstack/react-router";
import { runAllFredIngest, runFredIngest } from "@/lib/ingestion/fred/ingest.server";

/**
 * Public HTTP endpoint hit by pg_cron (via pg_net). Auth uses the Supabase
 * anon key in the `apikey` header — the canonical /api/public/* pattern.
 *
 * Usage:
 *   POST /api/public/ingest/fred                → ingest all series
 *   POST /api/public/ingest/fred?series=DGS10   → ingest one
 */
export const Route = createFileRoute("/api/public/ingest/fred")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const anon = process.env.SUPABASE_PUBLISHABLE_KEY;
        const apikey = request.headers.get("apikey");
        if (!anon || apikey !== anon) {
          return new Response("Unauthorized", { status: 401 });
        }

        const url = new URL(request.url);
        const series = url.searchParams.get("series");

        try {
          if (series) {
            const r = await runFredIngest(series);
            return Response.json(r);
          }
          const results = await runAllFredIngest();
          return Response.json({ results });
        } catch (e) {
          return new Response(`Ingestion error: ${(e as Error).message}`, { status: 500 });
        }
      },
    },
  },
});