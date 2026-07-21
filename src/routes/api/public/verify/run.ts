import { createFileRoute } from "@tanstack/react-router";

/**
 * Kick off a verification run. Called by:
 *   - pg_cron on a schedule (trigger=cron)
 *   - the ingester after fresh data lands (trigger=ingest)
 *   - the owner from the Data Health page (trigger=manual)
 *
 * Body: { panelId?: string, seriesCodes?: string[], trigger?: string }
 * No body → run every active check.
 */
export const Route = createFileRoute("/api/public/verify/run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const anon = process.env.SUPABASE_PUBLISHABLE_KEY;
        const apikey = request.headers.get("apikey");
        if (!anon || apikey !== anon) return new Response("Unauthorized", { status: 401 });

        let body: { panelId?: string; seriesCodes?: string[]; trigger?: string } = {};
        try { body = await request.json(); } catch { body = {}; }
        const trigger = body.trigger ?? "manual";

        try {
          const { runVerificationForPanel, runVerificationForSeries, runAllVerifications } =
            await import("@/lib/verify/executor.server");
          let results;
          if (body.panelId) results = await runVerificationForPanel(body.panelId, trigger);
          else if (body.seriesCodes?.length) results = await runVerificationForSeries(body.seriesCodes, trigger);
          else results = await runAllVerifications(trigger);
          return Response.json({ ok: true, count: results.length, results });
        } catch (e) {
          return new Response(`Verifier error: ${(e as Error).message}`, { status: 500 });
        }
      },
    },
  },
});