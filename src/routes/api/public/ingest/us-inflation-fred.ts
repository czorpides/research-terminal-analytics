import { createFileRoute } from "@tanstack/react-router";
import { runUsInflationFredIngest } from "@/lib/ingestion/fred/inflation-ingest.server";
import { runUsInflationPipeline } from "@/lib/analytics/inflation-pipeline.server";

/**
 * Manual + (future) scheduled backfill/incremental endpoint for the 13 US
 * Inflation indicators. Cron cadence is defined but NOT activated until
 * manual success — the schedule setup happens post-acceptance.
 */
export const Route = createFileRoute("/api/public/ingest/us-inflation-fred")({
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
            const out = await runUsInflationPipeline({ yearsBack, forceKalman: force });
            return Response.json({ ok: true, ...out });
          }
          const results = await runUsInflationFredIngest({ yearsBack });
          return Response.json({ ok: true, results });
        } catch (e) {
          return new Response(`Ingest error: ${(e as Error).message}`, { status: 500 });
        }
      },
    },
  },
});