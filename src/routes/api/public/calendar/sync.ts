import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/calendar/sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (
          !process.env.SUPABASE_PUBLISHABLE_KEY ||
          request.headers.get("apikey") !== process.env.SUPABASE_PUBLISHABLE_KEY
        )
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
