import { createFileRoute } from "@tanstack/react-router";
import { runAllNativeIngest, runNativeIngest } from "@/lib/ingestion/macro-native/ingest.server";

/**
 * Public HTTP endpoint hit by pg_cron. Auth uses the Supabase anon key
 * in the `apikey` header (same pattern as /api/public/ingest/fred).
 *
 *   POST /api/public/ingest/macro-native                     → every native series
 *   POST /api/public/ingest/macro-native?provider=ecb        → one provider
 *   POST /api/public/ingest/macro-native?series=IUDSOIA      → one series
 */
export const Route = createFileRoute("/api/public/ingest/macro-native")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const anon = process.env.SUPABASE_PUBLISHABLE_KEY;
        const apikey = request.headers.get("apikey");
        if (!anon || apikey !== anon) return new Response("Unauthorized", { status: 401 });
        const url = new URL(request.url);
        const series = url.searchParams.get("series");
        const provider = url.searchParams.get("provider") as "ecb" | "ons" | "boe" | "hmrc" | null;
        try {
          if (series) return Response.json(await runNativeIngest(series));
          return Response.json({ results: await runAllNativeIngest(provider ?? undefined) });
        } catch (e) {
          return new Response(`Native macro ingestion error: ${(e as Error).message}`, { status: 500 });
        }
      },
    },
  },
});