import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "crypto";

export const Route = createFileRoute("/api/public/analytics/selftest")({
  server: {
    handlers: {
      GET: async () => {
        const url = process.env.ANALYTICS_SERVICE_URL;
        const token = process.env.ANALYTICS_SERVICE_TOKEN;
        if (!url || !token) {
          return Response.json({ ok: false, error: "secrets not configured" }, { status: 500 });
        }
        const base = url.replace(/\/+$/, "");
        const results: Record<string, unknown> = {};

        // 1) healthz
        const h = await fetch(`${base}/healthz`);
        results.healthz = { status: h.status, body: await h.json().catch(() => null) };

        // 2) wrong bearer -> must be 401
        const bad = await fetch(`${base}/calc/kalman-llt`, {
          method: "POST",
          headers: {
            Authorization: "Bearer definitely-not-the-token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        });
        results.wrong_bearer = { status: bad.status };

        // 3) valid auth calc
        const indicator_id = "00000000-0000-0000-0000-0000000000aa";
        const input_hash = createHash("sha256").update("selftest-v1").digest("hex");
        const observations = Array.from({ length: 36 }, (_, i) => {
          const d = new Date(Date.UTC(2020, i, 1));
          return {
            date: d.toISOString().slice(0, 10),
            value: 100 + i + Math.sin(i / 3) * 2,
          };
        });
        const model_key = "growth_engine.us.kalman_llt";
        const model_version = "kalman.llt.v0.2";
        const req = {
          model_key,
          model_version,
          calculation_mode: "live" as const,
          as_of_date: null,
          training_start: observations[0].date,
          training_end: null,
          input_hash,
          indicator_id,
          indicator_frequency: "monthly" as const,
          indicator_unit: "index",
          observations,
          model_config_params: { min_history: 24 },
        };
        const good = await fetch(`${base}/calc/kalman-llt`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(req),
        });
        const goodBody = await good.json().catch(() => null) as any;
        results.calc = {
          status: good.status,
          body_status: goodBody?.status,
          echoes: goodBody && {
            indicator_id_match: goodBody.indicator_id === indicator_id,
            model_key_match: goodBody.model_key === model_key,
            model_version_match: goodBody.model_version === model_version,
            input_hash_match: goodBody.input_hash === input_hash,
          },
          n_points: Array.isArray(goodBody?.points) ? goodBody.points.length : null,
          converged: goodBody?.converged,
          warnings: goodBody?.warnings,
        };

        return Response.json({ ok: true, results });
      },
    },
  },
});