import { createFileRoute } from "@tanstack/react-router";

import type {
  EquityUniverseSyncOptions,
  EquityUniverseSyncResult,
} from "@/lib/ingestion/equities/universe.server";

const TARGET_MANAGED_EQUITIES = 3_000;
const MINIMUM_MANAGED_EQUITIES = 2_950;

/**
 * Equity ingestion endpoint. The historical `/ingest/stooq` route now manages
 * a diversified US, UK and EU population, one ticker, a rotating price batch,
 * or the quota-aware intraday Swing Trade monitor.
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
        const swingMonitor = url.searchParams.get("swingMonitor") === "1";

        try {
          if (swingMonitor) {
            const { runScheduledSwingMonitor } = await import("@/lib/swing/monitor.server");
            return Response.json(await runScheduledSwingMonitor());
          }

          if (syncUniverse) {
            return Response.json(
              await syncUniverseWithFallback({
                limit: integerParam(url, "limit") ?? TARGET_MANAGED_EQUITIES,
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
  | { status: "not_needed"; activeEquities: number; target: number }
  | {
      status: "success";
      activeEquitiesBefore: number;
      target: number;
      upserted: number;
      deactivated: number;
      selectedByMarket: Record<string, number>;
      warnings: string[];
    }
  | { status: "failed"; activeEquities: number; target: number; error: string }
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
    return { status: "not_needed", activeEquities, target: TARGET_MANAGED_EQUITIES };
  }

  try {
    const result = await syncUniverseWithFallback({
      limit: TARGET_MANAGED_EQUITIES,
      markets: ["US", "UK", "EU"],
    });
    return {
      status: "success",
      activeEquitiesBefore: activeEquities,
      target: TARGET_MANAGED_EQUITIES,
      upserted: result.upserted,
      deactivated: result.deactivated,
      selectedByMarket: result.selectedByMarket,
      warnings: result.warnings,
    };
  } catch (error) {
    return {
      status: "failed",
      activeEquities,
      target: TARGET_MANAGED_EQUITIES,
      error: (error as Error).message,
    };
  }
}

async function syncUniverseWithFallback(
  options: EquityUniverseSyncOptions,
): Promise<EquityUniverseSyncResult> {
  const { syncManagedEquityUniverse } = await import(
    "@/lib/ingestion/equities/universe.server"
  );

  try {
    return await syncManagedEquityUniverse(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const markets = (options.markets ?? ["US", "UK", "EU"])
      .map((market) => market.trim().toUpperCase())
      .filter(Boolean);
    const canFallbackToUs =
      !options.exchanges?.length &&
      markets.includes("US") &&
      markets.some((market) => market !== "US") &&
      !message.includes("(429)") &&
      !message.includes("authentication failed");

    if (!canFallbackToUs) throw error;

    try {
      const fallback = await syncManagedEquityUniverse({
        ...options,
        markets: ["US"],
        exchanges: undefined,
      });
      return {
        ...fallback,
        warnings: [
          `Global universe discovery failed; populated a US fallback universe instead: ${message}`,
          ...fallback.warnings,
        ],
      };
    } catch (fallbackError) {
      const fallbackMessage =
        fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      throw new Error(
        `Global universe bootstrap failed (${message}); US fallback also failed (${fallbackMessage})`,
      );
    }
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
