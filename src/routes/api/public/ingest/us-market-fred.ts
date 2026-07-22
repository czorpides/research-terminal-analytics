import { createFileRoute } from "@tanstack/react-router";
import { runUsMarketFredIngest } from "@/lib/ingestion/fred/market-ingest.server";

export const Route = createFileRoute("/api/public/ingest/us-market-fred")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (
          !process.env.SUPABASE_PUBLISHABLE_KEY ||
          request.headers.get("apikey") !== process.env.SUPABASE_PUBLISHABLE_KEY
        )
          return new Response("Unauthorized", { status: 401 });
        try {
          const yearsBack = Number(new URL(request.url).searchParams.get("years") ?? "30");
          return Response.json({ ok: true, ...(await runUsMarketFredIngest({ yearsBack })) });
        } catch (error) {
          return new Response(`Ingest error: ${(error as Error).message}`, { status: 500 });
        }
      },
    },
  },
});
