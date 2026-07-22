import { createFileRoute } from "@tanstack/react-router";
import { calculateKalmanLlt } from "@/lib/analytics/client.server";
import { getInflationEngine, getGrowthInflationMap } from "@/lib/panels/inflation.functions";

/**
 * Diagnostic: authenticated synthetic Kalman call against the Inflation
 * Engine model key. Used once to confirm Fly.io redeploy honours the
 * strict allow-list and echoes inflation model_key correctly.
 */
export const Route = createFileRoute("/api/public/diag/kalman-inflation-ping")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const anon = process.env.SUPABASE_PUBLISHABLE_KEY;
        const apikey = request.headers.get("apikey");
        if (!anon || apikey !== anon) return new Response("Unauthorized", { status: 401 });

        const url = new URL(request.url);
        if (url.searchParams.get("report") === "1") {
          const [engine, map] = await Promise.all([
            getInflationEngine(),
            getGrowthInflationMap(),
          ]);
          return Response.json({
            ok: true,
            frameworkVersion: engine.frameworkVersion,
            latestRun: engine.latestRun,
            breadth: engine.breadth,
            pressure: engine.pressure,
            indicatorCount: engine.indicators.length,
            indicatorSummary: engine.indicators.map((p) => ({
              concept: p.concept_code,
              latest_date: p.latest_date,
              latest_value: p.latest_value,
              yoy: p.metrics.yoy,
              zone: p.zone,
              kalman_level: p.kalman?.level ?? null,
              kalman_slope: p.kalman?.slope ?? null,
            })),
            map,
          });
        }

        const start = new Date("2020-01-01");
        const observations = Array.from({ length: 60 }, (_, i) => {
          const d = new Date(start);
          d.setMonth(d.getMonth() + i);
          return { date: d.toISOString().slice(0, 10), value: 3 + 0.02 * i };
        });

        const req = {
          model_key: "inflation_engine.us.kalman_llt",
          model_version: "kalman.llt.v0.2",
          calculation_mode: "live" as const,
          as_of_date: null,
          training_start: observations[0].date,
          training_end: null,
          input_hash: "diag-inflation-ping-0001",
          indicator_id: "00000000-0000-0000-0000-0000000d1a61",
          indicator_frequency: "monthly" as const,
          indicator_unit: "yoy_pct",
          observations,
          model_config_params: { min_history: 24 },
        };

        try {
          const res = await calculateKalmanLlt(req);
          return Response.json({
            ok: true,
            echo_matches: {
              model_key: res.model_key === req.model_key,
              model_version: res.model_version === req.model_version,
              indicator_id: res.indicator_id === req.indicator_id,
              input_hash: res.input_hash === req.input_hash,
            },
            status: res.status,
            converged: res.converged,
            model_key: res.model_key,
            model_version: res.model_version,
            indicator_id: res.indicator_id,
            input_hash: res.input_hash,
            n_observations: res.n_observations,
            n_points: res.points.length,
            warnings: res.warnings,
          });
        } catch (e) {
          return new Response(`Kalman error: ${(e as Error).message}`, { status: 500 });
        }
      },
    },
  },
});