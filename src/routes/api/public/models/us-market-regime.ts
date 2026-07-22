import { createFileRoute } from "@tanstack/react-router";
import { runUsMarketRegimePipeline } from "@/lib/analytics/market-regime-pipeline.server";

export const Route = createFileRoute("/api/public/models/us-market-regime")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (
          !process.env.SUPABASE_PUBLISHABLE_KEY ||
          request.headers.get("apikey") !== process.env.SUPABASE_PUBLISHABLE_KEY
        )
          return new Response("Unauthorized", { status: 401 });
        try {
          return Response.json({ ok: true, ...(await runUsMarketRegimePipeline()) });
        } catch (error) {
          return new Response(`Model error: ${(error as Error).message}`, { status: 500 });
        }
      },
    },
  },
});
