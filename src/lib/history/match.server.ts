import { computeCurrentFingerprint, type Fingerprint, type FingerprintDetail } from "./fingerprint.server";

export interface HistoricalEventRow {
  id: string;
  code: string;
  name: string;
  start_date: string;
  end_date: string | null;
  category: string;
  tags: string[];
  summary: string;
  source_url: string | null;
  fingerprint: Partial<Fingerprint>;
}

export interface EventImpactRow {
  id: string;
  event_id: string;
  scope_type: string;
  scope_code: string;
  window_days: number;
  return_pct: number;
  note: string | null;
}

export interface AnalogMatch {
  event: HistoricalEventRow;
  dimsMatched: number;
  dimsCompared: number;
  matchPct: number; // 0..100
  tagsMatched: string[];
  impacts: EventImpactRow[];
}

/** Weights per fingerprint dimension. Rate + inflation dominate. */
const WEIGHTS: Record<keyof Fingerprint, number> = {
  rate_level: 1.2,
  rate_direction: 1.4,
  curve: 1.2,
  inflation: 1.4,
  oil: 1.0,
  unemployment_dir: 0.8,
};

/** Optional partial-credit for adjacent buckets on ordinal dimensions. */
const ORDINAL: Record<string, string[]> = {
  rate_level: ["low", "mid", "high"],
  inflation:  ["low", "moderate", "high"],
  curve:      ["inverted", "flat", "steep"],
  oil:        ["low", "normal", "elevated", "spike"],
};

function dimScore(k: keyof Fingerprint, a: string | undefined, b: string | undefined): number {
  if (a == null || b == null) return 0;
  if (a === b) return 1;
  const ord = ORDINAL[k];
  if (ord) {
    const ia = ord.indexOf(a), ib = ord.indexOf(b);
    if (ia >= 0 && ib >= 0) {
      const dist = Math.abs(ia - ib);
      return dist === 1 ? 0.5 : 0;
    }
  }
  return 0;
}

export interface MatchOptions {
  limit?: number;
  minMatchPct?: number;
  tags?: string[];        // boost analogs that carry these tags
  scopeFilter?: { scope_type: "sector" | "commodity"; scope_code: string };
}

export interface MatchResult {
  fingerprint: FingerprintDetail;
  analogs: AnalogMatch[];
  computedAt: string;
}

export async function findAnalogs(opts: MatchOptions = {}): Promise<MatchResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [current, { data: events }, { data: impacts }] = await Promise.all([
    computeCurrentFingerprint(),
    supabaseAdmin.from("historical_events").select("*"),
    supabaseAdmin.from("event_impacts").select("*"),
  ]);

  const impactsByEvent = new Map<string, EventImpactRow[]>();
  for (const im of (impacts ?? []) as EventImpactRow[]) {
    const arr = impactsByEvent.get(im.event_id) ?? [];
    arr.push(im);
    impactsByEvent.set(im.event_id, arr);
  }

  const fp = current.fingerprint;
  const dimKeys: (keyof Fingerprint)[] = ["rate_level","rate_direction","curve","inflation","oil","unemployment_dir"];

  const scored: AnalogMatch[] = ((events ?? []) as HistoricalEventRow[]).map((e) => {
    let weightSum = 0, gotSum = 0, matched = 0, compared = 0;
    const eFp = e.fingerprint ?? {};
    for (const k of dimKeys) {
      const cur = fp[k]; const ev = eFp[k];
      if (cur == null || ev == null) continue;
      compared += 1;
      const s = dimScore(k, cur, ev);
      if (s === 1) matched += 1;
      weightSum += WEIGHTS[k];
      gotSum += s * WEIGHTS[k];
    }
    let pct = weightSum > 0 ? (gotSum / weightSum) * 100 : 0;
    const tagsMatched = (opts.tags ?? []).filter((t) => (e.tags ?? []).includes(t));
    if (tagsMatched.length > 0) pct = Math.min(100, pct + tagsMatched.length * 5);
    let impactsForEvent = impactsByEvent.get(e.id) ?? [];
    if (opts.scopeFilter) {
      impactsForEvent = impactsForEvent.filter(
        (im) => im.scope_type === opts.scopeFilter!.scope_type && im.scope_code === opts.scopeFilter!.scope_code,
      );
    }
    return { event: e, dimsMatched: matched, dimsCompared: compared, matchPct: pct, tagsMatched, impacts: impactsForEvent };
  });

  let filtered = scored.filter((a) => a.matchPct >= (opts.minMatchPct ?? 40));
  if (opts.scopeFilter) filtered = filtered.filter((a) => a.impacts.length > 0);
  filtered.sort((a, b) => b.matchPct - a.matchPct);
  const limit = opts.limit ?? 5;

  return { fingerprint: current, analogs: filtered.slice(0, limit), computedAt: new Date().toISOString() };
}

/** Formatted one-line historical parallel bullet for a sector. Returns null if no strong analog. */
export async function historicalParallelBullet(scopeType: "sector" | "commodity", scopeCode: string, kind: "under" | "over"): Promise<string | null> {
  const { analogs } = await findAnalogs({ scopeFilter: { scope_type: scopeType, scope_code: scopeCode }, minMatchPct: 50, limit: 3 });
  if (analogs.length === 0) return null;
  const relevant = analogs.map((a) => {
    const imp = a.impacts[0];
    return { name: a.event.name, pct: imp.return_pct, window: imp.window_days, matchPct: a.matchPct };
  });
  const bestFit = relevant[0];
  const sameDir = kind === "under" ? relevant.filter((r) => r.pct > 0) : relevant.filter((r) => r.pct < 0);
  const pool = sameDir.length > 0 ? sameDir : relevant;
  const median = pool.map((r) => r.pct).sort((a, b) => a - b)[Math.floor(pool.length / 2)];
  return `Historical parallel — similar macro setup in ${bestFit.name} (${bestFit.matchPct.toFixed(0)}% fingerprint match); median ${bestFit.window}-day forward return for the sector was ${median > 0 ? "+" : ""}${median.toFixed(0)}% across ${pool.length} analog${pool.length === 1 ? "" : "s"}.`;
}