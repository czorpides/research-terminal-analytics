import type { VerifyCheck } from "@/lib/panels/contract";

export interface SeriesPoint {
  asOf: string;
  value: number;
}

/**
 * Deterministic algorithm checks — no network needed, no LLM.
 * Every runner returns a VerifyCheck the panel attaches to verifyNext.
 */

export function checkAboveMovingAverage(id: string, label: string, series: SeriesPoint[], window: number): VerifyCheck {
  if (series.length < window + 1) {
    return { id, label, verifier: "algo", status: "unavailable", detail: `Need ${window}+ points, have ${series.length}.`, checkedAt: new Date().toISOString() };
  }
  const latest = series[series.length - 1];
  const slice = series.slice(-window - 1, -1);
  const avg = slice.reduce((s, p) => s + p.value, 0) / slice.length;
  const pass = latest.value > avg;
  return {
    id, label, verifier: "algo",
    status: pass ? "pass" : "fail",
    detail: `Latest ${latest.value.toFixed(2)} vs ${window}-period MA ${avg.toFixed(2)}.`,
    checkedAt: new Date().toISOString(),
  };
}

export function checkSpreadSign(id: string, label: string, latest: number | null, expected: "positive" | "negative"): VerifyCheck {
  if (latest === null) return { id, label, verifier: "algo", status: "unavailable", checkedAt: new Date().toISOString() };
  const pass = expected === "positive" ? latest > 0 : latest < 0;
  return {
    id, label, verifier: "algo",
    status: pass ? "pass" : "fail",
    detail: `Current value ${latest.toFixed(2)} (${expected} expected).`,
    checkedAt: new Date().toISOString(),
  };
}

export function checkFreshness(id: string, label: string, asOf: string | null, maxAgeSeconds: number): VerifyCheck {
  if (!asOf) return { id, label, verifier: "algo", status: "unavailable", checkedAt: new Date().toISOString() };
  const age = (Date.now() - new Date(asOf).getTime()) / 1000;
  const pass = age <= maxAgeSeconds;
  return {
    id, label, verifier: "algo",
    status: pass ? "pass" : "stale",
    detail: `Age ${(age / 3600).toFixed(1)}h vs max ${(maxAgeSeconds / 3600).toFixed(1)}h.`,
    checkedAt: new Date().toISOString(),
  };
}

/** Placeholder — API-verified check (e.g. calendar lookup). Wired in later phases. */
export function pendingApiCheck(id: string, label: string, detail?: string): VerifyCheck {
  return { id, label, verifier: "api", status: "pending", detail };
}

/** Placeholder — AI-verified check. Lit up when the commentary layer lands. */
export function pendingAiCheck(id: string, label: string, detail?: string): VerifyCheck {
  return { id, label, verifier: "ai", status: "unavailable", detail: detail ?? "AI commentary layer arrives in a later phase." };
}

/** Fundamentals ingest recency check. */
export function checkFundamentalsFresh(id: string, label: string, asOf: string | null): VerifyCheck {
  if (!asOf) return { id, label, verifier: "api", status: "unavailable", detail: "No fundamentals ingested yet.", checkedAt: new Date().toISOString() };
  const ageDays = (Date.now() - new Date(asOf).getTime()) / 86_400_000;
  const pass = ageDays <= 120;
  return {
    id, label, verifier: "api",
    status: pass ? "pass" : "stale",
    detail: `Age ${ageDays.toFixed(0)}d vs 120d policy.`,
    checkedAt: new Date().toISOString(),
  };
}

/** Peer-rank stability — flags when the current percentile moves > tolerance vs the prior run. */
export function checkPeerRankStable(id: string, label: string, current: number | null, previous: number | null, tolerance = 10): VerifyCheck {
  if (current === null || previous === null) {
    return { id, label, verifier: "algo", status: "unavailable", detail: "Need at least two peer-rank runs.", checkedAt: new Date().toISOString() };
  }
  const drift = Math.abs(current - previous);
  const pass = drift <= tolerance;
  return {
    id, label, verifier: "algo",
    status: pass ? "pass" : "fail",
    detail: `Drift ${drift.toFixed(1)} pts vs ±${tolerance} tolerance (was ${previous.toFixed(0)}, now ${current.toFixed(0)}).`,
    checkedAt: new Date().toISOString(),
  };
}