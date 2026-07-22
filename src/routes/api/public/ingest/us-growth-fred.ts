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
        const scope = url.searchParams.get("scope");
        const SCOPES: Record<string, string[]> = {
          weekly: ["initial_jobless_claims"],
          payrolls: ["nonfarm_payrolls"],
          monthly: ["industrial_production", "retail_sales", "housing_starts"],
          // safety + revisions poll everything; the per-indicator hash guard
          // keeps Fly.io calls cheap when nothing changed.
          safety: [],
          revisions: [],
        };
        const conceptCodes = scope && SCOPES[scope]?.length ? SCOPES[scope] : undefined;
        // Payrolls window fires every Friday in cron; gate to the first week of the month.
        if (scope === "payrolls" && new Date().getUTCDate() > 7) {
          return Response.json({ ok: true, skipped: "payrolls window: not first week of month" });
        }
        try {
          if (pipeline) {
            const out = await runUsGrowthPipeline({ yearsBack, forceKalman: force, conceptCodes });
            return Response.json({ ok: true, ...out });
          }
          const results = await runUsGrowthFredIngest({ yearsBack, conceptCodes });
          return Response.json({ ok: true, results });
        } catch (e) {
          return new Response(`Ingest error: ${(e as Error).message}`, { status: 500 });
        }
      },
    },
  },
});