import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface MacroPoint {
  date: string;
  value: number;
}
export interface MacroIndicatorSeries {
  id: string;
  concept: string;
  label: string;
  seriesCode: string;
  frequency: string;
  unit: string | null;
  direction: string | null;
  minHistory: number | null;
  history: MacroPoint[];
}

/** Load every current-vintage observation without Supabase's 1,000-row cap. */
export async function loadUsEngineSeries(engine: string): Promise<MacroIndicatorSeries[]> {
  const { data: region } = await supabaseAdmin
    .from("regions")
    .select("id")
    .eq("code", "US")
    .maybeSingle();
  if (!region) throw new Error("US region missing");
  const { data: registry, error } = await supabaseAdmin
    .from("indicator_registry")
    .select("id,concept_code,series_code_native,frequency,unit,direction,description,min_history")
    .eq("region_id", region.id)
    .eq("engine", engine)
    .eq("is_active", true)
    .order("concept_code");
  if (error) throw error;
  const ids = (registry ?? []).map((row) => row.id as string);
  const byId = new Map<string, MacroPoint[]>();
  for (let from = 0; ids.length; from += 1_000) {
    const { data, error: observationsError } = await supabaseAdmin
      .from("raw_observations")
      .select("indicator_id,observation_date,value_raw,retrieved_at")
      .in("indicator_id", ids)
      .order("indicator_id", { ascending: true })
      .order("observation_date", { ascending: true })
      .order("retrieved_at", { ascending: true })
      .range(from, from + 999);
    if (observationsError) throw observationsError;
    for (const row of data ?? []) {
      if (row.value_raw === null) continue;
      const id = row.indicator_id as string;
      const date = (row.observation_date as string).slice(0, 10);
      const points = byId.get(id) ?? [];
      const last = points.at(-1);
      if (last?.date === date) last.value = Number(row.value_raw);
      else points.push({ date, value: Number(row.value_raw) });
      byId.set(id, points);
    }
    if ((data?.length ?? 0) < 1_000) break;
  }
  return (registry ?? []).map((row) => ({
    id: row.id as string,
    concept: row.concept_code as string,
    label: (row.description as string | null) ?? (row.concept_code as string),
    seriesCode: row.series_code_native as string,
    frequency: row.frequency as string,
    unit: (row.unit as string | null) ?? null,
    direction: (row.direction as string | null) ?? null,
    minHistory: (row.min_history as number | null) ?? null,
    history: byId.get(row.id as string) ?? [],
  }));
}
