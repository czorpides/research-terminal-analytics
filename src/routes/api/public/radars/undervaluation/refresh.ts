import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/radars/undervaluation/refresh")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const anon = process.env.SUPABASE_PUBLISHABLE_KEY;
        const apikey = request.headers.get("apikey");
        if (!anon || apikey !== anon) return new Response("Unauthorized", { status: 401 });
        try {
          const { refreshUndervaluationWatchlist } = await import("@/lib/panels/undervaluation.functions");
          const result = await refreshUndervaluationWatchlist();
          return Response.json(result);
        } catch (e) {
          return new Response(`Refresh error: ${(e as Error).message}`, { status: 500 });
        }
      },
    },
  },
});