import { createServerFn } from "@tanstack/react-start";
import { computeConfidence } from "@/lib/reliability/confidence";
import { freshnessState, DEFAULT_FRESHNESS } from "@/lib/reliability/freshness";
import { stampCalculation } from "@/lib/reliability/version";
import type { PanelData, Evidence, Point, VerifyCheck, Metric } from "./contract";

/**
 * Command Centre — synthesis over existing tables. Every panel is a read-only
 * aggregation. No new scoring math, no AI narrative — just the "what deserves
 * attention right now" surface, with full audit trail preserved.
 */
export const getCommandCentrePanels = createServerFn({ method: "GET" }).handler(async (): Promise<PanelData[]> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const nowIso = new Date().toISOString();
  const dayAgo = Date.now() - 24 * 3600_000;
  const twoDayAgo = Date.now() - 48 * 3600_000;

  // ---- Batch loads ------------------------------------------------------
  const [
    { data: assets },
    { data: fredSource },
    { data: sources },
    { data: runs },
    { data: verifyRuns },
    { data: quotas },
  ] = await Promise.all([
    supabaseAdmin.from("assets").select("id, symbol, name").eq("active", true),
    supabaseAdmin.from("data_sources").select("id, name").eq("provider_code", "fred").maybeSingle(),
    supabaseAdmin.from("data_sources").select("id, name, tier, provider_code, active"),
    supabaseAdmin.from("ingestion_runs")
      .select("id, source_id, status, data_category, started_at, finished_at, rows_ingested, error")
      .order("started_at", { ascending: false }).limit(200),
    supabaseAdmin.from("verify_runs")
      .select("id, check_id, panel_id, verifier, status, detail, started_at, confidence")
      .order("started_at", { ascending: false }).limit(60),
    supabaseAdmin.from("provider_quotas")
      .select("provider_code, calls_made, daily_limit, last_status, disabled_until, quota_date")
      .order("quota_date", { ascending: false }).limit(30),
  ]);

  // ---- Regime panel (from FRED indicators) -----------------------------
  const regime = await buildRegimePanel(fredSource?.name ?? "FRED", nowIso);

  // ---- Score-based panels ----------------------------------------------
  const assetIds = (assets ?? []).map((a) => a.id as string);
  const assetMap = new Map((assets ?? []).map((a) => [a.id as string, a as { id: string; symbol: string; name: string }]));

  const { data: scoreRows } = assetIds.length > 0
    ? await supabaseAdmin.from("scores")
        .select("subject_id, score_type, value, computed_at")
        .eq("subject_type", "asset").in("subject_id", assetIds)
        .order("computed_at", { ascending: false }).limit(5000)
    : { data: [] as Array<{ subject_id: string; score_type: string; value: number; computed_at: string }> };

  const latestScore = new Map<string, number>(); // key = assetId:type
  const scoresForAsset = new Map<string, Record<string, number>>();
  for (const r of scoreRows ?? []) {
    const key = `${r.subject_id}:${r.score_type}`;
    if (latestScore.has(key)) continue;
    latestScore.set(key, Number(r.value));
    const bag = scoresForAsset.get(r.subject_id as string) ?? {};
    bag[r.score_type as string] = Number(r.value);
    scoresForAsset.set(r.subject_id as string, bag);
  }

  const ranked = [...scoresForAsset.entries()].map(([id, bag]) => {
    const m = bag["momentum"] ?? 50, t = bag["trend"] ?? 50, v = bag["volatility"] ?? 50;
    const composite = (m + t) / 2 + (v - 50) * 0.1;
    const risk = ((100 - m) + (100 - t)) / 2 + (v - 50) * 0.1;
    return { id, bag, composite, risk };
  });
  const topOps = [...ranked].sort((a, b) => b.composite - a.composite).slice(0, 5);
  const topRisks = [...ranked].sort((a, b) => b.risk - a.risk).slice(0, 5);

  const opportunities = buildRankingPanel({
    id: "cc-opportunities",
    title: "Top research opportunities",
    purpose: "Top 5 from the Opportunity Radar — deterministic composite of momentum, trend and volatility.",
    metricLabel: "Composite",
    rows: topOps.map((r) => ({
      symbol: assetMap.get(r.id)?.symbol ?? r.id.slice(0, 4),
      name: assetMap.get(r.id)?.name ?? "",
      value: r.composite,
      bag: r.bag,
    })),
    tone: (v) => v > 60 ? "positive" : v < 40 ? "negative" : "neutral",
    formula: "composite = (momentum + trend)/2 + (volatility − 50) × 0.1",
    calcVersion: "cc.opps.v0.1",
    ranked: ranked.length,
  });

  const risks = buildRankingPanel({
    id: "cc-risks",
    title: "Top overvaluation risks",
    purpose: "Top 5 from the Overvaluation Radar — the same inputs, ranked by the failure case.",
    metricLabel: "Risk score",
    rows: topRisks.map((r) => ({
      symbol: assetMap.get(r.id)?.symbol ?? r.id.slice(0, 4),
      name: assetMap.get(r.id)?.name ?? "",
      value: r.risk,
      bag: r.bag,
    })),
    tone: (v) => v > 60 ? "negative" : v < 40 ? "positive" : "warning",
    formula: "risk = ((100−momentum) + (100−trend))/2 + (volatility − 50) × 0.1",
    calcVersion: "cc.risks.v0.1",
    ranked: ranked.length,
  });

  // ---- Data health summary ---------------------------------------------
  const activeSources = (sources ?? []).filter((s) => s.active).length;
  const totalSources = (sources ?? []).length;
  const runs24h = (runs ?? []).filter((r) => new Date(r.started_at as string).getTime() >= dayAgo);
  const failed24h = runs24h.filter((r) => r.status === "failed").length;
  const success24h = runs24h.filter((r) => r.status === "success").length;
  const rows24h = runs24h.reduce((sum, r) => sum + ((r.rows_ingested as number | null) ?? 0), 0);
  const activeQuotas = (quotas ?? []).filter((q) => q.quota_date === new Date().toISOString().slice(0, 10));
  const quotaExhausted = activeQuotas.filter((q) => (q.calls_made as number) >= (q.daily_limit as number)).length;
  const quotaDisabled = activeQuotas.filter((q) => q.disabled_until && new Date(q.disabled_until as string) > new Date()).length;

  const dataHealthPanel: PanelData = {
    id: "cc-data-health",
    title: "Data health summary",
    purpose: "Provider activity, ingestion outcomes and quota headroom in the last 24 hours.",
    metrics: [
      { label: "Active sources", value: `${activeSources} / ${totalSources}`, tone: activeSources === totalSources ? "positive" : "warning" },
      { label: "Runs 24h", value: `${runs24h.length}`, tone: runs24h.length === 0 ? "warning" : "neutral" },
      { label: "Failures 24h", value: `${failed24h}`, tone: failed24h > 0 ? "negative" : "positive" },
      { label: "Rows ingested 24h", value: rows24h.toLocaleString() },
    ],
    whatChanged: `${success24h} successful runs and ${failed24h} failures in the last 24h; ${quotaExhausted} providers at quota, ${quotaDisabled} temporarily disabled.`,
    whyItMatters: "The scoring layer only fires when data is fresh and quality gates pass. This panel is the earliest warning that downstream panels will degrade.",
    evidence: [{
      id: "ev-runs", label: `${runs?.length ?? 0} recorded ingestion runs`,
      sourceName: "ingestion_runs table", tier: "tier1_official",
      asOf: nowIso, freshness: "fresh", agrees: true,
    }],
    positives: quotaExhausted === 0 && quotaDisabled === 0
      ? [{ id: "quota-ok", label: "No provider at daily quota", detail: `${activeQuotas.length} providers tracked today` }]
      : [],
    deductions: [
      ...(failed24h > 0 ? [{ id: "fail", label: `${failed24h} failed ingestion runs in 24h`, weight: -3 } as Point] : []),
      ...(quotaExhausted > 0 ? [{ id: "quota", label: `${quotaExhausted} providers at quota`, weight: -2 } as Point] : []),
      ...(quotaDisabled > 0 ? [{ id: "disabled", label: `${quotaDisabled} providers auto-disabled`, weight: -3 } as Point] : []),
    ],
    verifyNext: [
      { id: "v-runs-24h", label: "At least one successful ingestion in last 24h", verifier: "algo",
        status: success24h > 0 ? "pass" : "fail",
        detail: `${success24h} successes`, checkedAt: nowIso },
      { id: "v-no-quota-block", label: "No provider quota exhausted", verifier: "algo",
        status: quotaExhausted === 0 ? "pass" : "fail",
        detail: `${quotaExhausted} providers at limit`, checkedAt: nowIso },
    ],
    confidence: computeConfidence({ tier: "tier1_official", category: "provider_health", ageSeconds: 0 }),
  };

  // ---- Verifier activity -----------------------------------------------
  const vrByVerifier = new Map<string, number>();
  const vrByStatus = new Map<string, number>();
  const vr24h = (verifyRuns ?? []).filter((r) => new Date(r.started_at as string).getTime() >= dayAgo);
  for (const r of vr24h) {
    vrByVerifier.set(r.verifier as string, (vrByVerifier.get(r.verifier as string) ?? 0) + 1);
    vrByStatus.set(r.status as string, (vrByStatus.get(r.status as string) ?? 0) + 1);
  }
  const vrRecent: Point[] = (verifyRuns ?? []).slice(0, 6).map((r) => ({
    id: `vr-${r.id}`,
    label: `[${r.verifier}] ${r.check_id} → ${r.status}`,
    detail: `${r.panel_id} · ${new Date(r.started_at as string).toLocaleString()}${r.detail ? ` · ${r.detail}` : ""}`,
  }));
  const vrFail = vrByStatus.get("fail") ?? 0;
  const vrPass = vrByStatus.get("pass") ?? 0;

  const verifierPanel: PanelData = {
    id: "cc-verifier",
    title: "Verifier activity (24h)",
    purpose: "Latest algo / api / ai verifier runs across every panel with a wired data source.",
    metrics: [
      { label: "Runs 24h", value: `${vr24h.length}` },
      { label: "Algo", value: `${vrByVerifier.get("algo") ?? 0}` },
      { label: "API", value: `${vrByVerifier.get("api") ?? 0}` },
      { label: "AI", value: `${vrByVerifier.get("ai") ?? 0}` },
      { label: "Pass / Fail", value: `${vrPass} / ${vrFail}`, tone: vrFail === 0 ? "positive" : "warning" },
    ],
    whatChanged: vr24h.length === 0
      ? "No verifier activity in the last 24 hours."
      : `${vr24h.length} verifier runs recorded, ${vrPass} pass, ${vrFail} fail.`,
    whyItMatters: "Every panel's confidence is only as strong as the verifiers that stand behind it. This is the audit-trail summary in one place.",
    evidence: [{
      id: "ev-vr", label: `${verifyRuns?.length ?? 0} verify_runs available`,
      sourceName: "verify_runs table", tier: "tier1_official",
      asOf: nowIso, freshness: "fresh", agrees: true,
    }],
    positives: vrPass > 0 ? [{ id: "vrpass", label: `${vrPass} verifier passes`, weight: 2 }] : [],
    deductions: vrFail > 0 ? [{ id: "vrfail", label: `${vrFail} verifier failures`, weight: -2 }] : (
      vr24h.length === 0 ? [{ id: "silent", label: "No verifier activity in last 24h" }] : []
    ),
    verifyNext: [
      { id: "v-vr-live", label: "Verifier ran at least once in last 24h", verifier: "algo",
        status: vr24h.length > 0 ? "pass" : "fail",
        detail: `${vr24h.length} runs`, checkedAt: nowIso },
    ],
    confidence: computeConfidence({ tier: "tier1_official", category: "verify_run", ageSeconds: 0 }),
  };
  verifierPanel.positives.push(...vrRecent);

  // ---- What changed today ---------------------------------------------
  const changedPanel = buildChangesPanel({
    verifyRuns: verifyRuns ?? [],
    runs: runs ?? [],
    scoreRows: scoreRows ?? [],
    dayAgo, twoDayAgo, nowIso,
  });

  return [regime, opportunities, risks, dataHealthPanel, verifierPanel, changedPanel];
});

// ---------------------------------------------------------------------------

async function buildRegimePanel(sourceName: string, nowIso: string): Promise<PanelData> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: indicators } = await supabaseAdmin
    .from("economic_indicators")
    .select("id, code")
    .in("code", ["US_10Y", "US_2Y", "US_T10Y2Y", "US_UNRATE", "US_CORE_CPI", "US_CPI"]);
  const ids = (indicators ?? []).map((i) => i.id as string);
  const codeById = new Map((indicators ?? []).map((i) => [i.id as string, i.code as string]));

  const { data: points } = ids.length > 0
    ? await supabaseAdmin.from("data_points")
        .select("subject_id, metric_code, value_num, as_of")
        .in("subject_id", ids).order("as_of", { ascending: true }).limit(3000)
    : { data: [] as Array<{ subject_id: string; metric_code: string; value_num: number | null; as_of: string }> };

  const byMetric = new Map<string, Array<{ asOf: string; value: number }>>();
  for (const p of points ?? []) {
    if (p.value_num === null) continue;
    const arr = byMetric.get(p.metric_code as string) ?? [];
    arr.push({ asOf: p.as_of as string, value: Number(p.value_num) });
    byMetric.set(p.metric_code as string, arr);
    void codeById;
  }
  const last = (m: string) => {
    const a = byMetric.get(m);
    return a && a.length > 0 ? a[a.length - 1] : undefined;
  };
  const spread = last("T10Y2Y");
  const unrate = last("UNRATE");
  const core = last("CPILFESL");
  const ten = last("DGS10");

  const flags: Metric[] = [];
  const positives: Point[] = [];
  const deductions: Point[] = [];
  const verifyNext: VerifyCheck[] = [];
  let evidenceAsOf = nowIso;

  if (spread) {
    evidenceAsOf = spread.asOf;
    const inverted = spread.value < 0;
    flags.push({ label: "10Y − 2Y", value: `${spread.value.toFixed(2)}pp`, tone: inverted ? "negative" : "positive" });
    (inverted ? deductions : positives).push({
      id: "curve", label: inverted ? "Yield curve inverted" : "Yield curve positive",
      detail: `${spread.value.toFixed(2)}pp`,
    });
    verifyNext.push({
      id: "v-curve", label: "Yield curve non-inverted", verifier: "algo",
      status: inverted ? "fail" : "pass", detail: `${spread.value.toFixed(2)}pp`, checkedAt: nowIso,
    });
  }
  if (unrate) {
    flags.push({ label: "Unemployment", value: `${unrate.value.toFixed(2)}%`, tone: unrate.value < 5 ? "positive" : "warning" });
    (unrate.value < 5 ? positives : deductions).push({
      id: "unrate", label: unrate.value < 5 ? "Labor market tight" : "Labor market loosening",
      detail: `${unrate.value.toFixed(2)}%`,
    });
  }
  if (core && byMetric.get("CPILFESL") && byMetric.get("CPILFESL")!.length >= 13) {
    const series = byMetric.get("CPILFESL")!;
    const cur = series[series.length - 1].value;
    const yoy = series[series.length - 13].value;
    const change = ((cur - yoy) / yoy) * 100;
    flags.push({ label: "Core CPI YoY", value: `${change.toFixed(2)}%`, tone: change < 3 ? "positive" : change > 3.5 ? "negative" : "warning" });
  }
  if (ten) flags.push({ label: "US 10Y", value: `${ten.value.toFixed(2)}%` });

  // Regime label — deterministic bucketing
  const inverted = (spread?.value ?? 1) < 0;
  const highRates = (ten?.value ?? 0) > 4.25;
  const label = inverted && highRates ? "Late-cycle · inverted curve · elevated rates"
    : inverted ? "Late-cycle · inverted curve"
    : highRates ? "Mid-cycle · elevated rates"
    : (spread && spread.value > 0.5) ? "Early re-steepening"
    : "Neutral";

  flags.unshift({ label: "Regime", value: label, tone: inverted ? "warning" : "neutral" });

  const ageSec = (Date.now() - new Date(evidenceAsOf).getTime()) / 1000;
  const conf = computeConfidence({ tier: "tier1_official", category: "macro_release", ageSeconds: ageSec });

  const evidence: Evidence[] = [];
  if (spread) evidence.push({ id: "ev-spread", label: "10Y − 2Y (T10Y2Y)", sourceName, tier: "tier1_official",
    asOf: spread.asOf, freshness: freshnessState((Date.now() - new Date(spread.asOf).getTime()) / 1000, DEFAULT_FRESHNESS.macro_release),
    agrees: true, url: "https://fred.stlouisfed.org/series/T10Y2Y" });
  if (unrate) evidence.push({ id: "ev-un", label: "Unemployment (UNRATE)", sourceName, tier: "tier1_official",
    asOf: unrate.asOf, freshness: freshnessState((Date.now() - new Date(unrate.asOf).getTime()) / 1000, DEFAULT_FRESHNESS.macro_release),
    agrees: true, url: "https://fred.stlouisfed.org/series/UNRATE" });
  if (core) evidence.push({ id: "ev-core", label: "Core CPI (CPILFESL)", sourceName, tier: "tier1_official",
    asOf: core.asOf, freshness: freshnessState((Date.now() - new Date(core.asOf).getTime()) / 1000, DEFAULT_FRESHNESS.macro_release),
    agrees: true, url: "https://fred.stlouisfed.org/series/CPILFESL" });

  if (evidence.length === 0) {
    return {
      id: "cc-regime", title: "Regime today",
      purpose: "Deterministic classification of the current market environment.",
      metrics: [{ label: "Regime", value: "unknown", tone: "warning" }],
      whatChanged: "No FRED observations yet — regime cannot be classified.",
      whyItMatters: "Regime tilts affect every downstream priority.",
      evidence: [], positives: [], deductions: [{ id: "no-macro", label: "No macro data" }],
      verifyNext: [{ id: "v-macro", label: "Ingest FRED data to unlock regime classification", verifier: "manual", status: "pending" }],
      confidence: { value: 0, penalties: [{ code: "no_data", points: 100, reason: "no FRED data" }] },
    };
  }

  return {
    id: "cc-regime",
    title: "Regime today",
    purpose: "Deterministic classification of the current market environment, from FRED indicators.",
    metrics: flags,
    whatChanged: `Latest print anchoring the regime call: ${new Date(evidenceAsOf).toLocaleDateString()}.`,
    whyItMatters: "Regime dictates which factor tilts, screens and historical parallels are worth the research time. If it flips, every downstream priority does too.",
    evidence, positives, deductions, verifyNext,
    confidence: conf,
    calculation: {
      formula: "regime = bucket(curve_sign, level_10y, spread_magnitude)",
      ...stampCalculation("cc.regime.v0.1", { label, spread: spread?.value, ten: ten?.value }),
      inputs: { spread: spread?.value ?? null, ten: ten?.value ?? null, unrate: unrate?.value ?? null },
    },
  };
}

// ---------------------------------------------------------------------------

interface RankingArgs {
  id: string; title: string; purpose: string;
  metricLabel: string;
  rows: Array<{ symbol: string; name: string; value: number; bag: Record<string, number> }>;
  tone: (v: number) => "positive" | "negative" | "neutral" | "warning";
  formula: string;
  calcVersion: string;
  ranked: number;
}

function buildRankingPanel(a: RankingArgs): PanelData {
  const nowIso = new Date().toISOString();
  if (a.rows.length === 0) {
    return {
      id: a.id, title: a.title, purpose: a.purpose,
      metrics: [{ label: "Ranked", value: "0" }],
      whatChanged: "No scores computed yet — trigger /api/public/scores/run once prices are ingested.",
      whyItMatters: "This is the shortlist that funnels research time.",
      evidence: [], positives: [],
      deductions: [{ id: "empty", label: "No scored assets available." }],
      verifyNext: [],
      confidence: { value: 0, penalties: [{ code: "no_data", points: 100, reason: "no scores" }] },
    };
  }
  const leader = a.rows[0];
  const positives: Point[] = a.rows.map((r) => ({
    id: `row-${r.symbol}`,
    label: `${r.symbol} · ${a.metricLabel} ${r.value.toFixed(1)}`,
    detail: `${r.name} — momo ${r.bag.momentum?.toFixed(0) ?? "—"} · trend ${r.bag.trend?.toFixed(0) ?? "—"} · vol ${r.bag.volatility?.toFixed(0) ?? "—"}`,
  }));
  return {
    id: a.id, title: a.title, purpose: a.purpose,
    metrics: [
      { label: "Leader", value: leader.symbol, tone: a.tone(leader.value) },
      { label: a.metricLabel, value: leader.value.toFixed(1), tone: a.tone(leader.value) },
      { label: "Ranked", value: `${a.ranked}` },
    ],
    whatChanged: `Leader today: ${leader.symbol} at ${leader.value.toFixed(1)}.`,
    whyItMatters: "Highest-signal names surfaced here save the most research time downstream.",
    evidence: [{
      id: "ev-scores", label: `${a.ranked} scored assets`,
      sourceName: "scores table", tier: "tier1_official",
      asOf: nowIso, freshness: "fresh", agrees: true,
    }],
    positives,
    deductions: [],
    verifyNext: [
      { id: "v-ranked", label: "At least 5 assets scored", verifier: "algo",
        status: a.ranked >= 5 ? "pass" : "fail", detail: `${a.ranked} ranked`, checkedAt: nowIso },
      { id: "v-ai", label: `AI: narrate today's ${a.metricLabel.toLowerCase()} leaders`, verifier: "ai",
        status: "unavailable", detail: "Lit up once AI commentary layer is wired." },
    ],
    confidence: computeConfidence({ tier: "tier2_regulated", category: "price_daily", ageSeconds: 24 * 3600 }),
    calculation: {
      formula: a.formula,
      ...stampCalculation(a.calcVersion, a.rows.map((r) => r.symbol)),
      inputs: { top: leader.symbol, top_value: leader.value, ranked: a.ranked },
    },
  };
}

// ---------------------------------------------------------------------------

interface ChangesArgs {
  verifyRuns: Array<{ verifier: string; status: string; started_at: string; check_id: string; panel_id: string }>;
  runs: Array<{ status: string; source_id: string; started_at: string; rows_ingested: number | null; error: string | null; data_category: string }>;
  scoreRows: Array<{ subject_id: string; score_type: string; value: number; computed_at: string }>;
  dayAgo: number; twoDayAgo: number; nowIso: string;
}

function buildChangesPanel({ verifyRuns, runs, scoreRows, dayAgo, twoDayAgo, nowIso }: ChangesArgs): PanelData {
  const scores24 = scoreRows.filter((r) => new Date(r.computed_at).getTime() >= dayAgo).length;
  const runsToday = runs.filter((r) => new Date(r.started_at).getTime() >= dayAgo);
  const runsYest = runs.filter((r) => {
    const t = new Date(r.started_at).getTime();
    return t >= twoDayAgo && t < dayAgo;
  });
  const failToday = runsToday.filter((r) => r.status === "failed").length;
  const failYest = runsYest.filter((r) => r.status === "failed").length;

  // Verifier flips: prior status per check_id vs latest
  const byCheck = new Map<string, Array<{ status: string; started_at: string }>>();
  for (const v of verifyRuns) {
    const arr = byCheck.get(v.check_id) ?? [];
    arr.push({ status: v.status, started_at: v.started_at });
    byCheck.set(v.check_id, arr);
  }
  const flips: Point[] = [];
  for (const [check, arr] of byCheck) {
    if (arr.length < 2) continue;
    if (arr[0].status !== arr[1].status) {
      flips.push({
        id: `flip-${check}`,
        label: `${check}: ${arr[1].status} → ${arr[0].status}`,
        detail: new Date(arr[0].started_at).toLocaleString(),
      });
    }
  }

  const positives: Point[] = [];
  const deductions: Point[] = [];
  if (scores24 > 0) positives.push({ id: "s24", label: `${scores24} score rows computed in 24h`, weight: 2 });
  if (failToday === 0) positives.push({ id: "no-fail", label: "No ingestion failures today", weight: 2 });
  if (failToday > failYest) deductions.push({ id: "fail-up", label: `Ingestion failures up (${failYest} → ${failToday})`, weight: -3 });
  flips.slice(0, 4).forEach((f) => (f.label.includes("→ fail") || f.label.includes("→ stale") ? deductions : positives).push(f));

  return {
    id: "cc-changes",
    title: "What changed today",
    purpose: "Deterministic diff — new score rows, ingestion outcome deltas and verifier status flips vs yesterday.",
    metrics: [
      { label: "Score rows 24h", value: `${scores24}` },
      { label: "Ingestion runs 24h", value: `${runsToday.length}` },
      { label: "Failures Δ", value: `${failYest} → ${failToday}`, tone: failToday > failYest ? "negative" : failToday < failYest ? "positive" : "neutral" },
      { label: "Verifier flips", value: `${flips.length}`, tone: flips.length > 0 ? "warning" : "neutral" },
    ],
    whatChanged: flips.length > 0
      ? `${flips.length} verifier status flip${flips.length === 1 ? "" : "s"} since prior run.`
      : "No verifier status flips vs prior run.",
    whyItMatters: "The Command Centre exists to draw attention to what's different — this is the day-over-day delta that matters.",
    evidence: [{
      id: "ev-changes", label: "Diff computed over verify_runs, ingestion_runs and scores",
      sourceName: "internal", tier: "tier1_official",
      asOf: nowIso, freshness: "fresh", agrees: true,
    }],
    positives, deductions,
    verifyNext: [
      { id: "v-scored", label: "Scores computed today", verifier: "algo",
        status: scores24 > 0 ? "pass" : "fail", detail: `${scores24} rows`, checkedAt: nowIso },
      { id: "v-fail-nogrowth", label: "Failure count not growing day-over-day", verifier: "algo",
        status: failToday <= failYest ? "pass" : "fail",
        detail: `${failYest} → ${failToday}`, checkedAt: nowIso },
    ],
    confidence: computeConfidence({ tier: "tier1_official", category: "diff", ageSeconds: 0 }),
    calculation: {
      formula: "diff(today, yesterday) over {scores, ingestion_runs, verify_runs}",
      ...stampCalculation("cc.changes.v0.1", { scores24, failToday, failYest, flips: flips.length }),
      inputs: { scores24, failToday, failYest, flipCount: flips.length },
    },
  };
}