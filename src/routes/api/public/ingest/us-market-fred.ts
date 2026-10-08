import { createFileRoute } from "@tanstack/react-router";
import { runUsMarketFredIngest } from "@/lib/ingestion/fred/market-ingest.server";

export const Route = createFileRoute("/api/public/ingest/us-market-fred")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authorizeInternalJobRequest } = await import("@/lib/security/internal-job-auth.server");
        if (!authorizeInternalJobRequest(request)) return new Response("Unauthorized", { status: 401 });
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
