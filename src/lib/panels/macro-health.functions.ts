import { createServerFn } from "@tanstack/react-start";

const ENGINES = ["growth", "inflation", "liquidity", "labour", "market"] as const;
const MODEL_LABELS: Record<string, string> = {
  "growth_engine.us.kalman_llt": "Growth noise-filtered trend",
  "inflation_engine.us.kalman_llt": "Inflation noise-filtered trend",
  "labour_engine.us.kalman_llt": "Labour noise-filtered trend",
  "market_regime.us.pipeline": "Market and regime experimental comparison",
};

export interface MacroHealthEngine {
  engine: string;
  registered: number;
  withData: number;
  eligible: number;
  fresh: number;
  coveragePct: number;
  historyPct: number;
  freshnessPct: number;
  reliabilityPct: number;
  latestObservation: string | null;
}

export interface MacroHealthModel {
  key: string;
  label: string;
  status: string;
  version: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface MacroHealthPayload {
  computedAt: string;
  overallReliability: number;
  engines: MacroHealthEngine[];
  models: MacroHealthModel[];
  explanation: string;
}

interface ModelRunRow {
  model_key: string;
  model_version: string | null;
  status: string;
  started_at: string;
  finished_at: string | null;
}

export const getMacroHealth = createServerFn({ method: "GET" }).handler(
  async (): Promise<MacroHealthPayload> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: region } = await supabaseAdmin
      .from("regions")
      .select("id")
      .eq("code", "US")
      .maybeSingle();
    if (!region) {
      return {
        computedAt: new Date().toISOString(),
        overallReliability: 0,
        engines: [],
        models: [],
        explanation: "The US macro region is not configured.",
      };
    }

    const [{ data: registry }, { data: modelRuns }] = await Promise.all([
      supabaseAdmin
        .from("indicator_registry")
        .select("id, engine, frequency, min_history")
        .eq("region_id", region.id)
        .in("engine", [...ENGINES])
        .eq("is_active", true),
      supabaseAdmin
        .from("model_runs")
        .select("model_key, model_version, status, started_at, finished_at")
        .in("model_key", Object.keys(MODEL_LABELS))
        .order("started_at", { ascending: false })
        .limit(50),
    ]);

    const now = Date.now();
    const indicators = await Promise.all(
      (registry ?? []).map(async (indicator) => {
        const [{ count }, { data: latest }] = await Promise.all([
          supabaseAdmin
            .from("raw_observations")
            .select("id", { count: "exact", head: true })
            .eq("indicator_id", indicator.id),
          supabaseAdmin
            .from("raw_observations")
            .select("observation_date")
            .eq("indicator_id", indicator.id)
            .order("observation_date", { ascending: false })
            .limit(1),
        ]);
        const observationCount = count ?? 0;
        const latestDate =
          (latest?.[0]?.observation_date as string | undefined)?.slice(0, 10) ?? null;
        const ageDays = latestDate
          ? Math.max(0, (now - new Date(`${latestDate}T00:00:00Z`).getTime()) / 86_400_000)
          : Number.POSITIVE_INFINITY;
        const maxAge = freshnessWindow(String(indicator.frequency));
        const minHistory = Number(indicator.min_history ?? 0);
        return {
          engine: String(indicator.engine),
          observationCount,
          latestDate,
          eligible: observationCount > 0 && (minHistory === 0 || observationCount >= minHistory),
          fresh: ageDays <= maxAge,
        };
      }),
    );

    const engines = ENGINES.map((engine): MacroHealthEngine => {
      const rows = indicators.filter((indicator) => indicator.engine === engine);
      const registered = rows.length;
      const withData = rows.filter((row) => row.observationCount > 0).length;
      const eligible = rows.filter((row) => row.eligible).length;
      const fresh = rows.filter((row) => row.fresh).length;
      const coveragePct = ratio(withData, registered);
      const historyPct = ratio(eligible, registered);
      const freshnessPct = ratio(fresh, registered);
      const reliabilityPct = coveragePct * 0.45 + historyPct * 0.25 + freshnessPct * 0.3;
      return {
        engine,
        registered,
        withData,
        eligible,
        fresh,
        coveragePct,
        historyPct,
        freshnessPct,
        reliabilityPct,
        latestObservation:
          rows
            .map((row) => row.latestDate)
            .filter((value): value is string => Boolean(value))
            .sort()
            .at(-1) ?? null,
      };
    });

    const latestByKey = new Map<string, ModelRunRow>();
    for (const run of (modelRuns ?? []) as ModelRunRow[]) {
      const key = String(run.model_key);
      if (!latestByKey.has(key)) latestByKey.set(key, run);
    }
    const models: MacroHealthModel[] = [...latestByKey.entries()].map(([key, run]) => ({
      key,
      label: MODEL_LABELS[key] ?? key,
      status: String(run.status),
      version: (run.model_version as string | null) ?? null,
      startedAt: String(run.started_at),
      finishedAt: (run.finished_at as string | null) ?? null,
    }));
    const engineReliability = engines.length
      ? engines.reduce((sum, engine) => sum + engine.reliabilityPct, 0) / engines.length
      : 0;
    const modelReliability = Object.keys(MODEL_LABELS).length
      ? (Object.keys(MODEL_LABELS).filter((key) => {
          const run = latestByKey.get(key);
          return run?.status === "success" || run?.status === "partial";
        }).length /
          Object.keys(MODEL_LABELS).length) *
        100
      : 100;
    const overallReliability = engineReliability * 0.8 + modelReliability * 0.2;

    return {
      computedAt: new Date().toISOString(),
      overallReliability,
      engines,
      models,
      explanation:
        "Each engine score combines data availability (45%), enough history for its calculation (25%) and release freshness (30%). The overall score gives those engine checks 80% weight and recent successful model runs 20%.",
    };
  },
);

function ratio(value: number, total: number): number {
  return total ? (value / total) * 100 : 0;
}

function freshnessWindow(frequency: string): number {
  const value = frequency.toLowerCase();
  if (value.includes("day")) return 7;
  if (value.includes("week")) return 21;
  if (value.includes("quarter")) return 150;
  if (value.includes("annual") || value.includes("year")) return 430;
  return 60;
}
