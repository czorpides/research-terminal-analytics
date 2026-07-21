import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/scores/run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const anon = process.env.SUPABASE_PUBLISHABLE_KEY;
        const apikey = request.headers.get("apikey");
        if (!anon || apikey !== anon) return new Response("Unauthorized", { status: 401 });
        try {
          const { runScoresForAllAssets } = await import("@/lib/scoring/run.server");
          return Response.json(await runScoresForAllAssets());
        } catch (e) {
          return new Response(`Scoring error: ${(e as Error).message}`, { status: 500 });
        }
      },
    },
  },
});