import { createFileRoute } from "@tanstack/react-router";

const MINIMUM_MANAGED_EQUITIES = 2_400;

/**
 * Equity ingestion endpoint. The historical `/ingest/stooq` route now manages
 * a diversified US, UK and EU population, one ticker, or a rotating price batch.
 * A normal scheduled price call bootstraps the universe when coverage falls
 * materially below the 3,000-name target.
 */
export const Route = createFileRoute("/api/public/ingest/stooq")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const anon = process.env.SUPABASE_PUBLISHABLE_KEY;
        const apikey = request.headers.get("apikey");
        if (!anon || apikey !== anon) return new Response("Unauthorized", { status: 401 });

        const url = new URL(request.url);
        const ticker = url.searchParams.get("ticker");
        const syncUniverse = url.searchParams.get("syncUniverse") === "1";

        try {
          if (syncUniverse) {
            const { syncManagedEquityUniverse } = await import(
              "@/lib/ingestion/equities/universe.server"
            );
            return Response.json(
              await syncManagedEquityUniverse({
                limit: integerParam(url, "limit"),
                minMarketCap: numberParam(url, "minMarketCap"),
                minPrice: numberParam(url, "minPrice"),
                minVolume: numberParam(url, "minVolume"),
                exchanges: csvParam(url, "exchanges"),
                markets: csvParam(url, "markets"),
              }),
            );
          }

          const { runEquityIngest, runEquityIngestBatch } = await import(
            "@/lib/ingestion/equities/ingest.server"
          );
          if (ticker) return Response.json(await runEquityIngest(ticker.toUpperCase()));

          const universeBootstrap = await ensureManagedUniverse();
          const batch = await runEquityIngestBatch({
            limit: integerParam(url, "limit"),
            offset: integerParam(url, "offset"),
          });
          return Response.json({ ...batch, universeBootstrap });
        } catch (e) {
          return new Response(`Ingestion error: ${(e as Error).message}`, { status: 500 });
        }
      },
    },
  },
});

async function ensureManagedUniverse(): Promise<
  | { status: "not_needed"; activeEquities: number }
  | {
      status: "success";
      activeEquitiesBefore: number;
      upserted: number;
      deactivated: number;
      selectedByMarket: Record<string, number>;
    }
  | { status: "failed"; activeEquities: number; error: string }
> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count, error } = await supabaseAdmin
    .from("assets")
    .select("id", { count: "exact", head: true })
    .eq("active", true)
    .eq("asset_class", "equity");
  if (error) throw error;

  const activeEquities = count ?? 0;
  if (activeEquities >= MINIMUM_MANAGED_EQUITIES) {
    return { status: "not_needed", activeEquities };
  }

  try {
    const { syncManagedEquityUniverse } = await import(
      "@/lib/ingestion/equities/universe.server"
    );
    const result = await syncManagedEquityUniverse({ limit: 3_000 });
    return {
      status: "success",
      activeEquitiesBefore: activeEquities,
      upserted: result.upserted,
      deactivated: result.deactivated,
      selectedByMarket: result.selectedByMarket,
    };
  } catch (error) {
    return {
      status: "failed",
      activeEquities,
      error: (error as Error).message,
    };
  }
}

function csvParam(url: URL, key: string): string[] | undefined {
  const values = url.searchParams
    .get(key)
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return values?.length ? values : undefined;
}

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
