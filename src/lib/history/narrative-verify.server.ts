/**
 * Narrative verify loop for historical_events.
 *
 *   algo   → structural completeness + citation domain allowlist
 *   api    → HEAD/GET-Range fetch each citation URL; flag 4xx/5xx
 *   ai     → Lovable AI Gateway coherence + factual-plausibility check
 *   retry  → if AI verified=false OR confidence<60, rewrite the narrative
 *            grounded in the citations and re-verify (max 2 rewrites, then
 *            mark needs_review).
 *
 * Every pass streams into verify_runs so Data Health can see it.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_MODEL = "google/gemini-3-flash-preview";

const ALLOWLIST_DOMAINS = [
  "federalreserve.gov", "federalreservehistory.org", "bls.gov", "bea.gov",
  "imf.org", "worldbank.org", "treasury.gov", "sec.gov", "ecb.europa.eu",
  "reuters.com", "ft.com", "wsj.com", "bloomberg.com", "apnews.com",
  "nytimes.com", "economist.com", "wikipedia.org", "cbo.gov", "nber.org",
];

export interface Citation { title: string; url: string; publisher: string }

export interface NarrativeRecord {
  id: string; code: string; name: string; category: string; start_date: string;
  summary: string | null;
  causes: string | null; mechanism: string | null;
  what_happened_next: string | null; key_takeaway: string | null;
  citations: Citation[];
  fingerprint: Record<string, string>;
  tags: string[] | null;
  narrative_attempts: number;
}

function domainOf(u: string): string { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } }

function algoCheck(ev: NarrativeRecord): { pass: boolean; issues: string[] } {
  const issues: string[] = [];
  for (const f of ["causes", "mechanism", "what_happened_next", "key_takeaway"] as const) {
    if (!ev[f] || (ev[f] as string).trim().length < 20) issues.push(`missing_${f}`);
  }
  if (!ev.citations || ev.citations.length === 0) issues.push("no_citations");
  for (const c of ev.citations ?? []) {
    if (!c.url || !/^https?:\/\//.test(c.url)) issues.push(`bad_url:${c.title}`);
    else if (!ALLOWLIST_DOMAINS.some((d) => domainOf(c.url) === d || domainOf(c.url).endsWith("." + d))) {
      issues.push(`untrusted_domain:${domainOf(c.url)}`);
    }
  }
  return { pass: issues.length === 0, issues };
}

async function apiCheck(citations: Citation[]): Promise<{ pass: boolean; issues: string[] }> {
  const issues: string[] = [];
  await Promise.all((citations ?? []).map(async (c) => {
    try {
      const r = await fetch(c.url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(5000) });
      if (!r.ok) {
        const r2 = await fetch(c.url, { method: "GET", headers: { Range: "bytes=0-256" }, signal: AbortSignal.timeout(5000) });
        if (!r2.ok) issues.push(`dead_link:${r2.status}:${c.url}`);
      }
    } catch (e) {
      issues.push(`fetch_error:${(e as Error).message}:${c.url}`);
    }
  }));
  return { pass: issues.length === 0, issues };
}

async function callAiJson<T>(system: string, user: string): Promise<T | null> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return null;
  try {
    const resp = await fetch(AI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        response_format: { type: "json_object" },
      }),
    });
    if (!resp.ok) return null;
    const body = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
    const raw = body.choices?.[0]?.message?.content ?? "{}";
    return JSON.parse(raw) as T;
  } catch { return null; }
}

async function aiCheck(ev: NarrativeRecord): Promise<{ verified: boolean; confidence: number; issues: string[] } | null> {
  const system = "You are a rigorous financial-history verifier. Reply strictly as JSON: {\"verified\":boolean,\"confidence\":0-100,\"issues\":string[]}. Set verified=false and confidence<60 when fields are missing, vague, contradict the summary, or would not be supported by the cited publishers.";
  const user = [
    `Event: ${ev.name} (${ev.start_date}, category ${ev.category}).`,
    `Tags: ${(ev.tags ?? []).join(", ")}.`,
    `Summary: ${ev.summary ?? "(missing)"}.`,
    `Causes: ${ev.causes ?? "(missing)"}`,
    `Mechanism: ${ev.mechanism ?? "(missing)"}`,
    `What happened next: ${ev.what_happened_next ?? "(missing)"}`,
    `Key takeaway: ${ev.key_takeaway ?? "(missing)"}`,
    `Citations: ${(ev.citations ?? []).map((c) => `${c.publisher} — ${c.title} (${c.url})`).join(" | ") || "(none)"}`,
  ].join("\n");
  const parsed = await callAiJson<{ verified?: boolean; confidence?: number; issues?: string[] }>(system, user);
  if (!parsed) return null;
  return {
    verified: !!parsed.verified,
    confidence: Math.max(0, Math.min(100, Math.round(parsed.confidence ?? 0))),
    issues: (parsed.issues ?? []).slice(0, 8),
  };
}

async function aiRewrite(ev: NarrativeRecord, issues: string[]): Promise<{ causes: string; mechanism: string; what_happened_next: string; key_takeaway: string } | null> {
  const system = "You rewrite historical-event narrative fields grounded strictly in the provided summary and citations. Reply strictly as JSON with keys causes, mechanism, what_happened_next, key_takeaway. Each 1–3 sentences, plain English, no hype, no invented numbers.";
  const user = [
    `Event: ${ev.name} (${ev.start_date}, ${ev.category}). Tags: ${(ev.tags ?? []).join(", ")}.`,
    `Summary: ${ev.summary ?? ""}`,
    `Existing citations: ${(ev.citations ?? []).map((c) => `${c.publisher} — ${c.title} (${c.url})`).join(" | ")}`,
    `Previous issues: ${issues.join("; ")}`,
    `Fields required:`,
    `- causes: what triggered it (policy, shock, geopolitics, imbalance)`,
    `- mechanism: the transmission channel (e.g. rates → mortgages → housing)`,
    `- what_happened_next: observable market/economy consequence over 6–24 months`,
    `- key_takeaway: one forward-looking lesson for when a similar setup reappears`,
  ].join("\n");
  const parsed = await callAiJson<{ causes?: string; mechanism?: string; what_happened_next?: string; key_takeaway?: string }>(system, user);
  if (!parsed || !parsed.causes || !parsed.mechanism || !parsed.what_happened_next || !parsed.key_takeaway) return null;
  return { causes: parsed.causes, mechanism: parsed.mechanism, what_happened_next: parsed.what_happened_next, key_takeaway: parsed.key_takeaway };
}

async function logRun(ev: NarrativeRecord, verifier: "algo" | "api" | "ai", status: string, detail: string, extra?: Record<string, unknown>) {
  await supabaseAdmin.from("verify_runs").insert({
    check_id: `narrative:${ev.code}`,
    panel_id: "history",
    verifier, status, detail,
    inputs: ({ code: ev.code, attempts: ev.narrative_attempts, ...(extra ?? {}) }) as unknown as Json,
    runner_key: `narrative_verify_${verifier}`,
    trigger_source: "narrative_verify",
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
  });
}

/** Verify one event; runs algo → api → ai and rewrites up to 2× if AI fails. */
export async function verifyEventNarrative(code: string): Promise<{ code: string; status: string; confidence: number; attempts: number; issues: string[] }> {
  const { data } = await supabaseAdmin.from("historical_events").select("*").eq("code", code).maybeSingle();
  if (!data) return { code, status: "unavailable", confidence: 0, attempts: 0, issues: ["not_found"] };
  let ev = data as unknown as NarrativeRecord;

  // If narrative is empty, prime it via a rewrite pass first.
  if (!ev.causes || !ev.mechanism || !ev.what_happened_next || !ev.key_takeaway) {
    const primed = await aiRewrite(ev, ["initial_fill"]);
    if (primed) {
      const next = (ev.narrative_attempts ?? 0) + 1;
      await supabaseAdmin.from("historical_events").update({ ...primed, narrative_attempts: next }).eq("id", ev.id);
      ev = { ...ev, ...primed, narrative_attempts: next };
    }
  }

  const MAX_REWRITES = 2;
  let attempt = 0;
  let aiResult: Awaited<ReturnType<typeof aiCheck>> = null;
  const allIssues: string[] = [];

  while (attempt <= MAX_REWRITES) {
    const algo = algoCheck(ev);
    await logRun(ev, "algo", algo.pass ? "pass" : "fail", algo.pass ? "structure + allowlist ok" : algo.issues.join("; "), { issues: algo.issues });

    const api = await apiCheck(ev.citations ?? []);
    const apiStatus = api.pass ? "pass" : (api.issues[0]?.startsWith("dead_link") ? "stale" : "fail");
    await logRun(ev, "api", apiStatus, api.pass ? "all citations live" : api.issues.join("; "), { issues: api.issues });

    aiResult = await aiCheck(ev);
    if (!aiResult) {
      await logRun(ev, "ai", "unavailable", "LOVABLE_API_KEY missing or AI failed");
      break;
    }
    const aiPass = aiResult.verified && aiResult.confidence >= 60;
    await logRun(ev, "ai", aiPass ? "pass" : "fail",
      `verified=${aiResult.verified} confidence=${aiResult.confidence}; ${aiResult.issues.join("; ")}`, { attempt });

    allIssues.push(...algo.issues, ...api.issues, ...aiResult.issues);
    if ((algo.pass && api.pass && aiPass) || attempt === MAX_REWRITES) break;

    const rewritten = await aiRewrite(ev, [...algo.issues, ...aiResult.issues]);
    if (!rewritten) break;
    const next = (ev.narrative_attempts ?? 0) + 1;
    await supabaseAdmin.from("historical_events").update({ ...rewritten, narrative_attempts: next }).eq("id", ev.id);
    ev = { ...ev, ...rewritten, narrative_attempts: next };
    attempt++;
  }

  const algo = algoCheck(ev);
  const api = await apiCheck(ev.citations ?? []);
  const aiOk = aiResult ? (aiResult.verified && aiResult.confidence >= 60) : false;
  const finalStatus: "verified" | "needs_review" | "unverified" =
    algo.pass && api.pass && aiOk ? "verified" : (aiResult ? "needs_review" : "unverified");
  const confidence = aiResult?.confidence ?? 0;

  await supabaseAdmin.from("historical_events").update({
    narrative_status: finalStatus,
    narrative_verifier: aiResult ? "ai" : null,
    narrative_confidence: confidence,
    narrative_verified_at: new Date().toISOString(),
    narrative_issues: ([...new Set([...algo.issues, ...api.issues, ...(aiResult?.issues ?? [])])]) as unknown as Json,
  }).eq("id", ev.id);

  return { code: ev.code, status: finalStatus, confidence, attempts: ev.narrative_attempts, issues: [...new Set(allIssues)] };
}

/** Verify every event narrative, sequentially to keep AI quota gentle. */
export async function verifyAllNarratives(): Promise<{ verified: number; needsReview: number; total: number }> {
  const { data } = await supabaseAdmin.from("historical_events").select("code");
  const codes = (data ?? []).map((r) => r.code as string);
  let verified = 0, needsReview = 0;
  for (const code of codes) {
    const r = await verifyEventNarrative(code);
    if (r.status === "verified") verified++;
    else if (r.status === "needs_review") needsReview++;
  }
  return { verified, needsReview, total: codes.length };
}