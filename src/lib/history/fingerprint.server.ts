/**
 * Deterministic macro fingerprint. Reads current values from `data_points`
 * for a small fixed set of series and buckets each dimension into a discrete
 * label. Same dimensions & labels used by every seeded historical event so
 * the analog matcher is a straight Hamming/L1 comparison.
 */
export type RateLevel = "low" | "mid" | "high";
export type Direction = "rising" | "falling" | "stable";
export type Curve = "inverted" | "flat" | "steep";
export type Inflation = "low" | "moderate" | "high";
export type Oil = "low" | "normal" | "elevated" | "spike";

export interface Fingerprint {
  rate_level: RateLevel;
  rate_direction: Direction;
  curve: Curve;
  inflation: Inflation;
  oil: Oil;
  unemployment_dir: Direction;
}

export interface FingerprintDetail {
  fingerprint: Partial<Fingerprint>;
  inputs: Record<string, number | null>;
  asOf: Record<string, string | null>;
  coverage: number; // 0..1 fraction of dimensions populated
}

export const FINGERPRINT_VERSION = "history.fingerprint.v0.1";

export async function computeCurrentFingerprint(): Promise<FingerprintDetail> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const codes = ["US_10Y", "US_T10Y2Y", "US_CPI", "US_UNRATE"];
  const { data: inds } = await supabaseAdmin
    .from("economic_indicators").select("id, code").in("code", codes);
  const idByCode = new Map((inds ?? []).map((i) => [i.code as string, i.id as string]));

  const ids = [...idByCode.values()];
  const { data: points } = ids.length
    ? await supabaseAdmin.from("data_points")
        .select("subject_id, metric_code, value_num, as_of")
        .in("subject_id", ids).order("as_of", { ascending: true }).limit(4000)
    : { data: [] as Array<{ subject_id: string; metric_code: string; value_num: number | null; as_of: string }> };

  const seriesByCode = new Map<string, Array<{ asOf: string; value: number }>>();
  const codeById = new Map([...idByCode.entries()].map(([c, id]) => [id, c]));
  for (const p of points ?? []) {
    if (p.value_num == null) continue;
    const code = codeById.get(p.subject_id as string);
    if (!code) continue;
    const arr = seriesByCode.get(code) ?? [];
    arr.push({ asOf: p.as_of as string, value: Number(p.value_num) });
    seriesByCode.set(code, arr);
  }

  // Commodity: WTI
  const { data: wti } = await supabaseAdmin.from("commodities")
    .select("id, code").eq("code", "WTI").maybeSingle();
  let wtiSeries: Array<{ asOf: string; value: number }> = [];
  if (wti) {
    const { data: cp } = await supabaseAdmin.from("commodity_prices")
      .select("as_of, close").eq("commodity_id", wti.id)
      .order("as_of", { ascending: true }).limit(400);
    wtiSeries = (cp ?? []).map((r) => ({ asOf: r.as_of as string, value: Number(r.close) }));
  }

  const last = (s?: Array<{ asOf: string; value: number }>) => s && s.length ? s[s.length - 1] : undefined;
  const nBack = (s: Array<{ asOf: string; value: number }> | undefined, n: number) =>
    s && s.length > n ? s[s.length - 1 - n] : undefined;

  const ten = last(seriesByCode.get("US_10Y"));
  const tenPrev = nBack(seriesByCode.get("US_10Y"), 130); // ~6mo of business days
  const spread = last(seriesByCode.get("US_T10Y2Y"));
  const cpiSeries = seriesByCode.get("US_CPI") ?? [];
  const cpiLast = last(cpiSeries);
  const cpiYoy = cpiSeries.length >= 13 ? cpiSeries[cpiSeries.length - 13] : undefined;
  const un = last(seriesByCode.get("US_UNRATE"));
  const unPrev = nBack(seriesByCode.get("US_UNRATE"), 6); // 6 monthly prints back
  const wtiLast = last(wtiSeries);
  const wtiAvg = wtiSeries.length >= 120
    ? wtiSeries.slice(-120).reduce((s, p) => s + p.value, 0) / 120
    : undefined;

  const fp: Partial<Fingerprint> = {};
  const inputs: Record<string, number | null> = {};
  const asOf: Record<string, string | null> = {};

  if (ten) {
    inputs.rate_10y = ten.value; asOf.rate_10y = ten.asOf;
    fp.rate_level = ten.value < 2 ? "low" : ten.value <= 4 ? "mid" : "high";
  }
  if (ten && tenPrev) {
    const d = ten.value - tenPrev.value;
    fp.rate_direction = d > 0.5 ? "rising" : d < -0.5 ? "falling" : "stable";
    inputs.rate_6m_change = d;
  }
  if (spread) {
    inputs.spread = spread.value; asOf.spread = spread.asOf;
    fp.curve = spread.value < 0 ? "inverted" : spread.value < 0.5 ? "flat" : "steep";
  }
  if (cpiLast && cpiYoy) {
    const yoy = ((cpiLast.value - cpiYoy.value) / cpiYoy.value) * 100;
    inputs.cpi_yoy_pct = yoy; asOf.cpi = cpiLast.asOf;
    fp.inflation = yoy < 2 ? "low" : yoy <= 3.5 ? "moderate" : "high";
  }
  if (un && unPrev) {
    const d = un.value - unPrev.value;
    inputs.unrate = un.value; inputs.unrate_6m_change = d; asOf.unrate = un.asOf;
    fp.unemployment_dir = d > 0.2 ? "rising" : d < -0.2 ? "falling" : "stable";
  }
  if (wtiLast && wtiAvg) {
    inputs.wti = wtiLast.value; inputs.wti_120d_avg = wtiAvg; asOf.wti = wtiLast.asOf;
    const r = wtiLast.value / wtiAvg;
    fp.oil = r > 1.4 ? "spike" : r > 1.1 ? "elevated" : r < 0.8 ? "low" : "normal";
  }

  const dims: (keyof Fingerprint)[] = ["rate_level","rate_direction","curve","inflation","oil","unemployment_dir"];
  const coverage = dims.filter((d) => fp[d] != null).length / dims.length;

  return { fingerprint: fp, inputs, asOf, coverage };
}