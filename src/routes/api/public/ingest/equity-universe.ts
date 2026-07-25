import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/ingest/equity-universe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const anon = process.env.SUPABASE_PUBLISHABLE_KEY;
        const apikey = request.headers.get("apikey");
        if (!anon || apikey !== anon) return new Response("Unauthorized", { status: 401 });

        const url = new URL(request.url);
        const { syncUsEquityUniverse } = await import(
          "@/lib/ingestion/equities/universe.server"
        );

        try {
          const result = await syncUsEquityUniverse({
            limit: integerParam(url, "limit"),
            minMarketCap: numberParam(url, "minMarketCap"),
            minPrice: numberParam(url, "minPrice"),
            minVolume: numberParam(url, "minVolume"),
            exchanges: url.searchParams
              .get("exchanges")
              ?.split(",")
              .map((value) => value.trim())
              .filter(Boolean),
          });
          return Response.json(result);
        } catch (error) {
          return new Response(`Universe sync error: ${(error as Error).message}`, { status: 500 });
        }
      },
    },
  },
});

function numberParam(url: URL, key: string): number | undefined {
  const raw = url.searchParams.get(key);
  if (raw === null || raw.trim() === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function integerParam(url: URL, key: string): number | undefined {
  const value = numberParam(url, key);
  return value === undefined ? undefined : Math.floor(value);
}
