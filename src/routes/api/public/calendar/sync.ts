import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/calendar/sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { isCalendarSchedulerRequest } = await import("@/lib/calendar/auth.server");
        if (!(await isCalendarSchedulerRequest(request)))
          return new Response("Unauthorized", { status: 401 });
        try {
          const { syncReleaseCalendar } = await import("@/lib/calendar/sync.server");
          return Response.json({ ok: true, ...(await syncReleaseCalendar()) });
        } catch (error) {
          return new Response(`Calendar sync error: ${(error as Error).message}`, {
            status: 500,
          });
        }
      },
    },
  },
});
