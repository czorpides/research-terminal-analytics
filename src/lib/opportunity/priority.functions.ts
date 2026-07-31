import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  symbol: z.string().trim().min(1).max(25).regex(/^[A-Za-z0-9._\-/]+$/),
});

export interface PriorityEvidenceRefreshResult {
  symbol: string;
  price: {
    status: string;
    rowsInserted: number;
    error?: string;
  };
  fundamentals: {
    status: string;
    rowsInserted: number;
    statementStatus?: string;
    statementReason?: string;
    error?: string;
  };
  scores: {
    ok: boolean;
    error?: string;
  };
}

/**
 * User-initiated evidence refresh for a company already in the managed universe.
 * This bypasses the rotating daily batch so a searched or watchlisted candidate
 * does not have to wait for the alphabetical universe cycle.
 */
export const refreshPriorityOpportunityEvidence = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }): Promise<PriorityEvidenceRefreshResult> => {
    const symbol = data.symbol.toUpperCase();
    const [{ runEquityIngest }, { runFundamentalsIngest }] = await Promise.all([
      import("@/lib/ingestion/equities/ingest.server"),
      import("@/lib/ingestion/fundamentals/ingest.server"),
    ]);

    const priceResult = await runEquityIngest(symbol);
    const fundamentalResult = await runFundamentalsIngest(symbol);

    let scores: PriorityEvidenceRefreshResult["scores"] = { ok: true };
    try {
      const { runFundamentalScoresForAllAssets } = await import("@/lib/scoring/run.server");
      const result = await runFundamentalScoresForAllAssets();
      scores = result.ok ? { ok: true } : { ok: false, error: result.error };
    } catch (error) {
      scores = { ok: false, error: (error as Error).message };
    }

    return {
      symbol,
      price: {
        status: priceResult.status,
        rowsInserted: priceResult.rowsInserted,
        error: priceResult.error,
      },
      fundamentals: {
        status: fundamentalResult.status,
        rowsInserted: fundamentalResult.rowsInserted,
        statementStatus: fundamentalResult.statements?.status,
        statementReason: fundamentalResult.statements?.reason,
        error: fundamentalResult.error,
      },
      scores,
    };
  });
