import { createServerFn } from "@tanstack/react-start";

export interface SwingManualRefreshResult {
  ok: boolean;
  refreshedAt: string;
  captured: number;
  evaluated: number;
  quotesUpdated: number;
  surfaced: number;
  providers: Record<string, number>;
  failures: Array<{ symbol: string; error: string }>;
  error: string | null;
}

/**
 * User-triggered refresh for the Swing Trade workspace.
 *
 * This intentionally reuses the quota-aware monitor rather than bypassing the
 * provider reserves. It captures the latest qualifying setup snapshot, updates
 * tracked outcomes against completed daily bars and requests fresh intraday
 * quotes for the strongest active tracked setups. The technical setup itself
 * remains anchored to completed OHLCV bars, which avoids silently mixing a
 * partial intraday candle into a daily model.
 */
export const refreshSwingTradesNow = createServerFn({ method: "POST" }).handler(
  async (): Promise<SwingManualRefreshResult> => {
    try {
      const { runScheduledSwingMonitor } = await import("./monitor.server");
      const result = await runScheduledSwingMonitor("manual");
      return {
        ok: true,
        refreshedAt: result.asOf,
        captured: result.captured,
        evaluated: result.evaluated,
        quotesUpdated: result.quotesUpdated,
        surfaced: result.surfaced,
        providers: result.providers,
        failures: result.failures,
        error: null,
      };
    } catch (error) {
      return {
        ok: false,
        refreshedAt: new Date().toISOString(),
        captured: 0,
        evaluated: 0,
        quotesUpdated: 0,
        surfaced: 0,
        providers: {},
        failures: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
);
