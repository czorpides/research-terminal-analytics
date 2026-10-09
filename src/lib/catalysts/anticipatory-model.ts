/**
 * Anticipatory Catalyst Phase 3 (shadow): STANDARD scenarios, not predicted
 * decisions. A documented qualifying condition is not a probability of an
 * index committee, regulator, customer, or market participant acting.
 */
export const ANTICIPATION_VERSION = "company.catalyst.anticipation.v0.1";
export const ANTICIPATION_RULEBOOK = {
  sp500_inclusion: {
    label: "Potential S&P 500 addition",
    methodology: "https://www.spglobal.com/spdji/en/methodology/article/sp-us-indices-methodology/",
    criteria: ["not_current_member", "us_domicile", "eligible_us_listing", "eligible_security_type", "market_cap_threshold", "float_adjusted_market_cap", "investable_weight_factor", "monthly_share_volume", "float_adjusted_liquidity", "gaap_latest_quarter", "gaap_trailing_four_quarters"],
    refreshDays: 30,
    discretion: "S&P index committee selection is discretionary. Passing published eligibility screens never implies inclusion.",
  },
  nasdaq100_reconstitution: {
    label: "Potential Nasdaq-100 selection",
    methodology: "https://indexes.nasdaq.com/docs/Methodology_NDX.pdf",
    criteria: ["not_current_member", "nasdaq_listing", "non_financial", "security_eligible", "rank_at_reference_date"],
    refreshDays: 30,
    discretion: "Use the current 2026 full-market-cap methodology and membership/rank snapshot. A rank alone does not prove selection.",
  },
  earnings_revision: {
    label: "Potential positive earnings repricing",
    methodology: "https://www.sec.gov/search-filings",
    criteria: ["scheduled_results", "documented_upward_estimate_revision", "comparable_estimate_basis"],
    refreshDays: 14,
    discretion: "Upward verified consensus revisions can precede results, but do not establish a future earnings beat.",
  },
  government_award: {
    label: "Possible government contract award",
    methodology: "https://sam.gov/",
    criteria: ["official_procurement", "identifiable_issuer_exposure", "award_window"],
    refreshDays: 30,
    discretion: "A procurement opportunity or bid is not an award. Unnamed bidders and market rumours are not issuer evidence.",
  },
  fda_pdufa: {
    label: "Upcoming FDA regulatory decision",
    methodology: "https://www.fda.gov/drugs/development-approval-process-drugs",
    criteria: ["documented_application", "documented_action_window", "issuer_product_exposure"],
    refreshDays: 60,
    discretion: "A documented action date is not a prediction of FDA approval, timing, or share-price direction.",
  },
} as const;
export type AnticipationType = keyof typeof ANTICIPATION_RULEBOOK;
export type CriterionState = "pass" | "fail" | "unknown";
export interface AnticipationCriterion {
  code: string;
  state: CriterionState;
  observedAt: string;
  sourceUrl: string;
  note: string;
}
export interface AnticipationHypothesis {
  id: string;
  asset_id: string;
  hypothesis_key: string;
  hypothesis_type: AnticipationType;
  headline: string;
  source_name: string;
  source_url: string;
  source_published_at: string;
  first_observed_at: string;
  last_reviewed_at: string;
  target_at: string | null;
  expires_at: string | null;
  status: "monitoring" | "dismissed" | "realized";
  verification_status: "candidate" | "verified" | "rejected";
  verified_at: string | null;
  criteria: AnticipationCriterion[];
}
export interface AnticipationAssessment {
  state: "not_yet_known" | "unverified" | "insufficient" | "investigate" | "criteria_pass_review" | "blocked" | "stale" | "expired" | "closed";
  passed: number;
  total: number;
  missing: string[];
  failed: string[];
  modelVersion: string;
  explanation: string;
  probability: null;
  scoreAdjustment: 0;
}

const validDate = (s: string) => {
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : null;
};
const validSource = (s: string) => {
  try {
    const url = new URL(s);
    return url.protocol === "https:" && url.username === "" && url.password === "";
  } catch { return false; }
};

/** Never infer passed requirements from absent data or positive sentiment. */
export function assessAnticipation(item: AnticipationHypothesis, asOf = new Date()): AnticipationAssessment {
  const rule = ANTICIPATION_RULEBOOK[item.hypothesis_type];
  const requirements: readonly string[] = rule?.criteria ?? [];
  const result = (state: AnticipationAssessment["state"], passed: number, missing: string[], failed: string[], explanation: string): AnticipationAssessment => ({
    state, passed, total: requirements.length, missing, failed,
    modelVersion: ANTICIPATION_VERSION, explanation, probability: null, scoreAdjustment: 0,
  });
  const now = asOf.getTime();
  const published = validDate(item.source_published_at);
  const firstSeen = validDate(item.first_observed_at);
  const reviewed = validDate(item.last_reviewed_at);
  if (!rule || published === null || firstSeen === null || reviewed === null ||
      !validSource(item.source_url) || published > firstSeen + 2000 || reviewed < firstSeen ||
      !Array.isArray(item.criteria)) {
    return result("insufficient", 0, [...requirements], [], "No valid, time-stamped evidence chain.");
  }
  if (firstSeen > now || reviewed > now) {
    return result("not_yet_known", 0, [...requirements], [], "Evidence not yet observable at this assessment time.");
  }
  if (item.verification_status !== "verified" || !item.verified_at) {
    return result("unverified", 0, [...requirements], [], "Independent evidence review pending or rejected; nothing actionable.");
  }
  const independentlyVerifiedAt = validDate(item.verified_at);
  if (independentlyVerifiedAt === null || independentlyVerifiedAt > now) {
    return result("not_yet_known", 0, [...requirements], [], "Independent verification was not available at this historical time.");
  }
  if (item.status !== "monitoring") {
    return result("closed", 0, [...requirements], [], "Thesis closed; not an active anticipatory catalyst.");
  }
  const expiry = item.expires_at ? validDate(item.expires_at) : null;
  const target = item.target_at ? validDate(item.target_at) : null;
  if ((expiry !== null && now >= expiry) || (target !== null && now > target + 14 * 86_400_000)) {
    return result("expired", 0, [...requirements], [], "Event window passed without a verified outcome.");
  }
  if (now - reviewed > rule.refreshDays * 86_400_000) {
    return result("stale", 0, [...requirements], [], "Observation needs fresh evidence before being surfaced.");
  }
  const criterionByCode = new Map<string, AnticipationCriterion>();
  for (const c of item.criteria) {
    if (!requirements.includes(c.code) || criterionByCode.has(c.code)) continue;
    const observed = validDate(c.observedAt);
    // Never count future observations, invalid evidence, or source evidence
    // acquired later than the recorded review.
    if (observed === null || observed > reviewed || observed > now ||
        !validSource(c.sourceUrl) || !["pass", "fail", "unknown"].includes(c.state)) continue;
    criterionByCode.set(c.code, c);
  }
  const passed = requirements.filter(k => criterionByCode.get(k)?.state === "pass").length;
  const failed = requirements.filter(k => criterionByCode.get(k)?.state === "fail");
  const missing = requirements.filter(k => !criterionByCode.has(k) || criterionByCode.get(k)?.state === "unknown");
  if (failed.length) return result("blocked", passed, missing, failed, "A documented exclusion or failed requirement blocks the hypothesis.");
  if (passed === requirements.length) {
    return result("criteria_pass_review", passed, [], [], rule.discretion);
  }
  if (passed >= 2) {
    return result("investigate", passed, missing, [], "Partial evidence supports a research watch, not eligibility or a forecast.");
  }
  return result("insufficient", passed, missing, [], "Too few documented conditions; nothing to rank or predict.");
}

/** One hypothesis is shown once even if it has multiple supporting articles. */
export function collapseAnticipation(items: AnticipationHypothesis[], asOf = new Date()) {
  const byKey = new Map<string, AnticipationHypothesis>();
  for (const item of items) {
    const prev = byKey.get(item.hypothesis_key);
    if (!prev || item.last_reviewed_at > prev.last_reviewed_at) byKey.set(item.hypothesis_key, item);
  }
  return [...byKey.values()].map(item => ({ item, assessment: assessAnticipation(item, asOf) }));
}
