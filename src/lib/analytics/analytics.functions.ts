/**
 * Authenticated server functions that drive the stateless calculation
 * service. The browser calls these; the Python analytics runtime is
 * addressable only from server code via the ANALYTICS_SERVICE_TOKEN bearer.
 *
 * Persistence, idempotency, vintage handling and model_runs/model_outputs
 * writes live entirely in Lovable Cloud — see growth-pipeline.server.ts.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TriggerInput = z
  .object({
    asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    mode: z.enum(["live", "historical"]).optional(),
    force: z.boolean().optional(),
  })
  .default({});

export const runUsGrowthKalmanFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => TriggerInput.parse(input ?? {}))
  .handler(async ({ data }) => {
    const { runUsGrowthKalmanPipeline } = await import("./growth-pipeline.server");
    return runUsGrowthKalmanPipeline({
      asOfDate: data.asOfDate,
      mode: data.mode ?? "live",
      force: Boolean(data.force),
    });
  });

export const analyticsHealthFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { analyticsHealth } = await import("./client.server");
    return analyticsHealth();
  });