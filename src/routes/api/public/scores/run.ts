import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/scores/run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const anon = process.env.SUPABASE_PUBLISHABLE_KEY;
        const apikey = request.headers.get("apikey");
        if (!anon || apikey !== anon) return new Response("Unauthorized", { status: 401 });
        try {
          const url = new URL(request.url);
          const technicalOnly = url.searchParams.get("technicalOnly") === "1";
          const { runScoresForAllAssets, runTechnicalScoresBatch } = await import(
            "@/lib/scoring/run.server"
          );
          if (technicalOnly) {
            return Response.json(
              await runTechnicalScoresBatch(integerParam(url, "limit") ?? 250),
            );
          }
          return Response.json(await runScoresForAllAssets());
        } catch (e) {
          return new Response(`Scoring error: ${(e as Error).message}`, { status: 500 });
        }
      },
    },
  },
});

function integerParam(url: URL, key: string): number | null {
  const raw = url.searchParams.get(key);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.trunc(value) : null;
}
