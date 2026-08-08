import type { InstitutionalAnalysis } from "./institutional-model";
import type { OpportunityCandidate } from "./workspace.functions";

export const FUNDAMENTAL_TIMING_CALC_VERSION = "opportunity.fundamental-timing.v0.1";

export type FundamentalGateState = "pass" | "watch" | "fail" | "missing";
export type FundamentalOpportunityState = "qualified" | "watch" | "risk" | "insufficient";
export type TechnicalTimingState =
  | "confirmed"
  | "basing"
  | "markdown"
  | "extended"
  | "insufficient";

export interface FundamentalGate {
  key: "valuation" | "value_trap" | "quality" | "catalyst";
  label: string;
  state: FundamentalGateState;
  score: number | null;
  coverage: number;
  detail: string;
  positives: string[];
  warnings: string[];
}

export interface FundamentalOpportunityAssessment {
  state: FundamentalOpportunityState;
  score: number;
  coverage: number;
  gates: FundamentalGate[];
  risks: string[];
  warnings: string[];
  calcVersion: string;
}

export interface TechnicalTimingAssessment {
  state: TechnicalTimingState;
  score: number | null;
  entryReady: boolean;
  invalidation: number | null;
  detail: string;
  warnings: string[];
  calcVersion: string;
}

interface TrapCheck {
  label: string;
  state: "pass" | "watch" | "fail" | "missing";
  detail: string;
  severe?: boolean;
}

const GENERIC_LEVERAGE_EXCLUSIONS = new Set(["SEC_FIN", "SEC_RE"]);
const CYCLICAL_INDUSTRIES = new Set(["SEC_ENE", "SEC_MAT"]);

/**
 * Fundamental stage of the Radar: answer "what is genuinely undervalued?"
 * without allowing price momentum or technical recovery to rescue weak economics.
 */
export function assessFundamentalOpportunity(
  candidate: OpportunityCandidate,
  institutional: InstitutionalAnalysis | null,
): FundamentalOpportunityAssessment {
  const valuation = valuationGate(candidate, institutional);
  const trap = valueTrapGate(candidate, institutional);
  const quality = qualityGate(candidate, institutional);
  const catalyst = catalystGate(candidate, institutional);
  const gates = [valuation, trap, quality, catalyst];
  const weights: Record<FundamentalGate["key"], number> = {
    valuation: 35,
    value_trap: 35,
    quality: 20,
    catalyst: 10,
  };
  const available = gates.filter((gate) => gate.score !== null);
  const availableWeight = available.reduce((sum, gate) => sum + weights[gate.key], 0);
  const score = availableWeight
    ? available.reduce((sum, gate) => sum + (gate.score ?? 0) * weights[gate.key], 0) /
      availableWeight
    : 0;
  const coverage = availableWeight;
  const risks = unique([
    ...(institutional?.hardRisks ?? []),
    ...(trap.state === "fail" ? trap.warnings : []),
  ]);
  const warnings = unique(gates.flatMap((gate) => gate.warnings));

  let state: FundamentalOpportunityState;
  if (risks.length || trap.state === "fail" || quality.state === "fail") state = "risk";
  else if (coverage < 40 || trap.state === "missing") state = "insufficient";
  else if (
    score >= 60 &&
    valuation.state !== "fail" &&
    trap.state === "pass" &&
    quality.state !== "fail" &&
    catalyst.state === "pass"
  ) {
    state = "qualified";
  } else {
    state = "watch";
  }

  return {
    state,
    score: round1(state === "risk" ? Math.min(score, 34) : score),
    coverage: round1(coverage),
    gates,
    risks,
    warnings,
    calcVersion: FUNDAMENTAL_TIMING_CALC_VERSION,
  };
}

/**
 * Timing stage of the Radar: answer "has selling pressure actually stopped?"
 * using the currently persisted trend/momentum confirmation. This deliberately
 * does not change the fundamental score.
 *
 * Exact Stage-1 structure (liquidity sweep, ChoC, first higher low, MA50 retest,
 * RSI/MACD divergence and base-low invalidation) is not yet persisted as a
 * dedicated Opportunity score, so this result is intentionally labelled as a
 * confirmation gate rather than an exact entry signal.
 */
export function assessTechnicalTiming(candidate: OpportunityCandidate): TechnicalTimingAssessment {
  const recovery = finite(candidate.evidence.recoveryConfirmation?.value);
  if (recovery === null) {
    return {
      state: "insufficient",
      score: null,
      entryReady: false,
      invalidation: null,
      detail: "Trend and momentum confirmation is not available.",
      warnings: [
        "No base-low invalidation can be defined until the dedicated Stage-1 structure tracker is persisted.",
      ],
      calcVersion: FUNDAMENTAL_TIMING_CALC_VERSION,
    };
  }

  const drawdown = finite(candidate.drawdownPct);
  let state: TechnicalTimingState;
  if (recovery < 32) state = "markdown";
  else if (recovery < 48) state = "basing";
  else if (recovery > 76 && drawdown !== null && drawdown > -8) state = "extended";
  else state = "confirmed";

  const detail =
    state === "markdown"
      ? "Price trend/momentum still looks like markdown; fundamental cheapness is not an entry signal."
      : state === "basing"
        ? "Selling pressure is easing, but current persisted evidence is not strong enough to call the reversal confirmed."
        : state === "extended"
          ? "Technical recovery is strong, but price is already close to its 52-week context; avoid treating momentum strength as a cheap entry."
          : "The existing daily trend/momentum evidence has turned constructive. Treat this as confirmation to investigate the entry, not as a substitute for a Stage-1 base retest.";

  return {
    state,
    score: round1(recovery),
    entryReady: state === "confirmed",
    invalidation: null,
    detail,
    warnings: [
      "Weekly structural bias, liquidity sweep, ChoC, first higher low, MA20/50 slope/retest, divergence and volume-footprint checks are not yet stored as one Opportunity timing record.",
      "The accumulation-base low is not yet persisted, so the Radar does not invent an invalidation price.",
    ],
    calcVersion: FUNDAMENTAL_TIMING_CALC_VERSION,
  };
}

function valuationGate(
  candidate: OpportunityCandidate,
  institutional: InstitutionalAnalysis | null,
): FundamentalGate {
  const peerValuation = finite(candidate.evidence.valuationCompression?.value);
  const fcfYield = metricValue(institutional, "valuation_expectations", "fcf_yield");
  const evEbitda = metricValue(institutional, "valuation_expectations", "ev_ebitda");
  const expectationGap = raw(institutional, "expectationGap");
  const revenueGrowth = raw(institutional, "revenueGrowth");
  const fcfMargin = raw(institutional, "fcfMargin");
  const residualIncome = raw(institutional, "residualIncome");
  const industry = candidate.industryCode ?? "";
  const positives: string[] = [];
  const warnings: string[] = [
    "Historical self-multiple percentiles are not yet stored, so the expert dual-lens valuation test remains incomplete rather than being guessed.",
  ];
  const parts: Array<{ value: number | null; weight: number }> = [];

  if (peerValuation !== null) {
    parts.push({ value: peerValuation, weight: 35 });
    if (peerValuation >= 62) positives.push("Current valuation is attractive relative to tracked peers.");
  }

  if (industry === "SEC_FIN") {
    parts.push({ value: scaleHigher(residualIncome, -0.05, 0.12), weight: 30 });
    warnings.push(
      "Financials still need P/TBV versus ROTCE plus regulatory-capital and asset-quality inputs before sector valuation can fully pass.",
    );
    const score = weighted(parts);
    return gate(
      "valuation",
      "Sector-appropriate valuation",
      score === null ? "missing" : score < 35 ? "fail" : "watch",
      score,
      parts,
      "Financial valuation remains provisional: peer pricing and residual-income evidence are visible, but the P/TBV–ROTCE lens is not complete.",
      positives,
      warnings,
    );
  }

  if (industry === "SEC_TECH") {
    const ruleOf40 =
      revenueGrowth !== null && fcfMargin !== null ? revenueGrowth + fcfMargin : null;
    parts.push({ value: scaleHigher(ruleOf40, 0, 0.4), weight: 35 });
    parts.push({ value: scaleHigher(fcfYield, 0.01, 0.09), weight: 20 });
    parts.push({ value: scaleHigher(expectationGap, -0.08, 0.1), weight: 10 });
    if (ruleOf40 !== null && ruleOf40 >= 0.4) positives.push("Revenue growth plus FCF margin meets the Rule-of-40 threshold.");
    warnings.push("EV/revenue is not yet stored as a dedicated peer and historical series for software valuation.");
  } else if (CYCLICAL_INDUSTRIES.has(industry)) {
    parts.push({ value: scaleHigher(fcfYield, 0, 0.1), weight: 35 });
    parts.push({ value: scaleHigher(expectationGap, -0.1, 0.1), weight: 20 });
    warnings.push(
      "Energy/materials still need a full-cycle normalized earnings series; current low peak-cycle multiples are not treated as proof of cheapness.",
    );
  } else {
    parts.push({ value: scaleLower(evEbitda, 18, 7), weight: 35 });
    parts.push({ value: scaleHigher(fcfYield, 0.01, 0.09), weight: 20 });
    parts.push({ value: scaleHigher(expectationGap, -0.08, 0.1), weight: 10 });
    if (evEbitda !== null && evEbitda <= 8) positives.push("EV/EBITDA is below 8×.");
    if (fcfYield !== null && fcfYield >= 0.06) positives.push("FCF yield provides cash-backed valuation support.");
  }

  const score = weighted(parts);
  const state =
    score === null ? "missing" : score >= 62 && parts.filter((part) => part.value !== null).length >= 2
      ? "pass"
      : score < 35
        ? "fail"
        : "watch";
  return gate(
    "valuation",
    "Sector-appropriate valuation",
    state,
    score,
    parts,
    "Uses the best currently observed sector-relevant valuation evidence while keeping missing historical-self valuation explicit.",
    positives,
    warnings,
  );
}

function valueTrapGate(
  candidate: OpportunityCandidate,
  institutional: InstitutionalAnalysis | null,
): FundamentalGate {
  if (!institutional) {
    return gate(
      "value_trap",
      "Value-trap elimination",
      "missing",
      null,
      [],
      "Multi-period statement evidence is required for the value-trap protocol.",
      [],
      ["Institutional annual-statement analysis is unavailable."],
    );
  }

  const revenueCagr = institutional.periodCount >= 3 ? raw(institutional, "revenueCagr") : null;
  const fcf = raw(institutional, "fcf");
  const positiveFcfYears = raw(institutional, "positiveFcfYears");
  const spread = raw(institutional, "roicWaccSpread");
  const shareCountCagr = raw(institutional, "shareCountCagr");
  const netDebtEbitda = raw(institutional, "netDebtEbitda");
  const interestCoverage = raw(institutional, "interestCoverage");
  const genericLeverage = !GENERIC_LEVERAGE_EXCLUSIONS.has(candidate.industryCode ?? "");

  const checks: TrapCheck[] = [
    thresholdCheck(
      "Revenue trajectory",
      revenueCagr,
      (value) => value >= 0,
      (value) => value >= -0.03,
      (value) => value < -0.08,
      "Multi-year revenue should be stable or growing.",
    ),
    fcfCheck(fcf, positiveFcfYears),
    thresholdCheck(
      "ROIC versus WACC",
      spread,
      (value) => value >= 0.02,
      (value) => value >= 0,
      (value) => value < -0.03,
      "Economic value creation requires ROIC to exceed the modelled cost of capital.",
    ),
    thresholdCheck(
      "Share-count trend",
      shareCountCagr,
      (value) => value <= 0,
      (value) => value <= 0.02,
      (value) => value > 0.08,
      "Persistent dilution can erase apparent per-share undervaluation.",
    ),
    genericLeverage
      ? thresholdCheck(
          "Net debt / EBITDA",
          netDebtEbitda,
          (value) => value < 3,
          (value) => value <= 4,
          (value) => value > 5,
          "Generic operating companies should normally remain below 3× net debt / EBITDA.",
        )
      : missingCheck("Net debt / EBITDA", "Generic leverage is intentionally suppressed for this sector."),
    genericLeverage
      ? thresholdCheck(
          "Interest coverage",
          interestCoverage,
          (value) => value > 5,
          (value) => value >= 2.5,
          (value) => value < 1.5,
          "EBIT interest coverage above 5× provides a stronger margin of safety.",
        )
      : missingCheck("Interest coverage", "Sector-specific capital/liquidity rules are required instead."),
  ];

  const available = checks.filter((check) => check.state !== "missing");
  const failures = available.filter((check) => check.state === "fail");
  const severe = failures.filter((check) => check.severe);
  const passes = available.filter((check) => check.state === "pass");
  const score = available.length
    ? average(available.map((check) => check.state === "pass" ? 90 : check.state === "watch" ? 55 : 15))
    : null;
  const state: FundamentalGateState = !available.length
    ? "missing"
    : severe.length || failures.length >= 2
      ? "fail"
      : passes.length >= Math.min(4, available.length) && failures.length === 0
        ? "pass"
        : "watch";
  const positives = checks.filter((check) => check.state === "pass").map((check) => check.detail);
  const warnings = checks
    .filter((check) => check.state === "watch" || check.state === "fail")
    .map((check) => `${check.label}: ${check.detail}`);

  return gate(
    "value_trap",
    "Value-trap elimination",
    state,
    score,
    available.map((check) => ({ value: check.state === "pass" ? 90 : check.state === "watch" ? 55 : 15, weight: 1 })),
    `${passes.length}/${available.length} available value-trap checks pass; ${failures.length} fail.`,
    positives,
    warnings,
  );
}

function qualityGate(
  candidate: OpportunityCandidate,
  institutional: InstitutionalAnalysis | null,
): FundamentalGate {
  const peerQuality = finite(candidate.evidence.fundamentalResilience?.value);
  const spread = raw(institutional, "roicWaccSpread");
  const incrementalRoic = raw(institutional, "incrementalRoic");
  const marginChange = raw(institutional, "grossMarginChange");
  const positiveFcfYears = raw(institutional, "positiveFcfYears");
  const parts = [
    { value: peerQuality, weight: 25 },
    { value: scaleHigher(spread, -0.03, 0.1), weight: 30 },
    { value: scaleHigher(incrementalRoic, -0.05, 0.2), weight: 20 },
    { value: scaleHigher(marginChange, -0.03, 0.03), weight: 15 },
    { value: scaleHigher(positiveFcfYears, 0.35, 1), weight: 10 },
  ];
  const score = weighted(parts);
  const available = parts.filter((part) => part.value !== null).length;
  const state: FundamentalGateState = score === null
    ? "missing"
    : score >= 62 && available >= 3
      ? "pass"
      : score < 35 && available >= 3
        ? "fail"
        : "watch";
  const positives: string[] = [];
  if (spread !== null && spread > 0) positives.push("ROIC exceeds the modelled WACC.");
  if (marginChange !== null && marginChange >= 0) positives.push("Gross margin is stable or improving, supporting pricing-power resilience.");
  const warnings = [
    "The Radar can observe returns and margin resilience, but the exact moat (switching costs, network effects, scale, regulation or pricing power) still requires analyst identification.",
  ];
  if (marginChange !== null && marginChange < -0.02) warnings.push("Gross margin compression weakens the pricing-power case.");

  return gate(
    "quality",
    "Economic quality & moat proxy",
    state,
    score,
    parts,
    "Economic value creation, incremental returns, cash consistency and margin resilience are used as moat/pricing-power evidence rather than assuming a moat exists.",
    positives,
    warnings,
  );
}

function catalystGate(
  candidate: OpportunityCandidate,
  institutional: InstitutionalAnalysis | null,
): FundamentalGate {
  const cases = new Set(institutional?.researchCases ?? []);
  const catalysts = [
    cases.has("capital_return") ? "Capital return is already material relative to market value." : null,
    cases.has("deleveraging_recovery") ? "Observed deleveraging provides a concrete recovery mechanism." : null,
    cases.has("operational_inflection") ? "Revenue/margin improvement provides an observed operating inflection." : null,
  ].filter((value): value is string => Boolean(value));
  const earnings = finite(candidate.latestEarningsSurprisePct);
  if (catalysts.length) {
    return gate(
      "catalyst",
      "Concrete catalyst",
      "pass",
      80,
      [{ value: 80, weight: 1 }],
      catalysts.join(" "),
      catalysts,
      ["The 6–18 month timing and durability of the catalyst still need filing/guidance validation."],
    );
  }
  if (earnings !== null && earnings > 0) {
    return gate(
      "catalyst",
      "Concrete catalyst",
      "watch",
      55,
      [{ value: 55, weight: 1 }],
      "The latest stored earnings surprise is positive, but a repeatable 6–18 month value-unlock catalyst is not yet identified.",
      [],
      ["A single earnings beat is not treated as a durable catalyst."],
    );
  }
  return gate(
    "catalyst",
    "Concrete catalyst",
    "missing",
    null,
    [],
    "No company-specific 6–18 month catalyst is currently evidenced by the stored statements/events.",
    [],
    ["Valuation alone is not promoted to a qualified opportunity without a concrete catalyst."],
  );
}

function gate(
  key: FundamentalGate["key"],
  label: string,
  state: FundamentalGateState,
  score: number | null,
  parts: Array<{ value: number | null; weight: number }>,
  detail: string,
  positives: string[],
  warnings: string[],
): FundamentalGate {
  const totalWeight = parts.reduce((sum, part) => sum + part.weight, 0);
  const availableWeight = parts
    .filter((part) => part.value !== null)
    .reduce((sum, part) => sum + part.weight, 0);
  return {
    key,
    label,
    state,
    score: score === null ? null : round1(score),
    coverage: totalWeight ? round1((availableWeight / totalWeight) * 100) : 0,
    detail,
    positives: unique(positives),
    warnings: unique(warnings),
  };
}

function thresholdCheck(
  label: string,
  value: number | null,
  pass: (value: number) => boolean,
  watch: (value: number) => boolean,
  severe: (value: number) => boolean,
  detail: string,
): TrapCheck {
  if (value === null) return missingCheck(label, `${detail} Current value is unavailable.`);
  const state = pass(value) ? "pass" : watch(value) ? "watch" : "fail";
  return { label, state, detail: `${detail} Observed value: ${formatNumber(value)}.`, severe: state === "fail" && severe(value) };
}

function fcfCheck(fcf: number | null, positiveFcfYears: number | null): TrapCheck {
  if (fcf === null && positiveFcfYears === null) {
    return missingCheck("Free cash flow", "Current and multi-year FCF evidence is unavailable.");
  }
  const pass = (fcf ?? -1) > 0 && (positiveFcfYears ?? 0) >= 0.67;
  const watch = (fcf ?? -1) > 0 || (positiveFcfYears ?? 0) >= 0.5;
  return {
    label: "Free cash flow",
    state: pass ? "pass" : watch ? "watch" : "fail",
    detail: `Current FCF ${formatNumber(fcf)}; positive across ${formatPercent(positiveFcfYears)} of stored years.`,
    severe: (fcf ?? 0) < 0 && (positiveFcfYears ?? 1) < 0.5,
  };
}

function missingCheck(label: string, detail: string): TrapCheck {
  return { label, state: "missing", detail };
}

function metricValue(
  analysis: InstitutionalAnalysis | null,
  lensKey: string,
  metricId: string,
): number | null {
  return finite(
    analysis?.lenses.find((lens) => lens.key === lensKey)?.metrics.find((metric) => metric.id === metricId)?.value,
  );
}

function raw(analysis: InstitutionalAnalysis | null, key: string): number | null {
  return finite(analysis?.rawMetrics[key]);
}

function weighted(parts: Array<{ value: number | null; weight: number }>): number | null {
  const available = parts.filter((part): part is { value: number; weight: number } => part.value !== null);
  const weight = available.reduce((sum, part) => sum + part.weight, 0);
  if (!weight) return null;
  return available.reduce((sum, part) => sum + part.value * part.weight, 0) / weight;
}

function scaleHigher(value: number | null, bad: number, good: number): number | null {
  if (value === null || good === bad) return null;
  return clamp(((value - bad) / (good - bad)) * 100);
}

function scaleLower(value: number | null, bad: number, good: number): number | null {
  if (value === null || good === bad) return null;
  return clamp(((bad - value) / (bad - good)) * 100);
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatNumber(value: number | null): string {
  if (value === null) return "unavailable";
  return Math.abs(value) < 1 ? `${(value * 100).toFixed(1)}%` : value.toFixed(2);
}

function formatPercent(value: number | null): string {
  return value === null ? "an unavailable share" : `${(value * 100).toFixed(0)}%`;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values.filter(Boolean))];
}
