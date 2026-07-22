/**
 * US Growth Engine — Stage 1 read function.
 *
 * Joins the registered US Growth indicators, their vintage-preserving
 * observation history in raw_observations, and the latest Kalman filter
 * outputs from model_outputs. Every panel reports the metadata needed to
 * reproduce the calculation (mode, as-of, training window, MLE params,
 * model version) and enough history for a sparkline plus a "previous
 * value" and "latest revision" row.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const RegionCode = z.enum(["US", "UK", "EA"]);
export type GrowthRegion = z.infer<typeof RegionCode>;

export interface KalmanTrajectoryPoint {
  date: string;
  level: number;
  ci_low: number;
  ci_high: number;
}

export interface GrowthIndicatorRow {
  concept_code: string;
  name: string;
  frequency: string;
  unit: string | null;
  series_code_native: string;
  source: string | null;
  direction: string | null;
  seasonal_adj: boolean | null;
  transform_default: string | null;
  allowed_transformations: string[];
  min_history: number | null;
  observation_count: number;
  latest_value: number | null;
  latest_date: string | null;
  previous_value: number | null;
  previous_date: string | null;
  latest_revision: {
    observation_date: string;
    previous_value: number | null;
    revised_value: number;
    revised_at: string;
  } | null;
  data_freshness_days: number | null;
  history: Array<{ date: string; value: number | null }>;
  kalman: {
    status: "ok" | "insufficient_history" | "not_run";
    latest_level: number | null;
    latest_slope: number | null;
    latest_ci_low: number | null;
    latest_ci_high: number | null;
    trend_direction: "improving" | "stable" | "deteriorating" | "unknown";
    trend_zone: "green" | "yellow" | "red" | "gray";
    acceleration: number | null;
    model_version: string | null;
    calc_mode: "live" | "historical" | null;
    as_of_date: string | null;
    training_start: string | null;
    training_end: string | null;
    model_params_json: string | null;
    reason: string | null;
    trajectory: KalmanTrajectoryPoint[];
  };
}

export interface GrowthEnginePayload {
  region: GrowthRegion;
  regionLabel: string;
  indicators: GrowthIndicatorRow[];
  modelStatus: {
    kalman: { available: boolean; message: string };
    factor: { available: boolean; message: string };
  };
  latestRun: {
    id: string;
    status: string;
    started_at: string;
    finished_at: string | null;
    model_version: string;
    calculation_mode: string | null;
    output_summary_json: string | null;
  } | null;
}

const US_GROWTH_CONCEPTS = [
  "industrial_production",
  "retail_sales",
  "housing_starts",
  "initial_jobless_claims",
  "nonfarm_payrolls",
];

export const getGrowthEngine = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ region: RegionCode }).parse(input))
  .handler(async ({ data }): Promise<GrowthEnginePayload> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: region } = await supabaseAdmin
      .from("regions").select("id, name, code").eq("code", data.region).maybeSingle();
    if (!region) throw new Error(`Unknown region ${data.region}`);

    const { data: indicators } = await supabaseAdmin
      .from("indicator_registry")
      .select("id, concept_code, series_code_native, frequency, unit, transform_default, direction, description, source_id, seasonal_adj, min_history, allowed_transformations")
      .eq("region_id", region.id).eq("engine", "growth").eq("is_active", true)
      .order("concept_code");

    // Sort so the five in-scope US concepts appear in a stable order first.
    const list = (indicators ?? []).slice().sort((a, b) => {
      const ai = US_GROWTH_CONCEPTS.indexOf(a.concept_code as string);
      const bi = US_GROWTH_CONCEPTS.indexOf(b.concept_code as string);
      const ax = ai === -1 ? 999 : ai;
      const bx = bi === -1 ? 999 : bi;
      return ax - bx;
    });

    const sourceIds = Array.from(new Set(list.map((i) => i.source_id).filter((x): x is string => !!x)));
    const { data: sources } = sourceIds.length
      ? await supabaseAdmin.from("data_sources").select("id, name").in("id", sourceIds)
      : { data: [] as { id: string; name: string }[] };
    const sourceName = new Map((sources ?? []).map((s) => [s.id as string, s.name as string]));

    const ids = list.map((i) => i.id as string);

    // Latest successful Kalman run — used to stamp model_version + calc_mode on the panel.
    const { data: runs } = await supabaseAdmin
      .from("model_runs")
      .select("id, model_key, model_version, status, started_at, finished_at, output_summary")
      .eq("model_key", "growth_engine.us.kalman_llt")
      .in("status", ["success", "running", "queued", "failed"])
      .order("started_at", { ascending: false })
      .limit(1);
    const latestRun = runs?.[0] ?? null;

    // Bulk-load raw observations (dedupe by observation_date, take latest vintage)
    const historyByIndicator = new Map<string, Array<{ date: string; value: number | null; retrieved_at: string }>>();
    const revisionsByIndicator = new Map<string, GrowthIndicatorRow["latest_revision"]>();
    if (ids.length) {
      const { data: rawObs } = await supabaseAdmin
        .from("raw_observations")
        .select("indicator_id, observation_date, value_raw, retrieved_at, meta")
        .in("indicator_id", ids)
        .order("indicator_id", { ascending: true })
        .order("observation_date", { ascending: true })
        .order("retrieved_at", { ascending: true });

      for (const o of rawObs ?? []) {
        const ind = o.indicator_id as string;
        const date = (o.observation_date as string).slice(0, 10);
        const value = o.value_raw === null ? null : Number(o.value_raw);
        // Collapse to latest vintage per date; revision = last non-null replaces earlier.
        const arr = historyByIndicator.get(ind) ?? [];
        const last = arr[arr.length - 1];
        if (last && last.date === date) {
          last.value = value;
          last.retrieved_at = o.retrieved_at as string;
          if ((o.meta as { revision?: boolean } | null)?.revision) {
            revisionsByIndicator.set(ind, {
              observation_date: date,
              previous_value: ((o.meta as { previous_value?: number | null } | null)?.previous_value ?? null),
              revised_value: value ?? 0,
              revised_at: o.retrieved_at as string,
            });
          }
        } else {
          arr.push({ date, value, retrieved_at: o.retrieved_at as string });
          historyByIndicator.set(ind, arr);
        }
      }
    }

    // Fallback: legacy data_points (populated by existing FRED ingest) — only when raw_observations is empty for an indicator.
    if (data.region === "US") {
      const missing = list.filter((i) => !historyByIndicator.has(i.id as string));
      if (missing.length) {
        const codes = missing.map((i) => i.series_code_native as string);
        const { data: legacy } = await supabaseAdmin
          .from("data_points")
          .select("metric_code, as_of, value_num")
          .in("metric_code", codes)
          .order("as_of", { ascending: true });
        const bySeries = new Map<string, Array<{ date: string; value: number | null; retrieved_at: string }>>();
        for (const r of legacy ?? []) {
          const arr = bySeries.get(r.metric_code as string) ?? [];
          arr.push({ date: (r.as_of as string).slice(0, 10), value: r.value_num === null ? null : Number(r.value_num), retrieved_at: r.as_of as string });
          bySeries.set(r.metric_code as string, arr);
        }
        for (const ind of missing) {
          const arr = bySeries.get(ind.series_code_native as string);
          if (arr && arr.length) historyByIndicator.set(ind.id as string, arr);
        }
      }
    }

    // Latest Kalman outputs per indicator (level, slope, CI bounds)
    const kalmanByIndicator = new Map<string, {
      level: number | null; ci_low: number | null; ci_high: number | null;
      slope: number | null; date: string | null;
      model_version: string | null; calc_mode: string | null; as_of_date: string | null;
      training_start: string | null; training_end: string | null;
      model_params: Record<string, number> | null;
      trajectory: KalmanTrajectoryPoint[];
    }>();
    if (ids.length) {
      const { data: outs } = await supabaseAdmin
        .from("model_outputs")
        .select("indicator_id, ts, output_type, value, meta, model_version")
        .eq("model_key", "growth_engine.us.kalman_llt")
        .in("indicator_id", ids)
        .order("ts", { ascending: true });
      // Group per (indicator, ts)
      const grouped = new Map<string, Map<string, { level?: number; slope?: number; ci_low?: number; ci_high?: number; meta: Record<string, unknown>; model_version: string }>>();
      for (const o of outs ?? []) {
        const ind = o.indicator_id as string;
        const ts = (o.ts as string).slice(0, 10);
        const map = grouped.get(ind) ?? new Map();
        const cur = map.get(ts) ?? { meta: (o.meta as Record<string, unknown>) ?? {}, model_version: o.model_version as string };
        const v = o.value === null ? null : Number(o.value);
        if (o.output_type === "kalman_level") cur.level = v ?? undefined;
        if (o.output_type === "kalman_slope") cur.slope = v ?? undefined;
        if (o.output_type === "kalman_level_ci_low") cur.ci_low = v ?? undefined;
        if (o.output_type === "kalman_level_ci_high") cur.ci_high = v ?? undefined;
        map.set(ts, cur);
        grouped.set(ind, map);
      }
      for (const [ind, map] of grouped) {
        const entries = Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
        const trajectory: KalmanTrajectoryPoint[] = entries
          .filter(([, v]) => v.level !== undefined && v.ci_low !== undefined && v.ci_high !== undefined)
          .map(([date, v]) => ({ date, level: v.level as number, ci_low: v.ci_low as number, ci_high: v.ci_high as number }));
        const [latestTs, latest] = entries[entries.length - 1] ?? [null, null];
        const meta = (latest?.meta ?? {}) as Record<string, unknown>;
        kalmanByIndicator.set(ind, {
          level: latest?.level ?? null,
          slope: latest?.slope ?? null,
          ci_low: latest?.ci_low ?? null,
          ci_high: latest?.ci_high ?? null,
          date: latestTs,
          model_version: latest?.model_version ?? null,
          calc_mode: (meta.calculation_mode as string | undefined) ?? null,
          as_of_date: (meta.as_of_date as string | undefined) ?? null,
          training_start: (meta.training_start as string | undefined) ?? null,
          training_end: (meta.training_end as string | undefined) ?? null,
          model_params: (meta.model_params as Record<string, number> | undefined) ?? null,
          trajectory,
        });
      }
    }

    const rows: GrowthIndicatorRow[] = list.map((i) => {
      const history = historyByIndicator.get(i.id as string) ?? [];
      const withValues = history.filter((h) => h.value !== null);
      const latest = withValues[withValues.length - 1] ?? null;
      const previous = withValues[withValues.length - 2] ?? null;
      const revision = revisionsByIndicator.get(i.id as string) ?? null;
      const kal = kalmanByIndicator.get(i.id as string) ?? null;

      const freshnessDays = latest
        ? Math.max(0, Math.round((Date.now() - new Date(`${latest.date}T00:00:00Z`).getTime()) / 86_400_000))
        : null;

      // Acceleration = current slope − prior slope (from latest 2 trajectory points)
      let acceleration: number | null = null;
      if (kal && kal.trajectory.length >= 2) {
        // Slopes aren't in the trajectory shape; approximate acceleration from level differences
        const t = kal.trajectory;
        const a = t[t.length - 1].level - t[t.length - 2].level;
        const b = t.length >= 3 ? t[t.length - 2].level - t[t.length - 3].level : a;
        acceleration = a - b;
      }

      const trendDir = classifyTrend(kal?.slope ?? null);
      const zone = classifyZone(trendDir, (i.direction as string | null) ?? null);

      return {
        concept_code: i.concept_code as string,
        name: (i.description as string) ?? (i.concept_code as string),
        frequency: i.frequency as string,
        unit: (i.unit as string | null) ?? null,
        series_code_native: i.series_code_native as string,
        source: sourceName.get(i.source_id as string) ?? null,
        direction: (i.direction as string | null) ?? null,
        seasonal_adj: (i.seasonal_adj as boolean | null) ?? null,
        transform_default: (i.transform_default as string | null) ?? null,
        allowed_transformations: ((i.allowed_transformations as string[] | null) ?? []),
        min_history: (i.min_history as number | null) ?? null,
        observation_count: withValues.length,
        latest_value: latest?.value ?? null,
        latest_date: latest?.date ?? null,
        previous_value: previous?.value ?? null,
        previous_date: previous?.date ?? null,
        latest_revision: revision,
        data_freshness_days: freshnessDays,
        history: history.slice(-120).map((h) => ({ date: h.date, value: h.value })),
        kalman: {
          status: kal ? "ok" : "not_run",
          latest_level: kal?.level ?? null,
          latest_slope: kal?.slope ?? null,
          latest_ci_low: kal?.ci_low ?? null,
          latest_ci_high: kal?.ci_high ?? null,
          trend_direction: trendDir,
          trend_zone: zone,
          acceleration,
          model_version: kal?.model_version ?? null,
          calc_mode: (kal?.calc_mode as "live" | "historical" | null) ?? null,
          as_of_date: kal?.as_of_date ?? null,
          training_start: kal?.training_start ?? null,
          training_end: kal?.training_end ?? null,
          model_params_json: kal?.model_params ? JSON.stringify(kal.model_params) : null,
          reason: kal ? null : "no Kalman output yet — trigger a run from the /macro/growth page",
          trajectory: kal?.trajectory ?? [],
        },
      };
    });

    return {
      region: data.region,
      regionLabel: region.name as string,
      indicators: rows,
      modelStatus: {
        kalman: {
          available: rows.some((r) => r.kalman.status === "ok"),
          message: latestRun
            ? `Latest run ${latestRun.status} · ${latestRun.model_version}`
            : "No Kalman run recorded yet.",
        },
        factor: { available: false, message: "PCA growth factor remains inactive in Stage 1." },
      },
      latestRun: latestRun
        ? {
            id: latestRun.id as string,
            status: latestRun.status as string,
            started_at: latestRun.started_at as string,
            finished_at: (latestRun.finished_at as string | null) ?? null,
            model_version: latestRun.model_version as string,
            calculation_mode: ((latestRun.output_summary as { calculation_mode?: string } | null)?.calculation_mode) ?? null,
            output_summary_json: latestRun.output_summary ? JSON.stringify(latestRun.output_summary) : null,
          }
        : null,
    };
  });

function classifyTrend(slope: number | null): GrowthIndicatorRow["kalman"]["trend_direction"] {
  if (slope === null || Number.isNaN(slope)) return "unknown";
  if (slope > 0.1) return "improving";
  if (slope < -0.1) return "deteriorating";
  return "stable";
}

// Zone semantics respect indicator direction. e.g. rising initial jobless
// claims (direction=lower_is_better) is RED, not GREEN.
function classifyZone(
  trend: GrowthIndicatorRow["kalman"]["trend_direction"],
  direction: string | null,
): GrowthIndicatorRow["kalman"]["trend_zone"] {
  if (trend === "unknown") return "gray";
  if (trend === "stable") return "yellow";
  const lowerIsBetter = direction === "lower_is_better";
  if (trend === "improving") return lowerIsBetter ? "red" : "green";
  return lowerIsBetter ? "green" : "red";
}