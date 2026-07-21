import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/providers/ping")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const anon = process.env.SUPABASE_PUBLISHABLE_KEY;
        const apikey = request.headers.get("apikey");
        if (!anon || apikey !== anon) return new Response("Unauthorized", { status: 401 });
        const { pingAll } = await import("@/lib/ingestion/providers/registry.server");
        return Response.json({ providers: await pingAll(), checkedAt: new Date().toISOString() });
      },
    },
  },
});