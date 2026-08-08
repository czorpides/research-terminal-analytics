import type { InstitutionalAnalysis } from "./institutional-model";
import type { OpportunityCandidate } from "./workspace.functions";

export const FUNDAMENTAL_TIMING_CALC_VERSION = "opportunity.fundamental-timing.v0.2";

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

interface Stage1Structure {
  state: TechnicalTimingState | null;
  score: number | null;
  invalidation: number | null;
  baseLow: number | null;
  baseLowDate: string | null;
  liquiditySweep: boolean | null;
  chochConfirmed: boolean | null;
  firstHigherLow: boolean | null;
  ma50Reclaimed: boolean | null;
  ma50Retest: boolean | null;
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
    valuation.state === "pass" &&
    trap.state === "pass" &&
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
 * Timing stage: prefer the persisted Stage-1 structure when the candidate
 * workspace supplies it. The legacy trend/momentum blend remains a rollout
 * fallback so a stale score batch cannot take the Radar offline.
 */
export function assessTechnicalTiming(candidate: OpportunityCandidate): TechnicalTimingAssessment {
  const stage1 = stage1Structure(candidate);
  if (stage1.state && stage1.score !== null) {
    const drawdown = finite(candidate.drawdownPct);
    const state: TechnicalTimingState =
      stage1.state === "confirmed" && drawdown !== null && drawdown > -8
        ? "extended"
        : stage1.state;
    const detail =
      state === "confirmed"
        ? `Stage-1 structure is confirmed${stage1.baseLowDate ? ` from the base recorded on ${stage1.baseLowDate}` : ""}: change of character and a first higher low are persisted.`
        : state === "basing"
          ? "The persisted Stage-1 record shows basing evidence, but change-of-character / higher-low confirmation is incomplete."
          : state === "extended"
            ? "Stage-1 recovery is confirmed, but price is already close to its 52-week context; wait for a better risk/reward setup rather than chasing the recovery."
            : "The persisted Stage-1 record still classifies price structure as markdown.";
    const warnings = unique([
      stage1.invalidation !== null
        ? "The displayed invalidation is the observed accumulation-base low, not an execution stop; any trading buffer must be set separately."
        : "No structural invalidation is shown while the persisted Stage-1 state remains markdown/insufficient.",
      stage1.liquiditySweep === false
        ? "No close-confirmed liquidity sweep is present in the current Stage-1 window."
        : "",
    ]);
    return {
      state,
      score: round1(stage1.score),
      entryReady: state === "confirmed",
      invalidation: stage1.invalidation,
      detail,
      warnings,
      calcVersion: FUNDAMENTAL_TIMING_CALC_VERSION,
    };
  }

  const recovery = finite(candidate.evidence.recoveryConfirmation?.value);
  if (recovery === null) {
    return {
      state: "insufficient",
      score: null,
      entryReady: false,
      invalidation: null,
      detail: "Neither persisted Stage-1 structure nor trend/momentum confirmation is available.",
      warnings: ["The timing gate cannot define a structural invalidation without a persisted Stage-1 record."],
      calcVersion: FUNDAMENTAL_TIMING_CALC_VERSION,
    };
  }

  const drawdown = finite(candidate.drawdownPct);
  let state: TechnicalTimingState;
  if (recovery < 32) state = "markdown";
  else if (recovery < 48) state = "basing";
  else if (recovery > 76 && drawdown !== null && drawdown > -8) state = "extended";
  else state = "confirmed";

  return {
    state,
    score: round1(recovery),
    entryReady: state === "confirmed",
    invalidation: null,
    detail:
      state === "markdown"
        ? "Legacy trend/momentum confirmation still looks like markdown; fundamental cheapness is not an entry signal."
        : state === "basing"
          ? "Legacy price evidence is basing, but the Stage-1 score has not yet refreshed."
          : state === "extended"
            ? "Legacy recovery evidence is strong but extended; wait for the persisted Stage-1 refresh before treating it as an entry."
            : "Legacy trend/momentum evidence is constructive, but the dedicated Stage-1 score has not yet refreshed.",
    warnings: [
      "This is a rollout fallback. Re-run technical scoring to populate the dedicated Stage-1 structure and its base-low invalidation.",
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
  const historicalPeriods = raw(institutional, "historicalValuationPeriods");
  const selfEvEbitda = raw(institutional, "selfEvEbitdaPercentile");
  const selfFcfYield = raw(institutional, "selfFcfYieldPercentile");
  const selfEvRevenue = raw(institutional, "selfEvRevenuePercentile");
  const selfPtBv = raw(institutional, "selfPtBvPercentile");
  const evRevenue = raw(institutional, "evRevenue");
  const ptbv = raw(institutional, "priceToTangibleBook");
  const rotce = raw(institutional, "rotce");
  const normalizedEvEbitda = raw(institutional, "normalizedEvEbitda");
  const normalizedFcfYield = raw(institutional, "normalizedFcfYield");
  const industry = candidate.industryCode ?? "";
  const positives: string[] = [];
  const warnings: string[] = [];
  const parts: Array<{ value: number | null; weight: number }> = [];

  if (historicalPeriods === null || historicalPeriods < 5) {
    warnings.push(
      `Own-history valuation needs at least five observed fiscal-year price/statement pairs; ${historicalPeriods === null ? "coverage is unavailable" : `${historicalPeriods.toFixed(0)} are currently usable`}.`,
    );
  }

  if (industry === "SEC_FIN") {
    parts.push({ value: peerValuation, weight: 20 });
    parts.push({ value: selfPtBv, weight: 25 });
    parts.push({ value: scaleLower(ptbv, 3, 0.8), weight: 20 });
    parts.push({ value: scaleHigher(rotce, 0.06, 0.2), weight: 30 });
    parts.push({ value: scaleHigher(residualIncome, -0.05, 0.12), weight: 5 });
    const score = weighted(parts);
    const hasCore = ptbv !== null && rotce !== null;
    const hasDualLens = selfPtBv !== null && peerValuation !== null;
    if (ptbv !== null && ptbv <= 1.2) positives.push("P/TBV is near or below 1.2×.");
    if (rotce !== null && rotce >= 0.12) positives.push("ROTCE is at least 12%, supporting the tangible-book valuation.");
    if (selfPtBv !== null && selfPtBv >= 70) positives.push("P/TBV is cheap versus the company's own observed history.");
    if (!hasCore) warnings.push("Financial valuation requires positive tangible common equity and a usable ROTCE calculation.");
    if (!hasDualLens) warnings.push("Financials remain provisional until both peer valuation and own-history P/TBV are observed.");
    warnings.push("Regulatory capital and asset-quality data remain a separate diligence requirement even when valuation passes.");
    const state: FundamentalGateState =
      score === null
        ? "missing"
        : hasCore && hasDualLens && score >= 62
          ? "pass"
          : hasCore && score < 35
            ? "fail"
            : "watch";
    return gate(
      "valuation",
      "P/TBV versus ROTCE valuation",
      state,
      score,
      parts,
      "Financials are valued on tangible book and ROTCE, cross-checked against peers and the company's own observed P/TBV history.",
      positives,
      warnings,
    );
  }

  if (industry === "SEC_TECH") {
    const ruleOf40 =
      revenueGrowth !== null && fcfMargin !== null ? revenueGrowth + fcfMargin : null;
    const evRevenueScore =
      ruleOf40 === null
        ? null
        : scaleLower(evRevenue, ruleOf40 >= 0.4 ? 12 : 8, ruleOf40 >= 0.4 ? 4 : 2);
    parts.push({ value: peerValuation, weight: 15 });
    parts.push({ value: scaleHigher(ruleOf40, 0, 0.4), weight: 25 });
    parts.push({ value: evRevenueScore, weight: 20 });
    parts.push({ value: selfEvRevenue, weight: 20 });
    parts.push({ value: scaleHigher(fcfYield, 0.01, 0.09), weight: 15 });
    parts.push({ value: scaleHigher(expectationGap, -0.08, 0.1), weight: 5 });
    if (ruleOf40 !== null && ruleOf40 >= 0.4) positives.push("Revenue growth plus FCF margin meets the Rule-of-40 threshold.");
    if (selfEvRevenue !== null && selfEvRevenue >= 70) positives.push("EV/revenue is cheap versus the company's own observed history.");
    if (evRevenue === null) warnings.push("Current EV/revenue cannot be derived from the stored market value and latest annual revenue.");
    const score = weighted(parts);
    const hasDualLens = peerValuation !== null && selfEvRevenue !== null;
    const state: FundamentalGateState =
      score === null
        ? "missing"
        : score >= 62 && hasDualLens && ruleOf40 !== null && evRevenue !== null
          ? "pass"
          : score < 35 && ruleOf40 !== null
            ? "fail"
            : "watch";
    return gate(
      "valuation",
      "Rule-of-40 linked software valuation",
      state,
      score,
      parts,
      "Software valuation links EV/revenue to growth plus FCF margin, then requires both peer and own-history confirmation.",
      positives,
      warnings,
    );
  }

  if (CYCLICAL_INDUSTRIES.has(industry)) {
    parts.push({ value: peerValuation, weight: 20 });
    parts.push({ value: scaleLower(normalizedEvEbitda, 14, 6), weight: 35 });
    parts.push({ value: scaleHigher(normalizedFcfYield, 0.01, 0.09), weight: 25 });
    parts.push({ value: selfFcfYield, weight: 15 });
    parts.push({ value: scaleHigher(expectationGap, -0.1, 0.1), weight: 5 });
    if (normalizedEvEbitda !== null && normalizedEvEbitda <= 8) positives.push("Mid-cycle normalized EV/EBITDA is at or below 8×.");
    if (normalizedFcfYield !== null && normalizedFcfYield >= 0.06) positives.push("Normalized FCF yield provides mid-cycle cash support.");
    if (normalizedEvEbitda === null || normalizedFcfYield === null) {
      warnings.push("Energy/materials require at least five usable annual margins before peak-cycle earnings can be normalized.");
    }
    const score = weighted(parts);
    const hasNormalized = normalizedEvEbitda !== null && normalizedFcfYield !== null;
    const hasSecondLens = peerValuation !== null || selfFcfYield !== null;
    const state: FundamentalGateState =
      score === null
        ? "missing"
        : hasNormalized && hasSecondLens && score >= 62
          ? "pass"
          : hasNormalized && score < 35
            ? "fail"
            : "watch";
    return gate(
      "valuation",
      "Mid-cycle normalized valuation",
      state,
      score,
      parts,
      "Cyclicals are valued on median multi-year operating economics so a low multiple at peak earnings cannot masquerade as cheapness.",
      positives,
      warnings,
    );
  }

  parts.push({ value: peerValuation, weight: 25 });
  parts.push({ value: scaleLower(evEbitda, 18, 7), weight: 25 });
  parts.push({ value: scaleHigher(fcfYield, 0.01, 0.09), weight: 15 });
  parts.push({ value: selfEvEbitda, weight: 20 });
  parts.push({ value: selfFcfYield, weight: 10 });
  parts.push({ value: scaleHigher(expectationGap, -0.08, 0.1), weight: 5 });
  if (peerValuation !== null && peerValuation >= 62) positives.push("Current valuation is attractive relative to tracked peers.");
  if (evEbitda !== null && evEbitda <= 8) positives.push("EV/EBITDA is below 8×.");
  if (fcfYield !== null && fcfYield >= 0.06) positives.push("FCF yield provides cash-backed valuation support.");
  if ((selfEvEbitda ?? 0) >= 70 || (selfFcfYield ?? 0) >= 70) {
    positives.push("At least one cash-backed multiple is cheap versus the company's own observed history.");
  }
  const score = weighted(parts);
  const hasSelfLens = selfEvEbitda !== null || selfFcfYield !== null;
  const hasPeerLens = peerValuation !== null;
  const state: FundamentalGateState =
    score === null
      ? "missing"
      : score >= 62 && hasSelfLens && hasPeerLens
        ? "pass"
        : score < 35 && (evEbitda !== null || fcfYield !== null)
          ? "fail"
          : "watch";
  return gate(
    "valuation",
    "Dual-lens cash-backed valuation",
    state,
    score,
    parts,
    "Generic operating companies must look attractive versus both current peers and their own observed valuation history.",
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
  const rotce = raw(institutional, "rotce");
  const isFinancial = candidate.industryCode === "SEC_FIN";
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
    isFinancial
      ? missingCheck("Free cash flow", "Generic FCF is intentionally suppressed for financial companies.")
      : fcfCheck(fcf, positiveFcfYears),
    isFinancial
      ? thresholdCheck(
          "ROTCE",
          rotce,
          (value) => value >= 0.1,
          (value) => value >= 0.06,
          (value) => value < 0,
          "Financial value creation is tested through return on tangible common equity.",
        )
      : thresholdCheck(
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
  const requiredPasses = isFinancial ? Math.min(3, available.length) : Math.min(4, available.length);
  const state: FundamentalGateState = !available.length
    ? "missing"
    : severe.length || failures.length >= 2
      ? "fail"
      : passes.length >= requiredPasses && failures.length === 0
        ? "pass"
        : "watch";
  const positives = checks.filter((check) => check.state === "pass").map((check) => check.detail);
  const warnings = checks
    .filter((check) => check.state === "watch" || check.state === "fail")
    .map((check) => `${check.label}: ${check.detail}`);
  if (isFinancial) {
    warnings.push("Regulatory capital, funding liquidity and credit/asset quality are not yet automated value-trap checks.");
  }

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
  const rotce = raw(institutional, "rotce");
  const residualIncome = raw(institutional, "residualIncome");
  const isFinancial = candidate.industryCode === "SEC_FIN";
  const parts = isFinancial
    ? [
        { value: peerQuality, weight: 35 },
        { value: scaleHigher(rotce, 0.04, 0.2), weight: 45 },
        { value: scaleHigher(residualIncome, -0.05, 0.12), weight: 20 },
      ]
    : [
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
    : score >= 62 && available >= (isFinancial ? 2 : 3)
      ? "pass"
      : score < 35 && available >= (isFinancial ? 2 : 3)
        ? "fail"
        : "watch";
  const positives: string[] = [];
  if (isFinancial) {
    if (rotce !== null && rotce >= 0.12) positives.push("ROTCE is at least 12%.");
  } else {
    if (spread !== null && spread > 0) positives.push("ROIC exceeds the modelled WACC.");
    if (marginChange !== null && marginChange >= 0) positives.push("Gross margin is stable or improving, supporting pricing-power resilience.");
  }
  const warnings = [
    isFinancial
      ? "Financial quality is based on ROTCE, residual income and peer quality; regulatory capital and asset quality still require separate diligence."
      : "The Radar can observe returns and margin resilience, but the exact moat (switching costs, network effects, scale, regulation or pricing power) still requires analyst identification.",
  ];
  if (!isFinancial && marginChange !== null && marginChange < -0.02) warnings.push("Gross margin compression weakens the pricing-power case.");

  return gate(
    "quality",
    isFinancial ? "Financial economic quality" : "Economic quality & moat proxy",
    state,
    score,
    parts,
    isFinancial
      ? "Financial quality avoids generic industrial ROIC/FCF proxies and instead tests returns on tangible common equity and residual value creation."
      : "Economic value creation, incremental returns, cash consistency and margin resilience are used as moat/pricing-power evidence rather than assuming a moat exists.",
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

function stage1Structure(candidate: OpportunityCandidate): Stage1Structure {
  const record = candidate as OpportunityCandidate & {
    technicalStructure?: {
      state?: unknown;
      score?: unknown;
      invalidation?: unknown;
      baseLow?: unknown;
      baseLowDate?: unknown;
      liquiditySweep?: unknown;
      chochConfirmed?: unknown;
      firstHigherLow?: unknown;
      ma50Reclaimed?: unknown;
      ma50Retest?: unknown;
    };
  };
  const structure = record.technicalStructure;
  if (!structure) {
    return {
      state: null,
      score: null,
      invalidation: null,
      baseLow: null,
      baseLowDate: null,
      liquiditySweep: null,
      chochConfirmed: null,
      firstHigherLow: null,
      ma50Reclaimed: null,
      ma50Retest: null,
    };
  }
  const allowed = new Set<TechnicalTimingState>(["confirmed", "basing", "markdown", "insufficient"]);
  const state =
    typeof structure.state === "string" && allowed.has(structure.state as TechnicalTimingState)
      ? (structure.state as TechnicalTimingState)
      : null;
  return {
    state,
    score: finite(structure.score),
    invalidation: finite(structure.invalidation),
    baseLow: finite(structure.baseLow),
    baseLowDate: typeof structure.baseLowDate === "string" ? structure.baseLowDate : null,
    liquiditySweep: booleanOrNull(structure.liquiditySweep),
    chochConfirmed: booleanOrNull(structure.chochConfirmed),
    firstHigherLow: booleanOrNull(structure.firstHigherLow),
    ma50Reclaimed: booleanOrNull(structure.ma50Reclaimed),
    ma50Retest: booleanOrNull(structure.ma50Retest),
  };
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

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
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
