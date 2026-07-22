/**
 * Authenticated server functions that trigger Python analytics jobs and
 * fetch their status. The browser calls these — never the Python service
 * directly. Only signed-in users can invoke them; the analytics runtime
 * itself is authorised via the server-side ANALYTICS_SERVICE_TOKEN bearer
 * attached by the client helper.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TriggerInput = z
  .object({
    asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    force: z.boolean().optional(),
  })
  .default({});

export const triggerUsGrowthKalmanFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => TriggerInput.parse(input ?? {}))
  .handler(async ({ data }) => {
    const { triggerUsGrowthKalman } = await import("./client.server");
    return triggerUsGrowthKalman({ asOfDate: data.asOfDate, force: data.force });
  });

export const getAnalyticsJobFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ runId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { getAnalyticsJob } = await import("./client.server");
    return getAnalyticsJob(data.runId);
  });

export const analyticsHealthFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { analyticsHealth } = await import("./client.server");
    return analyticsHealth();
  });