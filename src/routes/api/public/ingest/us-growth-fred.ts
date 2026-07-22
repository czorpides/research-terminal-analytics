import { createFileRoute } from "@tanstack/react-router";
import { runUsGrowthFredIngest } from "@/lib/ingestion/fred/growth-ingest.server";
import { runUsGrowthPipeline } from "@/lib/analytics/growth-pipeline.server";

/**
 * Backfill + incremental ingest for the US Growth Engine's five FRED series.
 * Preserves revisions in raw_observations. Called from pg_cron and manually.
 */
export const Route = createFileRoute("/api/public/ingest/us-growth-fred")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const anon = process.env.SUPABASE_PUBLISHABLE_KEY;
        const apikey = request.headers.get("apikey");
        if (!anon || apikey !== anon) return new Response("Unauthorized", { status: 401 });

        const url = new URL(request.url);
        const yearsBack = Number(url.searchParams.get("years") ?? "30");
        const pipeline = url.searchParams.get("pipeline") === "1";
        const force = url.searchParams.get("forceKalman") === "1";
        try {
          if (pipeline) {
            const out = await runUsGrowthPipeline({ yearsBack, forceKalman: force });
            return Response.json({ ok: true, ...out });
          }
          const results = await runUsGrowthFredIngest({ yearsBack });
          return Response.json({ ok: true, results });
        } catch (e) {
          return new Response(`Ingest error: ${(e as Error).message}`, { status: 500 });
        }
      },
    },
  },
});