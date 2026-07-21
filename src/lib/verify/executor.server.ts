import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { computeConfidence } from "@/lib/reliability/confidence";
import type { VerifyStatus, VerifyVerifier } from "@/lib/panels/contract";

/**
 * Auto-verification executor. For each active check definition it walks the
 * verifier chain (algo → api → ai). The first verifier that returns a
 * definitive verdict (pass/fail/stale) wins. Every attempt — including
 * `unavailable` — is written to verify_runs as an immutable audit record.
 */

const CALC_VERSION = "verify.executor.v0.1";

interface CheckDef {
  id: string;
  panel_id: string;
  label: string;
  verifier_chain: string[];
  runner_key: string;
  config: Record<string, unknown>;
  required_series: string[];
  min_confidence: number;
  max_age_seconds: number;
  active: boolean;
}

interface RunnerOutcome {
  status: VerifyStatus;
  detail?: string;
  inputs: Record<string, unknown>;
  evidence: unknown[];
  confidence?: number;
}

interface SeriesPoint { asOf: string; value: number }

async function loadSeries(seriesCodes: string[]): Promise<Map<string, SeriesPoint[]>> {
  const out = new Map<string, SeriesPoint[]>();
  if (seriesCodes.length === 0) return out;
  const { data } = await supabaseAdmin
    .from("data_points")
    .select("metric_code, value_num, as_of")
    .in("metric_code", seriesCodes)
    .order("as_of", { ascending: true })
    .limit(5000);
  (data ?? []).forEach((p) => {
    if (p.value_num === null) return;
    const code = p.metric_code as string;
    const arr = out.get(code) ?? [];
    arr.push({ asOf: p.as_of as string, value: Number(p.value_num) });
    out.set(code, arr);
  });
  return out;
}

function latestOf(arr?: SeriesPoint[]) { return arr && arr.length ? arr[arr.length - 1] : undefined; }

function inputsAreLive(def: CheckDef, series: Map<string, SeriesPoint[]>): { live: boolean; reason?: string } {
  for (const code of def.required_series) {
    const arr = series.get(code);
    const l = latestOf(arr);
    if (!l) return { live: false, reason: `Series ${code} has no observations yet.` };
    const ageSec = (Date.now() - new Date(l.asOf).getTime()) / 1000;
    if (ageSec > def.max_age_seconds) return { live: false, reason: `Series ${code} stale: ${(ageSec / 3600).toFixed(1)}h > policy ${(def.max_age_seconds / 3600).toFixed(1)}h.` };
    const conf = computeConfidence({ tier: "tier1_official", category: "macro_release", ageSeconds: ageSec });
    if (conf.value < def.min_confidence) return { live: false, reason: `Series ${code} confidence ${conf.value.toFixed(2)} < min ${def.min_confidence}.` };
  }
  return { live: true };
}

/* ============================ Algo runners ============================ */

function runAlgo(def: CheckDef, series: Map<string, SeriesPoint[]>): RunnerOutcome {
  const cfg = def.config;
  switch (def.runner_key) {
    case "above_ma": return runMA(def, series, cfg, "above");
    case "below_ma": return runMA(def, series, cfg, "below");
    case "spread_sign": return runSpread(series, cfg);
    case "freshness": return runFreshness(series, cfg);
    default: return { status: "unavailable", detail: `No algo runner for ${def.runner_key}.`, inputs: {}, evidence: [] };
  }
}

function runMA(_def: CheckDef, series: Map<string, SeriesPoint[]>, cfg: Record<string, unknown>, direction: "above" | "below"): RunnerOutcome {
  const code = String(cfg.series ?? "");
  const window = Number(cfg.window ?? 60);
  const arr = series.get(code);
  if (!arr || arr.length < window + 1) return { status: "unavailable", detail: `Need ${window}+ points`, inputs: { series: code, have: arr?.length ?? 0 }, evidence: [] };
  const latest = arr[arr.length - 1];
  const slice = arr.slice(-window - 1, -1);
  const avg = slice.reduce((s, p) => s + p.value, 0) / slice.length;
  const pass = direction === "above" ? latest.value > avg : latest.value < avg;
  return {
    status: pass ? "pass" : "fail",
    detail: `Latest ${latest.value.toFixed(2)} vs ${window}-period MA ${avg.toFixed(2)} (${direction}).`,
    inputs: { series: code, latest: latest.value, ma: avg, window, direction },
    evidence: [{ code, asOf: latest.asOf, value: latest.value, ma: avg }],
    confidence: 1,
  };
}

function runSpread(series: Map<string, SeriesPoint[]>, cfg: Record<string, unknown>): RunnerOutcome {
  const code = String(cfg.series ?? "");
  const expected = (cfg.expected as string) ?? "positive";
  const l = latestOf(series.get(code));
  if (!l) return { status: "unavailable", detail: `No data for ${code}`, inputs: { series: code }, evidence: [] };
  const pass = expected === "positive" ? l.value > 0 : l.value < 0;
  return {
    status: pass ? "pass" : "fail",
    detail: `Current ${l.value.toFixed(2)} (${expected} expected).`,
    inputs: { series: code, latest: l.value, expected },
    evidence: [{ code, asOf: l.asOf, value: l.value }],
    confidence: 1,
  };
}

function runFreshness(series: Map<string, SeriesPoint[]>, cfg: Record<string, unknown>): RunnerOutcome {
  const code = String(cfg.series ?? "");
  const maxAge = Number(cfg.maxAgeSeconds ?? 86400);
  const l = latestOf(series.get(code));
  if (!l) return { status: "unavailable", detail: `No data for ${code}`, inputs: { series: code }, evidence: [] };
  const ageSec = (Date.now() - new Date(l.asOf).getTime()) / 1000;
  const pass = ageSec <= maxAge;
  return {
    status: pass ? "pass" : "stale",
    detail: `Age ${(ageSec / 3600).toFixed(1)}h vs max ${(maxAge / 3600).toFixed(1)}h.`,
    inputs: { series: code, asOf: l.asOf, ageSeconds: Math.round(ageSec), maxAgeSeconds: maxAge },
    evidence: [{ code, asOf: l.asOf, value: l.value }],
    confidence: pass ? 1 : 0.4,
  };
}

/* ============================ API runner (stub) ============================ */

function runApi(_def: CheckDef): RunnerOutcome {
  return { status: "unavailable", detail: "No API verifier registered for this check yet.", inputs: {}, evidence: [] };
}

/* ============================ AI runner (Lovable AI Gateway) ============================ */

async function runAi(def: CheckDef, series: Map<string, SeriesPoint[]>): Promise<RunnerOutcome> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return { status: "unavailable", detail: "LOVABLE_API_KEY not configured.", inputs: {}, evidence: [] };
  const cfg = def.config;
  const seriesList: string[] = Array.isArray(cfg.series) ? (cfg.series as string[]) : def.required_series;
  const question = String(cfg.question ?? `Verify: ${def.label}`);

  const snapshot: Record<string, unknown> = {};
  for (const code of seriesList) {
    const arr = series.get(code) ?? [];
    const tail = arr.slice(-6).map((p) => ({ asOf: p.asOf.slice(0, 10), value: p.value }));
    snapshot[code] = { latest: latestOf(arr)?.value ?? null, recent: tail };
  }

  const system = "You are a financial-data verifier. Given recent observations, answer strictly with JSON: {\"verdict\":\"pass|fail|unavailable\",\"reason\":\"...\"}. Use 'pass' when the statement/question is supported by the data, 'fail' when contradicted, 'unavailable' when data is insufficient. Do not hedge.";
  const user = `Statement or question: ${question}\nData snapshot: ${JSON.stringify(snapshot)}`;

  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [ { role: "system", content: system }, { role: "user", content: user } ],
        response_format: { type: "json_object" },
      }),
    });
    if (!resp.ok) return { status: "unavailable", detail: `AI gateway ${resp.status}`, inputs: { question, series: seriesList }, evidence: [] };
    const body = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
    const raw = body.choices?.[0]?.message?.content ?? "{}";
    let parsed: { verdict?: string; reason?: string } = {};
    try { parsed = JSON.parse(raw); } catch { parsed = { verdict: "unavailable", reason: raw.slice(0, 200) }; }
    const verdict = parsed.verdict === "pass" || parsed.verdict === "fail" ? parsed.verdict : "unavailable";
    return {
      status: verdict as VerifyStatus,
      detail: parsed.reason?.slice(0, 400),
      inputs: { question, series: seriesList, snapshot },
      evidence: [{ verifier: "ai", model: "google/gemini-3-flash-preview", raw: parsed }],
      confidence: verdict === "unavailable" ? 0.4 : 0.85,
    };
  } catch (e) {
    return { status: "unavailable", detail: `AI error: ${(e as Error).message}`, inputs: { question }, evidence: [] };
  }
}

/* ============================ Orchestration ============================ */

async function recordRun(def: CheckDef, verifier: VerifyVerifier, outcome: RunnerOutcome, startedAt: number, trigger: string, error?: string): Promise<void> {
  const finished = Date.now();
  await supabaseAdmin.from("verify_runs").insert({
    check_id: def.id,
    panel_id: def.panel_id,
    verifier,
    status: outcome.status,
    detail: outcome.detail ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    inputs: outcome.inputs as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    evidence: outcome.evidence as any,
    confidence: outcome.confidence ?? null,
    calc_version: CALC_VERSION,
    runner_key: def.runner_key,
    trigger_source: trigger,
    started_at: new Date(startedAt).toISOString(),
    finished_at: new Date(finished).toISOString(),
    duration_ms: finished - startedAt,
    error: error ?? null,
  });
}

export interface ExecutorResult { checkId: string; verifier: VerifyVerifier; status: VerifyStatus; detail?: string }

export async function runVerificationForChecks(defs: CheckDef[], trigger: string): Promise<ExecutorResult[]> {
  const results: ExecutorResult[] = [];
  const allSeries = Array.from(new Set(defs.flatMap((d) => d.required_series)));
  const series = await loadSeries(allSeries);

  for (const def of defs) {
    const startedAt = Date.now();
    const live = inputsAreLive(def, series);
    if (!live.live) {
      const outcome: RunnerOutcome = { status: "unavailable", detail: live.reason, inputs: { required_series: def.required_series }, evidence: [] };
      await recordRun(def, "algo", outcome, startedAt, trigger);
      results.push({ checkId: def.id, verifier: "algo", status: outcome.status, detail: outcome.detail });
      continue;
    }

    let final: { verifier: VerifyVerifier; outcome: RunnerOutcome } | null = null;
    for (const step of def.verifier_chain as VerifyVerifier[]) {
      const stepStart = Date.now();
      let outcome: RunnerOutcome;
      try {
        if (step === "algo") outcome = runAlgo(def, series);
        else if (step === "api") outcome = runApi(def);
        else if (step === "ai") outcome = await runAi(def, series);
        else outcome = { status: "unavailable", detail: `Unknown verifier ${step}`, inputs: {}, evidence: [] };
      } catch (e) {
        outcome = { status: "unavailable", detail: (e as Error).message, inputs: {}, evidence: [] };
        await recordRun(def, step, outcome, stepStart, trigger, (e as Error).message);
        continue;
      }
      await recordRun(def, step, outcome, stepStart, trigger);
      if (outcome.status === "pass" || outcome.status === "fail" || outcome.status === "stale") {
        final = { verifier: step, outcome };
        break;
      }
    }
    if (final) results.push({ checkId: def.id, verifier: final.verifier, status: final.outcome.status, detail: final.outcome.detail });
    else results.push({ checkId: def.id, verifier: "algo", status: "unavailable" });
  }
  return results;
}

export async function runVerificationForPanel(panelId: string, trigger = "manual"): Promise<ExecutorResult[]> {
  const { data } = await supabaseAdmin.from("verify_check_definitions").select("*").eq("panel_id", panelId).eq("active", true);
  return runVerificationForChecks((data ?? []) as unknown as CheckDef[], trigger);
}

export async function runVerificationForSeries(seriesCodes: string[], trigger = "ingest"): Promise<ExecutorResult[]> {
  if (seriesCodes.length === 0) return [];
  const { data } = await supabaseAdmin.from("verify_check_definitions").select("*").eq("active", true).overlaps("required_series", seriesCodes);
  return runVerificationForChecks((data ?? []) as unknown as CheckDef[], trigger);
}

export async function runAllVerifications(trigger = "cron"): Promise<ExecutorResult[]> {
  const { data } = await supabaseAdmin.from("verify_check_definitions").select("*").eq("active", true);
  return runVerificationForChecks((data ?? []) as unknown as CheckDef[], trigger);
}

export async function getLatestVerifyChecksForPanel(panelId: string) {
  const { data: defs } = await supabaseAdmin
    .from("verify_check_definitions")
    .select("id, label, verifier_chain")
    .eq("panel_id", panelId)
    .eq("active", true);
  if (!defs || defs.length === 0) return [];
  const checkIds = defs.map((d) => d.id as string);
  const { data: runs } = await supabaseAdmin
    .from("verify_runs")
    .select("check_id, verifier, status, detail, finished_at, started_at")
    .in("check_id", checkIds)
    .order("started_at", { ascending: false })
    .limit(500);
  const latest = new Map<string, { verifier: string; status: string; detail: string | null; finished_at: string | null; started_at: string }>();
  (runs ?? []).forEach((r) => {
    const k = r.check_id as string;
    if (!latest.has(k)) latest.set(k, r as unknown as { verifier: string; status: string; detail: string | null; finished_at: string | null; started_at: string });
  });
  return defs.map((d) => {
    const r = latest.get(d.id as string);
    return {
      id: d.id as string,
      label: d.label as string,
      verifier: (r?.verifier ?? (d.verifier_chain as string[])[0] ?? "algo") as VerifyVerifier,
      status: (r?.status ?? "pending") as VerifyStatus,
      detail: r?.detail ?? undefined,
      checkedAt: r?.finished_at ?? r?.started_at ?? undefined,
    };
  });
}