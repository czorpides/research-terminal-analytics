import { createFileRoute } from "@tanstack/react-router";
import { runUsLabourFredIngest } from "@/lib/ingestion/fred/labour-ingest.server";

export const Route = createFileRoute("/api/public/ingest/us-labour-fred")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (
          !process.env.SUPABASE_PUBLISHABLE_KEY ||
          request.headers.get("apikey") !== process.env.SUPABASE_PUBLISHABLE_KEY
        )
          return new Response("Unauthorized", { status: 401 });
        try {
          const params = new URL(request.url).searchParams;
          const yearsBack = Number(params.get("years") ?? "30");
          const ingest = await runUsLabourFredIngest({ yearsBack });
          const kalman =
            params.get("pipeline") === "1"
              ? await (
                  await import("@/lib/analytics/labour-pipeline.server")
                ).runUsLabourKalmanPipeline()
              : null;
          return Response.json({ ok: true, ...ingest, kalman });
        } catch (error) {
          return new Response(`Ingest error: ${(error as Error).message}`, { status: 500 });
        }
      },
    },
  },
});
