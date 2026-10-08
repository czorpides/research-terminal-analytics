import { createFileRoute } from "@tanstack/react-router";
import { runUsMarketRegimePipeline } from "@/lib/analytics/market-regime-pipeline.server";

export const Route = createFileRoute("/api/public/models/us-market-regime")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authorizeInternalJobRequest } = await import("@/lib/security/internal-job-auth.server");
        if (!authorizeInternalJobRequest(request)) return new Response("Unauthorized", { status: 401 });
        try {
          return Response.json({ ok: true, ...(await runUsMarketRegimePipeline()) });
        } catch (error) {
          return new Response(`Model error: ${(error as Error).message}`, { status: 500 });
        }
      },
    },
  },
});
