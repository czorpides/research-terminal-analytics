export type ExpectationValidationState = "accepted" | "quarantined";
export type ExpectationFreshness = "fresh" | "warn" | "stale" | "missing";

export interface AnalystExpectationSnapshot {
  id: string;
  assetId: string;
  providerCode: string;
  sourceTier: string;
  observedAt: string;
  lastVerifiedAt: string;
  listingCurrency: string | null;
  referencePrice: number | null;
  fy1Date: string | null;
  fy1EpsAvg: number | null;
  fy1EpsLow: number | null;
  fy1EpsHigh: number | null;
  fy1EpsAnalysts: number | null;
  fy1RevenueAvg: number | null;
  fy1RevenueLow: number | null;
  fy1RevenueHigh: number | null;
  fy1RevenueAnalysts: number | null;
  fy2Date: string | null;
  fy2EpsAvg: number | null;
  fy2EpsLow: number | null;
  fy2EpsHigh: number | null;
  fy2EpsAnalysts: number | null;
  fy2RevenueAvg: number | null;
  fy2RevenueLow: number | null;
  fy2RevenueHigh: number | null;
  fy2RevenueAnalysts: number | null;
  targetConsensus: number | null;
  targetMedian: number | null;
  targetHigh: number | null;
  targetLow: number | null;
  targetLastMonthAvg: number | null;
  targetLastMonthCount: number | null;
  targetLastQuarterAvg: number | null;
  targetLastQuarterCount: number | null;
  targetLastYearAvg: number | null;
  targetLastYearCount: number | null;
  targetPublishers: string[];
  validationState: ExpectationValidationState;
  validationReasons: string[];
  confidence: number;
}

export interface SwingExpectationSignal {
  assetId: string;
  freshness: ExpectationFreshness;
  validationState: ExpectationValidationState;
  lastVerifiedAt: string | null;
  observedAt: string | null;
  baselineObservedAt: string | null;
  providerCode: string | null;
  confidence: number;
  score: number;
  adjustment: number;
  strongPositive: boolean;
  blockHighConviction: boolean;
  fy1EpsRevisionPct: number | null;
  fy2EpsRevisionPct: number | null;
  fy1RevenueRevisionPct: number | null;
  targetRevisionPct: number | null;
  targetWindowMomentumPct: number | null;
  targetUpsidePct: number | null;
  targetConsensus: number | null;
  targetLastMonthAvg: number | null;
  targetLastMonthCount: number | null;
  targetLastQuarterAvg: number | null;
  targetLastQuarterCount: number | null;
  fy1EpsAnalysts: number | null;
  fy1RevenueAnalysts: number | null;
  reasons: string[];
  warnings: string[];
}

export interface SwingExpectationsWorkspace {
  asOf: string;
  health: {
    trackedAssets: number;
    freshAssets: number;
    warningAssets: number;
    staleAssets: number;
    quarantinedAssets: number;
    lastVerifiedAt: string | null;
  };
  byAsset: Record<string, SwingExpectationSignal>;
}

const FRESH_MINUTES = 6 * 60;
const WARN_MINUTES = 24 * 60;
const MAX_EXPECTATION_ADJUSTMENT = 7;

export function buildExpectationSignal(
  latest: AnalystExpectationSnapshot | null,
  baseline: AnalystExpectationSnapshot | null,
  nowIso = new Date().toISOString(),
): SwingExpectationSignal {
  if (!latest) return missingSignal();

  const freshness = expectationFreshness(latest.lastVerifiedAt, nowIso);
  const warnings = [...latest.validationReasons];
  if (latest.validationState === "quarantined") {
    warnings.unshift("Latest structured analyst payload failed validation and is quarantined.");
  }
  if (freshness === "warn") warnings.push("Analyst expectation evidence is aging and should be refreshed.");
  if (freshness === "stale") warnings.push("Analyst expectation evidence is stale and is excluded from conviction.");

  const fy1EpsRevisionPct = samePeriodRevision(
    latest.fy1Date,
    latest.fy1EpsAvg,
    baseline?.fy1Date ?? null,
    baseline?.fy1EpsAvg ?? null,
  );
  const fy2EpsRevisionPct = samePeriodRevision(
    latest.fy2Date,
    latest.fy2EpsAvg,
    baseline?.fy2Date ?? null,
    baseline?.fy2EpsAvg ?? null,
  );
  const fy1RevenueRevisionPct = samePeriodRevision(
    latest.fy1Date,
    latest.fy1RevenueAvg,
    baseline?.fy1Date ?? null,
    baseline?.fy1RevenueAvg ?? null,
  );
  const targetRevisionPct = revisionPct(latest.targetConsensus, baseline?.targetConsensus ?? null);
  const targetWindowMomentumPct =
    enoughTargetBreadth(latest)
      ? revisionPct(latest.targetLastMonthAvg, latest.targetLastQuarterAvg)
      : null;
  const targetUpsidePct = revisionPct(latest.targetConsensus, latest.referencePrice);

  const usable = latest.validationState === "accepted" && freshness !== "stale";
  const reasons: string[] = [];
  let adjustment = 0;

  if (usable) {
    const eps1 = contribution(fy1EpsRevisionPct, 10, 3.0);
    const eps2 = contribution(fy2EpsRevisionPct, 12, 1.6);
    const revenue = contribution(fy1RevenueRevisionPct, 8, 1.2);
    const targetRevision = contribution(targetRevisionPct, 15, 2.5);
    const targetMomentum = contribution(targetWindowMomentumPct, 12, 1.6);
    const targetGap = targetGapContribution(targetUpsidePct, latest.targetLastMonthCount);
    adjustment = clamp(
      eps1 + eps2 + revenue + targetRevision + targetMomentum + targetGap,
      -MAX_EXPECTATION_ADJUSTMENT,
      MAX_EXPECTATION_ADJUSTMENT,
    );

    if (fy1EpsRevisionPct !== null && Math.abs(fy1EpsRevisionPct) >= 2) {
      reasons.push(`FY1 EPS consensus ${direction(fy1EpsRevisionPct)} ${Math.abs(fy1EpsRevisionPct).toFixed(1)}% versus the stored prior vintage.`);
    }
    if (fy2EpsRevisionPct !== null && Math.abs(fy2EpsRevisionPct) >= 2) {
      reasons.push(`FY2 EPS consensus ${direction(fy2EpsRevisionPct)} ${Math.abs(fy2EpsRevisionPct).toFixed(1)}%.`);
    }
    if (fy1RevenueRevisionPct !== null && Math.abs(fy1RevenueRevisionPct) >= 2) {
      reasons.push(`FY1 revenue consensus ${direction(fy1RevenueRevisionPct)} ${Math.abs(fy1RevenueRevisionPct).toFixed(1)}%.`);
    }
    if (targetRevisionPct !== null && Math.abs(targetRevisionPct) >= 3) {
      reasons.push(`Consensus price target ${direction(targetRevisionPct)} ${Math.abs(targetRevisionPct).toFixed(1)}% versus the stored prior vintage.`);
    }
    if (targetWindowMomentumPct !== null && Math.abs(targetWindowMomentumPct) >= 3) {
      reasons.push(`Recent one-month average target is ${targetWindowMomentumPct >= 0 ? "above" : "below"} the last-quarter average by ${Math.abs(targetWindowMomentumPct).toFixed(1)}%.`);
    }
    if (targetUpsidePct !== null && targetUpsidePct >= 10) {
      reasons.push(`Current consensus target sits ${targetUpsidePct.toFixed(1)}% above the reference price.`);
    }
  }

  const confidence = clamp(latest.confidence, 0, 100);
  // Fresh but thin evidence can rank, but it is deliberately damped.
  const reliability = confidence < 40 ? 0 : confidence < 60 ? 0.5 : confidence < 75 ? 0.75 : 1;
  adjustment = round(adjustment * reliability, 2);

  const blockHighConviction =
    usable && confidence >= 55 && (
      (fy1EpsRevisionPct !== null && fy1EpsRevisionPct <= -8) ||
      (targetRevisionPct !== null && targetRevisionPct <= -12 && (latest.targetLastMonthCount ?? 0) >= 3)
    );
  if (blockHighConviction) {
    warnings.push("Material negative analyst revisions block the High Conviction label until the evidence improves or becomes stale.");
  }

  const score = round(clamp(50 + adjustment * 7, 0, 100), 1);
  return {
    assetId: latest.assetId,
    freshness,
    validationState: latest.validationState,
    lastVerifiedAt: latest.lastVerifiedAt,
    observedAt: latest.observedAt,
    baselineObservedAt: baseline?.observedAt ?? null,
    providerCode: latest.providerCode,
    confidence,
    score,
    adjustment,
    strongPositive: usable && confidence >= 60 && adjustment >= 3,
    blockHighConviction,
    fy1EpsRevisionPct,
    fy2EpsRevisionPct,
    fy1RevenueRevisionPct,
    targetRevisionPct,
    targetWindowMomentumPct,
    targetUpsidePct,
    targetConsensus: latest.targetConsensus,
    targetLastMonthAvg: latest.targetLastMonthAvg,
    targetLastMonthCount: latest.targetLastMonthCount,
    targetLastQuarterAvg: latest.targetLastQuarterAvg,
    targetLastQuarterCount: latest.targetLastQuarterCount,
    fy1EpsAnalysts: latest.fy1EpsAnalysts,
    fy1RevenueAnalysts: latest.fy1RevenueAnalysts,
    reasons,
    warnings,
  };
}

export function expectationFreshness(lastVerifiedAt: string, nowIso = new Date().toISOString()): ExpectationFreshness {
  const observed = new Date(lastVerifiedAt).getTime();
  const now = new Date(nowIso).getTime();
  if (!Number.isFinite(observed) || !Number.isFinite(now)) return "stale";
  const ageMinutes = Math.max(0, (now - observed) / 60_000);
  if (ageMinutes <= FRESH_MINUTES) return "fresh";
  if (ageMinutes <= WARN_MINUTES) return "warn";
  return "stale";
}

function missingSignal(): SwingExpectationSignal {
  return {
    assetId: "",
    freshness: "missing",
    validationState: "accepted",
    lastVerifiedAt: null,
    observedAt: null,
    baselineObservedAt: null,
    providerCode: null,
    confidence: 0,
    score: 50,
    adjustment: 0,
    strongPositive: false,
    blockHighConviction: false,
    fy1EpsRevisionPct: null,
    fy2EpsRevisionPct: null,
    fy1RevenueRevisionPct: null,
    targetRevisionPct: null,
    targetWindowMomentumPct: null,
    targetUpsidePct: null,
    targetConsensus: null,
    targetLastMonthAvg: null,
    targetLastMonthCount: null,
    targetLastQuarterAvg: null,
    targetLastQuarterCount: null,
    fy1EpsAnalysts: null,
    fy1RevenueAnalysts: null,
    reasons: [],
    warnings: ["No validated analyst expectation snapshot is available yet."],
  };
}

function samePeriodRevision(
  currentDate: string | null,
  currentValue: number | null,
  priorDate: string | null,
  priorValue: number | null,
): number | null {
  if (!currentDate || !priorDate || currentDate !== priorDate) return null;
  return revisionPct(currentValue, priorValue);
}

function revisionPct(current: number | null, prior: number | null): number | null {
  if (current === null || prior === null || !Number.isFinite(current) || !Number.isFinite(prior)) return null;
  if (Math.abs(prior) < 0.05) return null;
  // Percentage revisions across an EPS sign change are economically ambiguous;
  // do not manufacture a huge percentage from a near-zero denominator.
  if (current * prior < 0) return null;
  return round((current / prior - 1) * 100, 2);
}

function contribution(value: number | null, fullScalePct: number, maxPoints: number): number {
  if (value === null) return 0;
  return clamp(value / fullScalePct, -1, 1) * maxPoints;
}

function targetGapContribution(upsidePct: number | null, breadth: number | null): number {
  if (upsidePct === null || (breadth ?? 0) < 3) return 0;
  if (upsidePct >= 35) return 0.8;
  if (upsidePct >= 20) return 0.6;
  if (upsidePct >= 10) return 0.3;
  if (upsidePct <= -20) return -0.6;
  return 0;
}

function enoughTargetBreadth(snapshot: AnalystExpectationSnapshot): boolean {
  return (snapshot.targetLastMonthCount ?? 0) >= 3 && (snapshot.targetLastQuarterCount ?? 0) >= 5;
}

function direction(value: number): string {
  return value >= 0 ? "rose" : "fell";
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
