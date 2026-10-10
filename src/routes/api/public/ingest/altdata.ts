import { createFileRoute } from "@tanstack/react-router";

/**
 * POST /api/public/ingest/altdata
 * Called by pg_cron (daily 06:15 UTC) and by the Data Health page.
 * Auth: server-only INTERNAL_JOB_TOKEN in the Authorization bearer header.
 */
export const Route = createFileRoute("/api/public/ingest/altdata")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authorizeInternalJobRequest } = await import("@/lib/security/internal-job-auth.server");
        if (!authorizeInternalJobRequest(request)) return new Response("Unauthorized", { status: 401 });
        try {
          const { runAltDataIngest } = await import("@/lib/ingestion/altdata/ingest.server");
          const summary = await runAltDataIngest();
          return Response.json(summary);
        } catch (e) {
          return new Response(`Alt-data ingestion error: ${(e as Error).message}`, { status: 500 });
        }
      },
    },
  },
});