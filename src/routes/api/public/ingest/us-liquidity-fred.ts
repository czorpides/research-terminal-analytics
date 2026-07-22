import { createFileRoute } from "@tanstack/react-router";
import { runUsLiquidityFredIngest } from "@/lib/ingestion/fred/liquidity-ingest.server";
export const Route = createFileRoute("/api/public/ingest/us-liquidity-fred")({ server: { handlers: { POST: async ({ request }) => {
  if (!process.env.SUPABASE_PUBLISHABLE_KEY || request.headers.get("apikey") !== process.env.SUPABASE_PUBLISHABLE_KEY) return new Response("Unauthorized", { status: 401 });
  try { const years = Number(new URL(request.url).searchParams.get("years") ?? "20"); return Response.json({ ok: true, ...(await runUsLiquidityFredIngest({ yearsBack: years })) }); }
  catch (error) { return new Response(`Ingest error: ${(error as Error).message}`, { status: 500 }); }
} } } });
