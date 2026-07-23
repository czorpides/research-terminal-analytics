import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/calendar/run-due")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { isCalendarSchedulerRequest } = await import("@/lib/calendar/auth.server");
        if (!(await isCalendarSchedulerRequest(request)))
          return new Response("Unauthorized", { status: 401 });
        try {
          const body = (await request.json().catch(() => ({}))) as { limit?: number };
          const limit = Math.max(1, Math.min(20, Number(body.limit ?? 8)));
          const { runDueCalendarEvents } = await import("@/lib/calendar/orchestrator.server");
          return Response.json({
            ok: true,
            ...(await runDueCalendarEvents(limit)),
          });
        } catch (error) {
          return new Response(`Calendar worker error: ${(error as Error).message}`, {
            status: 500,
          });
        }
      },
    },
  },
});
