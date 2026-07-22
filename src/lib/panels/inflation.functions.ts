/**
 * US Inflation Engine — read function for /macro/inflation.
 * Joins registered indicators, vintage-preserved observations, Kalman
 * outputs and computes the transformation framework in-memory so panels
 * report Latest, MoM, YoY, 3m/6m annualised, momentum, acceleration,
 * z-score, percentile and Kalman trend. Also computes the Inflation
 * Pressure Score + contribution ledger, and a Growth×Inflation Map.
 */
import { createServerFn } from "@tanstack/react-start";
import { runTransforms, latestOf, TRANSFORM_FRAMEWORK_VERSION } from "@/lib/transforms/runner";
import type { Frequency, TransformName } from "@/lib/transforms/types";
import { zoneForTarget } from "@/lib/transforms/directionality";
import { scoreInflationPressure, type PressureInput } from "@/lib/scoring/inflation-pressure.server";

/**
 * PostgREST caps `.select()` at ~1000 rows per call. The inflation engine
 * spans 15k+ raw observations and 60k+ model outputs, so every batched read
 * MUST paginate or panels silently truncate to the first indicator's history
 * only (leaving `latest_value: null` for everyone else). This helper drains
 * a query in fixed-size pages until fewer than `pageSize` rows come back.
 */
async function paginate<T>(
  build: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  // Safety cap: 200k rows is far above the current inflation footprint.
  for (let i = 0; i < 200; i++) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw error as Error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

export interface InflationIndicatorPanel {
  concept_code: string;
  label: string;
  frequency: Frequency;
  unit: string | null;
  series_code_native: string;
  target: { value: number; band: [number, number]; unit: string } | null;
  vintage_quality: string | null;
  latest_value: number | null;
  latest_date: string | null;
  previous_value: number | null;
  previous_date: string | null;
  latest_revision: { observation_date: string; previous_value: number | null; revised_value: number; revised_at: string } | null;
  metrics: {
    mom: number | null; yoy: number | null; chg3mAnn: number | null; chg6mAnn: number | null;
    momentum: number | null; acceleration: number | null;
    zscoreHistorical: number | null; percentileHistorical: number | null;
    distanceFromTarget: number | null;
  };
  kalman: { level: number | null; slope: number | null; ci_low: number | null; ci_high: number | null; date: string | null } | null;
  zone: "green" | "yellow" | "red" | "gray";
  history: Array<{ date: string; value: number | null }>;
  calcVersion: string;
  inputsHash: string | null;
}

export interface InflationEnginePayload {
  indicators: InflationIndicatorPanel[];
  pressure: ReturnType<typeof scoreInflationPressure>;
  latestRun: { id: string; status: string; started_at: string; finished_at: string | null; model_version: string } | null;
  frameworkVersion: string;
  breadth: { above_target: number; on_target: number; below_target: number; unknown: number };
}

export const getInflationEngine = createServerFn({ method: "GET" }).handler(async (): Promise<InflationEnginePayload> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: region } = await supabaseAdmin.from("regions").select("id").eq("code", "US").maybeSingle();
  if (!region) throw new Error("US region missing");

  const { data: rawIndicators } = await supabaseAdmin
    .from("indicator_registry")
    .select("id, concept_code, series_code_native, frequency, unit, description, allowed_transformations, target_range, vintage_quality")
    .eq("region_id", region.id).eq("engine", "inflation").eq("is_active", true);

  const indicators = (rawIndicators ?? []);
  const ids = indicators.map((i) => i.id as string);

  const historyByIndicator = new Map<string, Array<{ date: string; value: number | null; retrieved_at: string; meta: any }>>();
  const revisionsByIndicator = new Map<string, InflationIndicatorPanel["latest_revision"]>();
  if (ids.length) {
    const rows = await paginate<{ indicator_id: string; observation_date: string; value_raw: unknown; retrieved_at: string; meta: any }>(
      (from, to) => supabaseAdmin
        .from("raw_observations")
        .select("indicator_id, observation_date, value_raw, retrieved_at, meta")
        .in("indicator_id", ids)
        .order("indicator_id", { ascending: true })
        .order("observation_date", { ascending: true })
        .order("retrieved_at", { ascending: true })
        .range(from, to),
    );
    for (const o of rows) {
      const ind = o.indicator_id as string;
      const date = (o.observation_date as string).slice(0, 10);
      const val = o.value_raw == null ? null : Number(o.value_raw);
      const arr = historyByIndicator.get(ind) ?? [];
      const last = arr[arr.length - 1];
      if (last && last.date === date) {
        last.value = val; last.retrieved_at = o.retrieved_at as string; last.meta = o.meta;
        if ((o.meta as any)?.revision) {
          revisionsByIndicator.set(ind, {
            observation_date: date,
            previous_value: (o.meta as any)?.previous_value ?? null,
            revised_value: val ?? 0,
            revised_at: o.retrieved_at as string,
          });
        }
      } else {
        arr.push({ date, value: val, retrieved_at: o.retrieved_at as string, meta: o.meta });
        historyByIndicator.set(ind, arr);
      }
    }
  }

  const kalmanByIndicator = new Map<string, { level: number | null; slope: number | null; ci_low: number | null; ci_high: number | null; date: string | null }>();
  if (ids.length) {
    const outs = await paginate<{ indicator_id: string; ts: string; output_type: string; value: unknown }>(
      (from, to) => supabaseAdmin
        .from("model_outputs")
        .select("indicator_id, ts, output_type, value")
        .eq("model_key", "inflation_engine.us.kalman_llt")
        .in("indicator_id", ids)
        .order("ts", { ascending: true })
        .range(from, to),
    );
    const per = new Map<string, Map<string, { level?: number; slope?: number; lo?: number; hi?: number }>>();
    for (const o of outs) {
      const ind = o.indicator_id as string; const ts = (o.ts as string).slice(0, 10);
      const m = per.get(ind) ?? new Map(); const cur = m.get(ts) ?? {};
      const v = o.value == null ? undefined : Number(o.value);
      if (o.output_type === "kalman_level") cur.level = v;
      else if (o.output_type === "kalman_slope") cur.slope = v;
      else if (o.output_type === "kalman_level_ci_low") cur.lo = v;
      else if (o.output_type === "kalman_level_ci_high") cur.hi = v;
      m.set(ts, cur); per.set(ind, m);
    }
    for (const [ind, m] of per) {
      const sorted = Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
      const [ts, latest] = sorted[sorted.length - 1] ?? [null, {}];
      kalmanByIndicator.set(ind, {
        level: latest?.level ?? null, slope: latest?.slope ?? null,
        ci_low: latest?.lo ?? null, ci_high: latest?.hi ?? null, date: ts,
      });
    }
  }

  const panels: InflationIndicatorPanel[] = indicators.map((i) => {
    const history = historyByIndicator.get(i.id as string) ?? [];
    const series = history.map((h) => ({ date: h.date, value: h.value }));
    const allowed = ((i.allowed_transformations as string[] | null) ?? []) as TransformName[];
    const freq = ((i.frequency as string) ?? "monthly") as Frequency;
    const target = (i.target_range as any) ?? null;

    const results = runTransforms({ series, allowed, frequency: freq });
    const byName = new Map(results.map((r) => [r.name, r]));

    const withVal = series.filter((s) => s.value != null);
    const latest = withVal[withVal.length - 1] ?? null;
    const previous = withVal[withVal.length - 2] ?? null;

    const yoy = latestOf(byName.get("yoy"));
    const zone = target ? zoneForTarget(yoy, target as any) : ("gray" as const);

    return {
      concept_code: i.concept_code as string,
      label: (i.description as string) ?? (i.concept_code as string),
      frequency: freq, unit: (i.unit as string | null) ?? null,
      series_code_native: i.series_code_native as string,
      target,
      vintage_quality: (i.vintage_quality as string | null) ?? null,
      latest_value: latest?.value ?? null,
      latest_date: latest?.date ?? null,
      previous_value: previous?.value ?? null,
      previous_date: previous?.date ?? null,
      latest_revision: revisionsByIndicator.get(i.id as string) ?? null,
      metrics: {
        mom: latestOf(byName.get("mom")),
        yoy,
        chg3mAnn: latestOf(byName.get("chg3mAnn")),
        chg6mAnn: latestOf(byName.get("chg6mAnn")),
        momentum: latestOf(byName.get("momentum")),
        acceleration: latestOf(byName.get("acceleration")),
        zscoreHistorical: latestOf(byName.get("zscoreHistorical")),
        percentileHistorical: latestOf(byName.get("percentileHistorical")),
        distanceFromTarget: target && yoy != null ? yoy - target.value : null,
      },
      kalman: kalmanByIndicator.get(i.id as string) ?? null,
      zone,
      history: series.slice(-120),
      calcVersion: TRANSFORM_FRAMEWORK_VERSION,
      inputsHash: results[0]?.inputsHash ?? null,
    };
  });

  let above = 0, on = 0, below = 0, unknown = 0;
  for (const p of panels) {
    if (p.metrics.distanceFromTarget == null) { unknown++; continue; }
    const halfBand = p.target ? Math.max(0.1, (p.target.band[1] - p.target.band[0]) / 2) : 0.5;
    if (Math.abs(p.metrics.distanceFromTarget) <= halfBand) on++;
    else if (p.metrics.distanceFromTarget > 0) above++;
    else below++;
  }

  const pressureInputs: PressureInput[] = panels
    .filter((p) => ["cpi_core","pce_core","cpi_headline","ppi_final_demand","wage_ahe","cpi_shelter","breakeven_5y5y","umich_1y_expectations","import_prices"].includes(p.concept_code))
    .map((p) => ({
      key: p.concept_code as PressureInput["key"],
      label: p.label,
      metric: p.target?.unit === "yoy_pct" ? "YoY %" : (p.target?.unit ?? "value"),
      value: p.target?.unit === "yoy_pct" || p.target?.unit === "pct" ? (p.metrics.yoy ?? p.latest_value) : p.latest_value,
      target: p.target ? { value: p.target.value, band: p.target.band } : null,
    }));
  const pressure = scoreInflationPressure(pressureInputs);

  const { data: runs } = await supabaseAdmin
    .from("model_runs")
    .select("id, status, started_at, finished_at, model_version")
    .eq("model_key", "inflation_engine.us.kalman_llt")
    .order("started_at", { ascending: false }).limit(1);
  const latestRun = runs?.[0]
    ? { id: runs[0].id as string, status: runs[0].status as string, started_at: runs[0].started_at as string,
        finished_at: (runs[0].finished_at as string | null) ?? null, model_version: runs[0].model_version as string }
    : null;

  return { indicators: panels, pressure, latestRun, frameworkVersion: TRANSFORM_FRAMEWORK_VERSION,
           breadth: { above_target: above, on_target: on, below_target: below, unknown } };
});

export interface GrowthInflationPoint { date: string; growth: number; inflation: number }
export interface GrowthInflationMapData {
  latest: { date: string; growth: number; inflation: number; quadrant: "goldilocks" | "reflation" | "stagflation" | "deflation" | "unknown" } | null;
  trail: GrowthInflationPoint[];
  interpretation: string;
}

export const getGrowthInflationMap = createServerFn({ method: "GET" }).handler(async (): Promise<GrowthInflationMapData> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: region } = await supabaseAdmin.from("regions").select("id").eq("code", "US").maybeSingle();
  if (!region) return { latest: null, trail: [], interpretation: "US region missing." };

  const { data: growthInd } = await supabaseAdmin
    .from("indicator_registry").select("id, concept_code")
    .eq("region_id", region.id).eq("engine", "growth").eq("is_active", true);
  const { data: infInd } = await supabaseAdmin
    .from("indicator_registry").select("id, concept_code")
    .eq("region_id", region.id).eq("engine", "inflation").eq("is_active", true);

  const growthIds = (growthInd ?? []).map((i) => i.id as string);
  const coreCpi = (infInd ?? []).find((i) => i.concept_code === "cpi_core");
  if (!growthIds.length || !coreCpi) return { latest: null, trail: [], interpretation: "Not enough model outputs yet." };

  const gOuts = await paginate<{ indicator_id: string; ts: string; value: unknown }>(
    (from, to) => supabaseAdmin
      .from("model_outputs").select("indicator_id, ts, value")
      .eq("model_key", "growth_engine.us.kalman_llt").eq("output_type", "kalman_slope")
      .in("indicator_id", growthIds).order("ts", { ascending: true })
      .range(from, to),
  );
  const gByMonth = new Map<string, number[]>();
  for (const o of gOuts) {
    const m = (o.ts as string).slice(0, 7);
    const arr = gByMonth.get(m) ?? []; arr.push(Number(o.value)); gByMonth.set(m, arr);
  }
  const growthSeries = Array.from(gByMonth.entries()).map(([m, arr]) => [m, arr.reduce((s, x) => s + x, 0) / arr.length] as const);

  const rawCpi = await paginate<{ observation_date: string; value_raw: unknown; retrieved_at: string }>(
    (from, to) => supabaseAdmin
      .from("raw_observations").select("observation_date, value_raw, retrieved_at")
      .eq("indicator_id", coreCpi.id).order("observation_date", { ascending: true }).order("retrieved_at", { ascending: true })
      .range(from, to),
  );
  const cpiByDate = new Map<string, number>();
  for (const o of rawCpi) cpiByDate.set((o.observation_date as string).slice(0, 10), Number(o.value_raw));
  const cpiSorted = Array.from(cpiByDate.entries()).sort(([a], [b]) => a.localeCompare(b));
  const yoy = new Map<string, number>();
  for (let i = 12; i < cpiSorted.length; i++) {
    const [d, cur] = cpiSorted[i]; const prev = cpiSorted[i - 12][1];
    if (prev > 0) yoy.set(d.slice(0, 7), (cur / prev - 1) * 100);
  }

  const trail: GrowthInflationPoint[] = [];
  for (const [m, slope] of growthSeries) {
    const inf = yoy.get(m);
    if (inf == null) continue;
    trail.push({ date: `${m}-01`, growth: slope, inflation: inf });
  }
  const tail = trail.slice(-36);
  const latest = tail[tail.length - 1] ?? null;
  const quadrant = latest
    ? (latest.growth > 0 && latest.inflation < 3 ? "goldilocks"
      : latest.growth > 0 && latest.inflation >= 3 ? "reflation"
      : latest.growth <= 0 && latest.inflation >= 3 ? "stagflation"
      : latest.growth <= 0 && latest.inflation < 3 ? "deflation" : "unknown")
    : "unknown";

  const interpretation = latest
    ? `Macro tendency (not a confirmed regime): composite growth slope ${latest.growth.toFixed(2)} with core CPI YoY ${latest.inflation.toFixed(1)}% points toward the "${quadrant}" quadrant.`
    : "Insufficient overlapping data to place a tendency on the map.";

  return { latest: latest ? { ...latest, quadrant } : null, trail: tail, interpretation };
});