import { createServerFn } from "@tanstack/react-start";
import { computeConfidence } from "@/lib/reliability/confidence";
import { stampCalculation } from "@/lib/reliability/version";
import type { PanelData, Evidence, Point, VerifyCheck, Metric } from "./contract";
import { findAnalogs } from "@/lib/history/match.server";
import { FINGERPRINT_VERSION } from "@/lib/history/fingerprint.server";
import { aiCoherenceCheck } from "./undervaluation.functions";

/**
 * Historical Event Engine panels — one regime-analog panel plus one panel per
 * seeded event category so the whole library is browsable in the compact grid.
 */
export const getHistoryPanels = createServerFn({ method: "GET" }).handler(async (): Promise<PanelData[]> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [{ analogs, fingerprint, computedAt }, { data: events }] = await Promise.all([
    findAnalogs({ limit: 6, minMatchPct: 40 }),
    supabaseAdmin.from("historical_events").select("id, code, name, start_date, category, tags, causes, what_happened_next, key_takeaway, narrative_status, narrative_confidence"),
  ]);

  // index narrative by code so we can enrich analog cards
  const narrativeByCode = new Map<string, { causes: string | null; what_happened_next: string | null; key_takeaway: string | null; narrative_status: string; narrative_confidence: number | null }>();
  for (const e of events ?? []) {
    narrativeByCode.set(e.code as string, {
      causes: (e as { causes: string | null }).causes,
      what_happened_next: (e as { what_happened_next: string | null }).what_happened_next,
      key_takeaway: (e as { key_takeaway: string | null }).key_takeaway,
      narrative_status: ((e as { narrative_status: string }).narrative_status) ?? "unverified",
      narrative_confidence: ((e as { narrative_confidence: number | null }).narrative_confidence) ?? null,
    });
  }

  const nowIso = new Date().toISOString();

  // ---------- Regime analog panel ----------
  const fpMetrics: Metric[] = [
    ...(fingerprint.fingerprint.rate_level    ? [{ label: "Rates",       value: `${fingerprint.fingerprint.rate_level} · ${fingerprint.fingerprint.rate_direction ?? "?"}` } as Metric] : []),
    ...(fingerprint.fingerprint.curve         ? [{ label: "Curve",       value: fingerprint.fingerprint.curve } as Metric] : []),
    ...(fingerprint.fingerprint.inflation     ? [{ label: "Inflation",   value: fingerprint.fingerprint.inflation } as Metric] : []),
    ...(fingerprint.fingerprint.oil           ? [{ label: "Oil regime",  value: fingerprint.fingerprint.oil } as Metric] : []),
    ...(fingerprint.fingerprint.unemployment_dir ? [{ label: "Unemployment", value: fingerprint.fingerprint.unemployment_dir } as Metric] : []),
    { label: "Coverage", value: `${(fingerprint.coverage * 100).toFixed(0)}%`, tone: fingerprint.coverage >= 0.66 ? "positive" : "warning" },
  ];

  const positives: Point[] = analogs.slice(0, 5).map((a) => {
    const n = narrativeByCode.get(a.event.code);
    const yr = new Date(a.event.start_date).getFullYear();
    const badge = n?.narrative_status === "verified" ? "✓ AI-verified"
                : n?.narrative_status === "needs_review" ? "⚠ Needs review"
                : "· Unverified narrative";
    const cause = n?.causes ? `Cause: ${n.causes}` : "";
    const next  = n?.what_happened_next ? `What happened next: ${n.what_happened_next}` : "";
    const detail = [
      `${yr} · ${a.event.category} · ${a.dimsMatched}/${a.dimsCompared} dims matched · ${badge}`,
      cause, next,
      `→ open /history/${a.event.code} for citations + forward returns`,
    ].filter(Boolean).join("\n");
    return {
      id: `an-${a.event.code}`,
      label: `${a.event.name} — ${a.matchPct.toFixed(0)}% match`,
      detail,
    };
  });

  const evidence: Evidence[] = [{
    id: "ev-fp", label: `Macro fingerprint (${(fingerprint.coverage * 100).toFixed(0)}% coverage)`,
    sourceName: "FRED + commodity pool", tier: "tier1_official",
    asOf: nowIso, freshness: "fresh", agrees: true,
  }];

  const algoCoverage: VerifyCheck = {
    id: "v-analog-coverage", label: "≥3 analogs above 50% match", verifier: "algo",
    status: analogs.filter((a) => a.matchPct >= 50).length >= 3 ? "pass"
          : fingerprint.coverage < 0.5 ? "unavailable" : "fail",
    detail: `${analogs.length} analogs total, ${analogs.filter((a) => a.matchPct >= 50).length} above 50% match`,
    checkedAt: nowIso,
  };
  const algoFp: VerifyCheck = {
    id: "v-fp-coverage", label: "Fingerprint covers ≥4/6 dimensions", verifier: "algo",
    status: fingerprint.coverage >= 4 / 6 ? "pass" : "fail",
    detail: `${Math.round(fingerprint.coverage * 6)}/6 dimensions populated`,
    checkedAt: nowIso,
  };
  const verifyNext: VerifyCheck[] = [algoCoverage, algoFp, aiCoherenceCheck([algoCoverage, algoFp], `${analogs.length} analog candidates`)];

  const regime: PanelData = {
    id: "hist-regime",
    title: "Current regime — analog library match",
    purpose: "Deterministic macro fingerprint of today's environment matched against the seeded event library.",
    metrics: fpMetrics,
    whatChanged: analogs.length > 0
      ? `Top match: ${analogs[0].event.name} (${analogs[0].matchPct.toFixed(0)}%). ${analogs.length} analogs above the threshold.`
      : "No analogs above the 40% match floor — fingerprint may be too sparse to compare.",
    whyItMatters: "History does not repeat, but rate/inflation/oil regimes recur. Analogs answer 'when did we last see this, and what happened next?' with an auditable evidence chain.",
    whyBullets: [
      analogs[0] ? `Closest analog: ${analogs[0].event.name} (${analogs[0].matchPct.toFixed(0)}% fingerprint match).` : "No strong analog — either the fingerprint is thin or the current regime is genuinely novel.",
      analogs[0] && narrativeByCode.get(analogs[0].event.code)?.what_happened_next
        ? `Last time (${new Date(analogs[0].event.start_date).getFullYear()}): ${narrativeByCode.get(analogs[0].event.code)!.what_happened_next}`
        : "Open the closest analog for the sourced narrative and forward returns.",
      "How to read the metrics: hover any dimension for its plain-English meaning. Rate direction and inflation regime carry the highest weight — they're the strongest cross-cycle signals.",
      `Fingerprint coverage ${(fingerprint.coverage * 100).toFixed(0)}% — thicker coverage = higher-confidence match.`,
      `Narratives verified by algo (structure + citation allowlist) → API (link liveness) → AI (coherence). If AI can't verify, the loop rewrites the narrative grounded in the citations and re-checks (max 2 passes) before marking 'needs review'.`,
    ].filter(Boolean) as string[],
    evidence, positives, deductions: [], verifyNext,
    confidence: computeConfidence({ tier: "tier1_official", category: "macro_release", ageSeconds: 0 }),
    calculation: {
      formula: "match = Σ dim_weight × dim_score / Σ dim_weight, ordinal partial-credit 0.5, tag boost +5% per tag",
      ...stampCalculation(FINGERPRINT_VERSION, { coverage: fingerprint.coverage }),
      inputs: fingerprint.inputs,
    },
  };

  // ---------- Category browser panels (one per category) ----------
  const byCat = new Map<string, Array<{ code: string; name: string; start_date: string; tags: string[] }>>();
  for (const e of events ?? []) {
    const cat = e.category as string;
    const arr = byCat.get(cat) ?? [];
    arr.push({ code: e.code as string, name: e.name as string, start_date: e.start_date as string, tags: (e.tags as string[]) ?? [] });
    byCat.set(cat, arr);
  }
  const catPanels: PanelData[] = [...byCat.entries()].sort().map(([cat, list]) => {
    list.sort((a, b) => b.start_date.localeCompare(a.start_date));
    return {
      id: `hist-cat-${cat}`,
      title: `${cat.replace(/_/g, " ")} events (${list.length})`,
      purpose: `Seeded ${cat.replace(/_/g, " ")} episodes in the event library, most recent first.`,
      metrics: [{ label: "Events", value: `${list.length}` }, { label: "Latest", value: new Date(list[0].start_date).getFullYear().toString() }],
      whatChanged: `${list.length} episodes indexed in this category.`,
      whyItMatters: "Browse the library directly when you want to research a class of regimes rather than the current fingerprint.",
      evidence: [], positives: list.map((e) => ({
        id: e.code, label: `${new Date(e.start_date).getFullYear()} — ${e.name}`,
        detail: e.tags.join(", "),
      })), deductions: [],
      verifyNext: [{ id: "v-manual", label: "Open the event card for evidence and impacts", verifier: "manual", status: "pending" }],
      confidence: computeConfidence({ tier: "tier3_reputable", category: "news", ageSeconds: 0 }),
    };
  });

  return [regime, ...catPanels];
});

/** Full detail for a single event — used by /history/$eventId. */
export const getEventDetail = createServerFn({ method: "GET" })
  .inputValidator((data: { code: string }) => data)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: event } = await supabaseAdmin
      .from("historical_events").select("*").eq("code", data.code).maybeSingle();
    if (!event) return { event: null, impacts: [] as Array<{ scope_type: string; scope_code: string; window_days: number; return_pct: number; note: string | null }> };
    const { data: impacts } = await supabaseAdmin
      .from("event_impacts").select("scope_type, scope_code, window_days, return_pct, note")
      .eq("event_id", event.id).order("scope_type", { ascending: true }).order("return_pct", { ascending: false });
    return { event, impacts: impacts ?? [] };
  });