import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/ingest/swing-metals")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const anon = process.env.SUPABASE_PUBLISHABLE_KEY;
        const apikey = request.headers.get("apikey");
        if (!anon || apikey !== anon) return new Response("Unauthorized", { status: 401 });

        try {
          const url = new URL(request.url);
          const requestedDays = Number(url.searchParams.get("days") ?? "620");
          const days = Number.isFinite(requestedDays)
            ? Math.max(300, Math.min(Math.floor(requestedDays), 1_200))
            : 620;
          const { runSwingMetalsIngest } = await import("@/lib/swing/metals.server");
          return Response.json(await runSwingMetalsIngest(days));
        } catch (error) {
          return new Response(`Swing metals ingestion error: ${errorMessage(error)}`, { status: 500 });
        }
      },
    },
  },
});

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const values = [record.code, record.message, record.details, record.hint]
      .filter((value) => value !== null && value !== undefined && String(value).trim())
      .map(String);
    if (values.length) return values.join(" · ");
    try { return JSON.stringify(record); } catch { return String(error); }
  }
  return String(error);
}
