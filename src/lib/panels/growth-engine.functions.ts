/**
 * Growth Engine — Stage 1 read function.
 *
 * Reads registered US Growth indicators from indicator_registry and joins
 * whatever raw observations we've ingested so far. Also surfaces placeholder
 * slots for the Kalman level/slope outputs the Python analytics service
 * will populate.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const RegionCode = z.enum(["US", "UK", "EA"]);
export type GrowthRegion = z.infer<typeof RegionCode>;

export interface GrowthIndicatorRow {
  concept_code: string;
  name: string;
  frequency: string;
  unit: string | null;
  series_code_native: string;
  source: string | null;
  latest_value: number | null;
  latest_date: string | null;
  observation_count: number;
  transform_default: string | null;
  direction: string | null;
}

export interface GrowthEnginePayload {
  region: GrowthRegion;
  regionLabel: string;
  indicators: GrowthIndicatorRow[];
  modelStatus: {
    kalman: { available: boolean; message: string };
    factor: { available: boolean; message: string };
  };
}

export const getGrowthEngine = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ region: RegionCode }).parse(input))
  .handler(async ({ data }): Promise<GrowthEnginePayload> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: region } = await supabaseAdmin
      .from("regions").select("id, name, code").eq("code", data.region).maybeSingle();
    if (!region) throw new Error(`Unknown region ${data.region}`);

    const { data: indicators } = await supabaseAdmin
      .from("indicator_registry")
      .select("id, concept_code, series_code_native, frequency, unit, transform_default, direction, description, source_id")
      .eq("region_id", region.id).eq("engine", "growth").eq("is_active", true)
      .order("concept_code");

    const sourceIds = Array.from(new Set((indicators ?? []).map((i) => i.source_id).filter(Boolean))) as string[];
    const { data: sources } = sourceIds.length
      ? await supabaseAdmin.from("data_sources").select("id, name").in("id", sourceIds)
      : { data: [] as { id: string; name: string }[] };
    const sourceName = new Map((sources ?? []).map((s) => [s.id, s.name]));

    const ids = (indicators ?? []).map((i) => i.id);
    const latestByIndicator = new Map<string, { value: number | null; date: string | null; count: number }>();
    if (ids.length) {
      const { data: obs } = await supabaseAdmin
        .from("v_current_canonical_observations")
        .select("indicator_id, observation_date, value_raw")
        .in("indicator_id", ids)
        .order("observation_date", { ascending: false });
      for (const o of obs ?? []) {
        const entry = latestByIndicator.get(o.indicator_id) ?? { value: null, date: null, count: 0 };
        if (entry.value === null) { entry.value = o.value_raw as number | null; entry.date = o.observation_date as string; }
        entry.count += 1;
        latestByIndicator.set(o.indicator_id, entry);
      }
    }

    // Fallback for US indicators: FRED data is already flowing into the
    // legacy data_points table — surface those latest values until the
    // raw_observations backfill lands.
    if (data.region === "US" && ids.length) {
      const codes = (indicators ?? []).map((i) => i.series_code_native);
      try {
        const { data: legacy } = await supabaseAdmin
          .from("data_points")
          .select("series_code, ts, value")
          .in("series_code", codes)
          .order("ts", { ascending: false });
        const bySeries = new Map<string, { value: number; date: string; count: number }>();
        for (const row of legacy ?? []) {
          const entry = bySeries.get(row.series_code as string) ?? { value: 0, date: "", count: 0 };
          if (entry.count === 0) { entry.value = row.value as number; entry.date = (row.ts as string).slice(0, 10); }
          entry.count += 1;
          bySeries.set(row.series_code as string, entry);
        }
        for (const ind of indicators ?? []) {
          const cur = latestByIndicator.get(ind.id);
          if (cur && cur.value !== null) continue;
          const legacyEntry = bySeries.get(ind.series_code_native);
          if (legacyEntry) {
            latestByIndicator.set(ind.id, { value: legacyEntry.value, date: legacyEntry.date, count: legacyEntry.count });
          }
        }
      } catch {
        // no-op — legacy table shape may differ; we degrade to empty state.
      }
    }

    const rows: GrowthIndicatorRow[] = (indicators ?? []).map((i) => {
      const latest = latestByIndicator.get(i.id);
      return {
        concept_code: i.concept_code as string,
        name: (i.description as string) ?? (i.concept_code as string),
        frequency: i.frequency as string,
        unit: (i.unit as string | null) ?? null,
        series_code_native: i.series_code_native as string,
        source: sourceName.get(i.source_id as string) ?? null,
        latest_value: latest?.value ?? null,
        latest_date: latest?.date ?? null,
        observation_count: latest?.count ?? 0,
        transform_default: (i.transform_default as string | null) ?? null,
        direction: (i.direction as string | null) ?? null,
      };
    });

    return {
      region: data.region,
      regionLabel: region.name as string,
      indicators: rows,
      modelStatus: {
        kalman: { available: false, message: "Python analytics service not yet deployed. Kalman level and slope will appear once model_outputs is populated." },
        factor: { available: false, message: "PCA growth factor pending — needs at least 3 indicators with full history." },
      },
    };
  });