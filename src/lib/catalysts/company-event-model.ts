/**
 * Catalyst Intelligence v0.1 — deterministic shadow evidence model.
 * No event can influence an investment score without time-stamped, reviewed
 * evidence. No "Trump bonus", binary-news hype bonus, or missing-evidence 50.
 */
export const CATALYST_MODEL_VERSION = "company.catalyst.shadow.v0.1";

export const CATALYST_TYPES = [
  "index_inclusion",
  "earnings_expectation",
  "earnings_result",
  "government_contract",
  "political_statement",
] as const;
export type CatalystType = (typeof CATALYST_TYPES)[number];
export type EvidenceTier = "official" | "regulated" | "reputable" | "social";
export type CatalystDirection = "positive" | "negative" | "uncertain";

export interface CatalystEvidence {
  id: string;
  asset_id: string;
  event_key: string;
  event_type: CatalystType;
  headline: string;
  summary: string;
  direction: CatalystDirection;
  status: "candidate" | "verified" | "rejected";
  source_name: string;
  source_url: string;
  source_tier: EvidenceTier;
  source_published_at: string;
  known_at: string;
  effective_at: string | null;
  expires_at: string | null;
  materiality: number | null;
  novelty: number | null;
  evidence_confidence: number | null;
  evidence: Record<string, unknown>;
  verified_at: string | null;
}

export interface CatalystAssessment {
  state: "unverified" | "future" | "expired" | "incomplete" | "uncertain" | "active";
  priorityScore: number | null;
  downsideRiskScore: number | null;
  confidence: number | null;
  modelVersion: string;
  explanation: string;
}

/** Small windows prevent old events from being treated as fresh developments. */
const horizons: Record<CatalystType, number> = {
  index_inclusion: 30,
  earnings_expectation: 28,
  earnings_result: 21,
  government_contract: 45,
  political_statement: 3,
};
const sourceCaps: Record<EvidenceTier, number> = {
  official: 100, regulated: 90, reputable: 75, social: 35,
};

function withinScore(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}
function rounded(value: number): number {
  return Math.round(value * 10) / 10;
}
function revisionEvidence(event: CatalystEvidence): boolean {
  if (event.event_type !== "earnings_expectation") return true;
  return ["eps_revision_pct", "revenue_revision_pct", "company_guidance_delta_pct"]
    .some((field) => typeof event.evidence?.[field] === "number" && Number.isFinite(event.evidence[field] as number));
}

export function assessCatalyst(event: CatalystEvidence, asOf: Date = new Date()): CatalystAssessment {
  const unknown = (state: CatalystAssessment["state"], explanation: string): CatalystAssessment => ({
    state, priorityScore: null, downsideRiskScore: null,
    confidence: null, modelVersion: CATALYST_MODEL_VERSION, explanation,
  });
  if (event.status !== "verified" || !event.verified_at) {
    return unknown("unverified", "Awaiting independent evidence verification; excluded from scoring.");
  }
  const known = Date.parse(event.known_at);
  const published = Date.parse(event.source_published_at);
  const now = asOf.getTime();
  if (!Number.isFinite(known) || !Number.isFinite(published) || known + 2000 < published) {
    return unknown("incomplete", "Public availability timestamp cannot be verified.");
  }
  if (known > now || Date.parse(event.verified_at) > now) {
    return unknown("future", "Not yet publicly verified at this historical assessment date.");
  }
  // Time-of-availability gates lookahead; publication time controls freshness.
  // Backfilling last month's official news today must not reset its decay clock.
  const ageDays = Math.max(0, (now - published) / 86_400_000);
  const expiry = event.expires_at ? Date.parse(event.expires_at) : Infinity;
  if (ageDays > horizons[event.event_type] || (Number.isFinite(expiry) && now >= expiry)) {
    return unknown("expired", "Event is outside its short-term catalyst window.");
  }
  if (!withinScore(event.materiality) || !withinScore(event.novelty) ||
      !withinScore(event.evidence_confidence) || !revisionEvidence(event)) {
    return unknown("incomplete", event.event_type === "earnings_expectation"
      ? "Verified estimate or guidance revisions and materiality are required; high forecasts alone are not bullish."
      : "Verified materiality, novelty and evidence confidence are required.");
  }
  const cap = Math.min(sourceCaps[event.source_tier], event.event_type === "political_statement" ? 35 : 100);
  const confidence = Math.min(cap, event.evidence_confidence);
  const raw = event.materiality * 0.5 + event.novelty * 0.2 + confidence * 0.3;
  // A social-media statement must never earn a high catalyst rank merely
  // because its estimated novelty/materiality is high.
  const decayed = rounded(Math.min(cap, raw) * Math.exp(-Math.LN2 * ageDays / (horizons[event.event_type] / 2)));
  if (event.direction === "uncertain") {
    return { state: "uncertain", priorityScore: null, downsideRiskScore: null,
      confidence, modelVersion: CATALYST_MODEL_VERSION,
      explanation: "Verified event has an unconfirmed directional impact; not a bullish signal." };
  }
  return {
    state: "active",
    priorityScore: event.direction === "positive" ? decayed : null,
    downsideRiskScore: event.direction === "negative" ? decayed : null,
    confidence,
    modelVersion: CATALYST_MODEL_VERSION,
    explanation: event.event_type === "political_statement"
      ? "Short-lived, confidence-capped political headline; policy or commercial confirmation is required."
      : "Time-decayed, source-capped verified event. Impact is not a projected investment return.",
  };
}

/** Do not mechanically add multiple articles about the same news event. */
export function summarizeAssetCatalysts(events: CatalystEvidence[], asOf: Date = new Date()) {
  const distinct = new Map(events.map((event) => [event.event_key, event]));
  const scored = [...distinct.values()].map((event) => ({ event, assessment: assessCatalyst(event, asOf) }));
  const positive = scored.filter(x => x.assessment.priorityScore !== null);
  const negative = scored.filter(x => x.assessment.downsideRiskScore !== null);
  return {
    priorityScore: positive.length ? Math.max(...positive.map(x => x.assessment.priorityScore!)) : null,
    downsideRiskScore: negative.length ? Math.max(...negative.map(x => x.assessment.downsideRiskScore!)) : null,
    verifiedActive: scored.filter(x => x.assessment.state === "active").length,
    unverified: scored.filter(x => x.assessment.state === "unverified").length,
    modelVersion: CATALYST_MODEL_VERSION,
  };
}
