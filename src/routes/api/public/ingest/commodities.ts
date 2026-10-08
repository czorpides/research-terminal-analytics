import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/ingest/commodities")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authorizeInternalJobRequest } = await import("@/lib/security/internal-job-auth.server");
        if (!authorizeInternalJobRequest(request)) return new Response("Unauthorized", { status: 401 });
        try {
          const { runCommoditiesIngest } = await import("@/lib/ingestion/commodities/ingest.server");
          const result = await runCommoditiesIngest();
          return Response.json(result);
        } catch (e) {
          return new Response(`Ingest error: ${(e as Error).message}`, { status: 500 });
        }
      },
    },
  },
});