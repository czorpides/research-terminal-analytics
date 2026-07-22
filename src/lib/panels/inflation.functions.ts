/**
 * US Inflation Engine read functions.
 *
 * Panels expose deterministic transforms and Kalman outputs. The pressure
 * score uses family caps plus separate level, direction and acceleration
 * signals. The Growth × Inflation map uses a dimensionless, direction-adjusted
 * growth composite rather than averaging raw slopes measured in mixed units.
 */
import { createServerFn } from "@tanstack/react-start";
import { runTransforms, latestOf, TRANSFORM_FRAMEWORK_VERSION } from "@/lib/transforms/runner";
import type { Frequency, SeriesPoint, TransformName, TransformResult } from "@/lib/transforms/types";
import { zoneForTarget } from "@/lib/transforms/directionality";
import {
  COMPONENTS,
  scoreInflationPressure,
  scoreInflationPressureSnapshot,
  type PressureInput,
  type PressureKey,
} from "@/lib/scoring/inflation-pressure.server";
import {
  buildGrowthComposite,
  GROWTH_COMPOSITE_VERSION,
  type GrowthCompositeContribution,
} from "@/lib/scoring/growth-composite.server";

async function paginate<T>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  for (let i = 0; i < 200; i++) {
    const { data, error } = await Promise.resolve(build(from, from + pageSize - 1));
    if (error) throw error as Error;
    const rows = ((data ?? []) as unknown) as T[];
    out.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

function nonNullPoints(result: TransformResult | undefined): Array<{ date: string; value: number }> {
  return (result?.points ?? [])
    .filter((point): point is SeriesPoint & { value: number } => point.value != null && Number.isFinite(point.value))
    .map((point) => ({ date: point.date, value: point.value }));
}

interface RateDynamicPoint {
  date: string;
  value: number;
  trend3m: number | null;
  acceleration3m: number | null;
}

function monthlyLast(points: Array<{ date: string; value: number }>): Array<{ date: string; value: number }> {
  const byMonth = new Map<string, { date: string; value: number }>();
  for (const point of points) {
    const month = point.date.slice(0, 7);
    const current = byMonth.get(month);
    if (!current || point.date.localeCompare(current.date) >= 0) byMonth.set(month, point);
  }
  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, point]) => ({ date: `${month}-01`, value: point.value }));
}

function rateDynamics(points: Array<{ date: string; value: number }>): RateDynamicPoint[] {
  const monthly = monthlyLast(points);
  return monthly.map((point, index) => {
    const lag3 = index >= 3 ? monthly[index - 3].value : null;
    const lag6 = index >= 6 ? monthly[index - 6].value : null;
    const trend3m = lag3 == null ? null : point.value - lag3;
    const previousTrend3m = lag3 == null || lag6 == null ? null : lag3 - lag6;
    return {
      date: point.date,
      value: point.value,
      trend3m,
      acceleration3m: trend3m == null || previousTrend3m == null ? null : trend3m - previousTrend3m,
    };
  });
}

function rateSeriesForScoring(
  rawSeries: SeriesPoint[],
  byName: Map<TransformName, TransformResult>,
  target: { unit?: string } | null,
  unit: string | null,
): Array<{ date: string; value: number }> {
  if (target?.unit === "yoy_pct") {
    const yoy = nonNullPoints(byName.get("yoy"));
    if (yoy.length) return yoy;
    if (unit === "yoy_pct") {
      return rawSeries
        .filter((point): point is SeriesPoint & { value: number } => point.value != null && Number.isFinite(point.value))
        .map((point) => ({ date: point.date, value: point.value }));
    }
    return [];
  }
  return rawSeries
    .filter((point): point is SeriesPoint & { value: number } => point.value != null && Number.isFinite(point.value))
    .map((point) => ({ date: point.date, value: point.value }));
}

interface IndicatorRegistryRow {
  id: string;
  concept_code: string;
  series_code_native: string;
  frequency: string | null;
  unit: string | null;
  description: string | null;
  allowed_transformations: string[] | null;
  target_range: InflationIndicatorPanel["target"] | null;
  vintage_quality: string | null;
}

interface MapGrowthIndicatorRow { id: string; concept_code: string }
interface MapInflationIndicatorRow { id: string; concept_code: string; target_range: { band?: [number, number] } | null }

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
    mom: number | null;
    yoy: number | null;
    chg3mAnn: number | null;
    chg6mAnn: number | null;
    momentum: number | null;
    acceleration: number | null;
    zscoreHistorical: number | null;
    percentileHistorical: number | null;
    referenceRate: number | null;
    trend3m: number | null;
    acceleration3m: number | null;
    distanceFromTarget: number | null;
  };
  kalman: { level: number | null; slope: number | null; ci_low: number | null; ci_high: number | null; date: string | null } | null;
  zone: "green" | "yellow" | "red" | "gray";
  history: Array<{ date: string; value: number | null }>;
  calcVersion: string;
  inputsHash: string | null;
}

export interface InflationCalibrationPoint {
  date: string;
  score: number;
  directionScore: number;
  breadthScore: number;
  confidence: number;
}

export interface InflationEnginePayload {
  indicators: InflationIndicatorPanel[];
  pressure: ReturnType<typeof scoreInflationPressure>;
  latestRun: { id: string; status: string; started_at: string; finished_at: string | null; model_version: string } | null;
  frameworkVersion: string;
  breadth: { above_target: number; on_target: number; below_target: number; unknown: number };
  calibration: {
    history: InflationCalibrationPoint[];
    summary: { min: number | null; max: number | null; median: number | null; current: number | null };
    referencePeriods: Array<{ label: string; requestedDate: string; matchedDate: string | null; score: number | null }>;
    note: string;
  };
}

export const getInflationEngine = createServerFn({ method: "GET" }).handler(async (): Promise<InflationEnginePayload> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: region } = await supabaseAdmin.from("regions").select("id").eq("code", "US").maybeSingle();
  if (!region) throw new Error("US region missing");

  const { data: rawIndicators } = await supabaseAdmin
    .from("indicator_registry")
    .select("id, concept_code, series_code_native, frequency, unit, description, allowed_transformations, target_range, vintage_quality")
    .eq("region_id", region.id).eq("engine", "inflation").eq("is_active", true);

  const indicators = (rawIndicators ?? []) as IndicatorRegistryRow[];
  const ids = indicators.map((indicator) => indicator.id as string);

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
    for (const observation of rows) {
      const indicatorId = observation.indicator_id;
      const date = observation.observation_date.slice(0, 10);
      const value = observation.value_raw == null ? null : Number(observation.value_raw);
      const history = historyByIndicator.get(indicatorId) ?? [];
      const last = history[history.length - 1];
      if (last && last.date === date) {
        last.value = value;
        last.retrieved_at = observation.retrieved_at;
        last.meta = observation.meta;
        if (observation.meta?.revision) {
          revisionsByIndicator.set(indicatorId, {
            observation_date: date,
            previous_value: observation.meta?.previous_value ?? null,
            revised_value: value ?? 0,
            revised_at: observation.retrieved_at,
          });
        }
      } else {
        history.push({ date, value, retrieved_at: observation.retrieved_at, meta: observation.meta });
        historyByIndicator.set(indicatorId, history);
      }
    }
  }

  const kalmanByIndicator = new Map<string, { level: number | null; slope: number | null; ci_low: number | null; ci_high: number | null; date: string | null }>();
  if (ids.length) {
    const outputs = await paginate<{ indicator_id: string; ts: string; output_type: string; value: unknown }>(
      (from, to) => supabaseAdmin
        .from("model_outputs")
        .select("indicator_id, ts, output_type, value")
        .eq("model_key", "inflation_engine.us.kalman_llt")
        .in("indicator_id", ids)
        .order("ts", { ascending: true })
        .range(from, to),
    );
    const grouped = new Map<string, Map<string, { level?: number; slope?: number; lo?: number; hi?: number }>>();
    for (const output of outputs) {
      const date = output.ts.slice(0, 10);
      const byDate = grouped.get(output.indicator_id) ?? new Map();
      const row = byDate.get(date) ?? {};
      const value = output.value == null ? undefined : Number(output.value);
      if (output.output_type === "kalman_level") row.level = value;
      else if (output.output_type === "kalman_slope") row.slope = value;
      else if (output.output_type === "kalman_level_ci_low") row.lo = value;
      else if (output.output_type === "kalman_level_ci_high") row.hi = value;
      byDate.set(date, row);
      grouped.set(output.indicator_id, byDate);
    }
    for (const [indicatorId, byDate] of grouped) {
      const sorted = Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b));
      const [date, latest] = sorted[sorted.length - 1] ?? [null, {}];
      kalmanByIndicator.set(indicatorId, {
        level: latest?.level ?? null,
        slope: latest?.slope ?? null,
        ci_low: latest?.lo ?? null,
        ci_high: latest?.hi ?? null,
        date,
      });
    }
  }

  const scoreHistoryByConcept = new Map<string, RateDynamicPoint[]>();
  const panels: InflationIndicatorPanel[] = indicators.map((indicator) => {
    const history = historyByIndicator.get(indicator.id as string) ?? [];
    const series: SeriesPoint[] = history.map((point) => ({ date: point.date, value: point.value }));
    const allowed = ((indicator.allowed_transformations as string[] | null) ?? []) as TransformName[];
    const frequency = ((indicator.frequency as string) ?? "monthly") as Frequency;
    const target = (indicator.target_range as InflationIndicatorPanel["target"]) ?? null;
    const unit = (indicator.unit as string | null) ?? null;

    const results = runTransforms({ series, allowed, frequency });
    const byName = new Map(results.map((result) => [result.name, result]));
    const withValue = series.filter((point): point is SeriesPoint & { value: number } => point.value != null);
    const latest = withValue[withValue.length - 1] ?? null;
    const previous = withValue[withValue.length - 2] ?? null;
    const yoy = latestOf(byName.get("yoy"));
    const dynamics = rateDynamics(rateSeriesForScoring(series, byName, target, unit));
    scoreHistoryByConcept.set(indicator.concept_code as string, dynamics);
    const latestDynamic = dynamics[dynamics.length - 1] ?? null;
    const referenceRate = latestDynamic?.value ?? null;
    const zone = target ? zoneForTarget(referenceRate, target as any) : "gray" as const;

    return {
      concept_code: indicator.concept_code as string,
      label: (indicator.description as string) ?? (indicator.concept_code as string),
      frequency,
      unit,
      series_code_native: indicator.series_code_native as string,
      target,
      vintage_quality: (indicator.vintage_quality as string | null) ?? null,
      latest_value: latest?.value ?? null,
      latest_date: latest?.date ?? null,
      previous_value: previous?.value ?? null,
      previous_date: previous?.date ?? null,
      latest_revision: revisionsByIndicator.get(indicator.id as string) ?? null,
      metrics: {
        mom: latestOf(byName.get("mom")),
        yoy,
        chg3mAnn: latestOf(byName.get("chg3mAnn")),
        chg6mAnn: latestOf(byName.get("chg6mAnn")),
        momentum: latestOf(byName.get("momentum")),
        acceleration: latestOf(byName.get("acceleration")),
        zscoreHistorical: latestOf(byName.get("zscoreHistorical")),
        percentileHistorical: latestOf(byName.get("percentileHistorical")),
        referenceRate,
        trend3m: latestDynamic?.trend3m ?? null,
        acceleration3m: latestDynamic?.acceleration3m ?? null,
        distanceFromTarget: target && referenceRate != null ? referenceRate - target.value : null,
      },
      kalman: kalmanByIndicator.get(indicator.id as string) ?? null,
      zone,
      history: series.slice(-120),
      calcVersion: TRANSFORM_FRAMEWORK_VERSION,
      inputsHash: results[0]?.inputsHash ?? null,
    };
  });

  let above = 0;
  let on = 0;
  let below = 0;
  let unknown = 0;
  for (const panel of panels) {
    if (panel.metrics.distanceFromTarget == null) { unknown++; continue; }
    const halfBand = panel.target ? Math.max(0.1, (panel.target.band[1] - panel.target.band[0]) / 2) : 0.5;
    if (Math.abs(panel.metrics.distanceFromTarget) <= halfBand) on++;
    else if (panel.metrics.distanceFromTarget > 0) above++;
    else below++;
  }

  const panelByConcept = new Map(panels.map((panel) => [panel.concept_code, panel]));
  const pressureInputs: PressureInput[] = (Object.keys(COMPONENTS) as PressureKey[]).map((key) => {
    const panel = panelByConcept.get(key);
    return {
      key,
      label: panel?.label ?? key,
      metric: panel?.target?.unit === "yoy_pct" ? "YoY %" : (panel?.target?.unit ?? "value"),
      value: panel?.metrics.referenceRate ?? null,
      trend3m: panel?.metrics.trend3m ?? null,
      acceleration3m: panel?.metrics.acceleration3m ?? null,
      target: panel?.target ? { value: panel.target.value, band: panel.target.band } : null,
    };
  });
  const pressure = scoreInflationPressure(pressureInputs);

  const allCalibrationDates = new Set<string>();
  for (const key of Object.keys(COMPONENTS) as PressureKey[]) {
    for (const point of scoreHistoryByConcept.get(key) ?? []) allCalibrationDates.add(point.date);
  }
  const historyLookup = new Map<string, Map<string, RateDynamicPoint>>();
  for (const [concept, points] of scoreHistoryByConcept) {
    historyLookup.set(concept, new Map(points.map((point) => [point.date, point])));
  }

  const calibrationHistory: InflationCalibrationPoint[] = [];
  for (const date of Array.from(allCalibrationDates).sort()) {
    const snapshotInputs: PressureInput[] = (Object.keys(COMPONENTS) as PressureKey[]).map((key) => {
      const panel = panelByConcept.get(key);
      const point = historyLookup.get(key)?.get(date) ?? null;
      return {
        key,
        label: panel?.label ?? key,
        metric: panel?.target?.unit === "yoy_pct" ? "YoY %" : (panel?.target?.unit ?? "value"),
        value: point?.value ?? null,
        trend3m: point?.trend3m ?? null,
        acceleration3m: point?.acceleration3m ?? null,
        target: panel?.target ? { value: panel.target.value, band: panel.target.band } : null,
      };
    });
    const snapshot = scoreInflationPressureSnapshot(snapshotInputs);
    if (snapshot.confidence < 50) continue;
    calibrationHistory.push({ date, ...snapshot });
  }

  const calibrationScores = calibrationHistory.map((point) => point.score).sort((a, b) => a - b);
  const median = calibrationScores.length
    ? calibrationScores.length % 2 === 1
      ? calibrationScores[(calibrationScores.length - 1) / 2]
      : (calibrationScores[calibrationScores.length / 2 - 1] + calibrationScores[calibrationScores.length / 2]) / 2
    : null;
  const referenceDates = [
    { label: "Global financial crisis", requestedDate: "2008-12-01" },
    { label: "Pandemic deflation shock", requestedDate: "2020-05-01" },
    { label: "Recent inflation peak", requestedDate: "2022-06-01" },
  ];
  const referencePeriods = referenceDates.map((reference) => {
    const match = calibrationHistory.reduce<InflationCalibrationPoint | null>((best, point) => {
      const distance = Math.abs(new Date(point.date).getTime() - new Date(reference.requestedDate).getTime());
      if (!best) return point;
      const bestDistance = Math.abs(new Date(best.date).getTime() - new Date(reference.requestedDate).getTime());
      return distance < bestDistance ? point : best;
    }, null);
    return { ...reference, matchedDate: match?.date ?? null, score: match?.score ?? null };
  });

  const { data: runs } = await supabaseAdmin
    .from("model_runs")
    .select("id, status, started_at, finished_at, model_version")
    .eq("model_key", "inflation_engine.us.kalman_llt")
    .order("started_at", { ascending: false }).limit(1);
  const latestRun = runs?.[0]
    ? {
        id: runs[0].id as string,
        status: runs[0].status as string,
        started_at: runs[0].started_at as string,
        finished_at: (runs[0].finished_at as string | null) ?? null,
        model_version: runs[0].model_version as string,
      }
    : null;

  return {
    indicators: panels,
    pressure,
    latestRun,
    frameworkVersion: TRANSFORM_FRAMEWORK_VERSION,
    breadth: { above_target: above, on_target: on, below_target: below, unknown },
    calibration: {
      history: calibrationHistory,
      summary: {
        min: calibrationScores[0] ?? null,
        max: calibrationScores[calibrationScores.length - 1] ?? null,
        median,
        current: calibrationHistory[calibrationHistory.length - 1]?.score ?? null,
      },
      referencePeriods,
      note: "Historical calibration uses the latest available historical snapshot, not verified real-time vintages; it is construction validation rather than a predictive backtest.",
    },
  };
});

export type DirectionalQuadrant =
  | "improving_growth_falling_inflation"
  | "improving_growth_rising_inflation"
  | "weakening_growth_falling_inflation"
  | "weakening_growth_rising_inflation"
  | "unknown";

export interface GrowthInflationPoint {
  date: string;
  growth: number;
  inflation: number;
  inflationLevel: number;
  growthCoverage: number;
}

export interface GrowthInflationMapData {
  latest: (GrowthInflationPoint & {
    directionalQuadrant: DirectionalQuadrant;
    tendency: string;
    confidence: number;
  }) | null;
  trail: GrowthInflationPoint[];
  growthContributions: GrowthCompositeContribution[];
  growthCompositeVersion: string;
  interpretation: string;
}

function levelAwareTendency(
  quadrant: DirectionalQuadrant,
  inflationLevel: number,
  targetBand: [number, number],
): string {
  const [lower, upper] = targetBand;
  if (quadrant === "improving_growth_falling_inflation") {
    if (inflationLevel > upper) return "Disinflationary expansion, moving toward Goldilocks conditions";
    if (inflationLevel < lower) return "Disinflationary expansion with deflation risk";
    return "Goldilocks conditions";
  }
  if (quadrant === "improving_growth_rising_inflation") return "Inflationary expansion";
  if (quadrant === "weakening_growth_falling_inflation") {
    return inflationLevel < lower ? "Deflationary contraction" : "Disinflationary slowdown";
  }
  if (quadrant === "weakening_growth_rising_inflation") return "Stagflationary tendency";
  return "Insufficient evidence";
}

export const getGrowthInflationMap = createServerFn({ method: "GET" }).handler(async (): Promise<GrowthInflationMapData> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: region } = await supabaseAdmin.from("regions").select("id").eq("code", "US").maybeSingle();
  const empty: GrowthInflationMapData = {
    latest: null,
    trail: [],
    growthContributions: [],
    growthCompositeVersion: GROWTH_COMPOSITE_VERSION,
    interpretation: "Insufficient overlapping data to place a tendency on the map.",
  };
  if (!region) return { ...empty, interpretation: "US region missing." };

  const { data: growthIndicators } = await supabaseAdmin
    .from("indicator_registry").select("id, concept_code")
    .eq("region_id", region.id).eq("engine", "growth").eq("is_active", true);
  const { data: inflationIndicators } = await supabaseAdmin
    .from("indicator_registry").select("id, concept_code, target_range")
    .eq("region_id", region.id).eq("engine", "inflation").eq("is_active", true);

  const typedGrowthIndicators = (growthIndicators ?? []) as MapGrowthIndicatorRow[];
  const typedInflationIndicators = (inflationIndicators ?? []) as MapInflationIndicatorRow[];
  const growthIds = typedGrowthIndicators.map((indicator) => indicator.id);
  const conceptById = new Map<string, string>(typedGrowthIndicators.map((indicator) => [indicator.id, indicator.concept_code]));
  const coreCpi = typedInflationIndicators.find((indicator) => indicator.concept_code === "cpi_core");
  if (!growthIds.length || !coreCpi) return { ...empty, interpretation: "Not enough model outputs yet." };

  const growthOutputs = await paginate<{ indicator_id: string; ts: string; value: unknown }>(
    (from, to) => supabaseAdmin
      .from("model_outputs").select("indicator_id, ts, value")
      .eq("model_key", "growth_engine.us.kalman_llt").eq("output_type", "kalman_slope")
      .in("indicator_id", growthIds).order("ts", { ascending: true })
      .range(from, to),
  );
  const slopesByConcept = new Map<string, Array<{ date: string; value: number }>>();
  for (const output of growthOutputs) {
    const concept = conceptById.get(output.indicator_id);
    const value = Number(output.value);
    if (!concept || !Number.isFinite(value)) continue;
    const points = slopesByConcept.get(concept) ?? [];
    points.push({ date: output.ts.slice(0, 10), value });
    slopesByConcept.set(concept, points);
  }
  const growthComposite = buildGrowthComposite(
    Array.from(slopesByConcept.entries()).map(([conceptCode, points]) => ({ conceptCode, points })),
  );

  const rawCpi = await paginate<{ observation_date: string; value_raw: unknown; retrieved_at: string }>(
    (from, to) => supabaseAdmin
      .from("raw_observations").select("observation_date, value_raw, retrieved_at")
      .eq("indicator_id", coreCpi.id).order("observation_date", { ascending: true }).order("retrieved_at", { ascending: true })
      .range(from, to),
  );
  const cpiByDate = new Map<string, number>();
  for (const observation of rawCpi) cpiByDate.set(observation.observation_date.slice(0, 10), Number(observation.value_raw));
  const cpiSorted = Array.from(cpiByDate.entries()).sort(([a], [b]) => a.localeCompare(b));
  const inflationRate: Array<{ date: string; value: number }> = [];
  for (let index = 12; index < cpiSorted.length; index++) {
    const [date, current] = cpiSorted[index];
    const previous = cpiSorted[index - 12][1];
    if (previous > 0) inflationRate.push({ date: `${date.slice(0, 7)}-01`, value: (current / previous - 1) * 100 });
  }
  const inflationDynamics = rateDynamics(inflationRate);
  const inflationByMonth = new Map(inflationDynamics.map((point) => [point.date, point]));

  const trail: GrowthInflationPoint[] = [];
  for (const growth of growthComposite) {
    const inflation = inflationByMonth.get(growth.date);
    if (!inflation || inflation.trend3m == null) continue;
    trail.push({
      date: growth.date,
      growth: growth.value,
      inflation: inflation.trend3m,
      inflationLevel: inflation.value,
      growthCoverage: growth.coverage,
    });
  }

  const tail = trail.slice(-36);
  const latestPoint = tail[tail.length - 1] ?? null;
  const latestGrowth = growthComposite.find((point) => point.date === latestPoint?.date) ?? null;
  if (!latestPoint) return empty;

  const directionalQuadrant: DirectionalQuadrant =
    latestPoint.growth > 0 && latestPoint.inflation < 0 ? "improving_growth_falling_inflation"
      : latestPoint.growth > 0 && latestPoint.inflation >= 0 ? "improving_growth_rising_inflation"
        : latestPoint.growth <= 0 && latestPoint.inflation < 0 ? "weakening_growth_falling_inflation"
          : latestPoint.growth <= 0 && latestPoint.inflation >= 0 ? "weakening_growth_rising_inflation"
            : "unknown";
  const coreTarget = (coreCpi.target_range as { band?: [number, number] } | null)?.band ?? [1.5, 2.5];
  const tendency = levelAwareTendency(directionalQuadrant, latestPoint.inflationLevel, coreTarget);
  const confidence = Math.round(latestPoint.growthCoverage * 1000) / 10;
  const latest = { ...latestPoint, directionalQuadrant, tendency, confidence };
  const interpretation =
    `Macro tendency, not a confirmed regime: the dimensionless growth direction composite is ${latest.growth.toFixed(2)}, `
    + `core CPI changed ${latest.inflation.toFixed(2)} percentage points over three months and stands at ${latest.inflationLevel.toFixed(1)}% YoY. `
    + `This is classified as ${tendency}. Growth-component coverage is ${confidence.toFixed(0)}%.`;

  return {
    latest,
    trail: tail,
    growthContributions: latestGrowth?.contributions ?? [],
    growthCompositeVersion: GROWTH_COMPOSITE_VERSION,
    interpretation,
  };
});
