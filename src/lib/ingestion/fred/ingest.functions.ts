import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { runFredIngest, runAllFredIngest } from "./ingest.server";
import { findSeries } from "./series";

/**
 * Ingest one FRED series: fetch observations, diff against the last stored
 * as_of for this indicator, insert new rows into data_points and
 * economic_releases, and log an ingestion_runs row. Uses supabaseAdmin
 * because data_points is append-only under RLS.
 */
export const ingestFredSeries = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ seriesCode: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data }) => {
    const spec = findSeries(data.seriesCode);
    if (!spec) throw new Error(`Unknown FRED series: ${data.seriesCode}`);
    return runFredIngest(spec.seriesCode);
  });

export const ingestAllFredSeries = createServerFn({ method: "POST" }).handler(async () => {
  const results = await runAllFredIngest();
  return { results };
});