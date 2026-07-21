import { createFileRoute } from "@tanstack/react-router";

/**
 * Kick off the history narrative verify loop. Called by:
 *   - pg_cron on the 30-min tick (trigger=cron)
 *   - Data Health page (trigger=manual)
 *   - single-event retry button on /history/$eventId (body.code=CODE)
 */
export const Route = createFileRoute("/api/public/history/verify-narratives")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const anon = process.env.SUPABASE_PUBLISHABLE_KEY;
        const apikey = request.headers.get("apikey");
        if (!anon || apikey !== anon) return new Response("Unauthorized", { status: 401 });

        let body: { code?: string } = {};
        try { body = await request.json(); } catch { body = {}; }

        try {
          const { verifyEventNarrative, verifyAllNarratives } = await import("@/lib/history/narrative-verify.server");
          if (body.code) {
            const r = await verifyEventNarrative(body.code);
            return Response.json({ ok: true, result: r });
          }
          const summary = await verifyAllNarratives();
          return Response.json({ ok: true, ...summary });
        } catch (e) {
          return new Response(`Narrative verifier error: ${(e as Error).message}`, { status: 500 });
        }
      },
    },
  },
});