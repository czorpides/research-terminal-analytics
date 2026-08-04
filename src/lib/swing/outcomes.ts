export type SwingOutcomeStatus =
  | "active"
  | "target_hit"
  | "stop_hit"
  | "near_miss"
  | "expired"
  | "ambiguous_same_bar";

export type SwingTargetBehaviour =
  | "pending"
  | "hit"
  | "exceeded"
  | "near_miss"
  | "missed"
  | "ambiguous";

export interface SwingOutcomeSetup {
  signalDate: string;
  entry: number;
  target: number;
  invalidation: number;
  atr14: number | null;
  horizonSessions?: number;
}

export interface SwingOutcomeBar {
  date: string;
  high: number;
  low: number;
  close: number;
}

export interface SwingOutcomeEvaluation {
  status: SwingOutcomeStatus;
  targetBehaviour: SwingTargetBehaviour;
  resolved: boolean;
  calibrationEligible: boolean;
  sessionsObserved: number;
  targetHitDate: string | null;
  stopHitDate: string | null;
  resolvedDate: string | null;
  maxPrice: number | null;
  minPrice: number | null;
  maxFavourablePct: number | null;
  maxAdversePct: number | null;
  targetOvershootPct: number | null;
  targetShortfallPct: number | null;
  latestReturnPct: number | null;
}

const DEFAULT_HORIZON = 40;

/**
 * Evaluate a swing setup strictly against bars AFTER the signal date. This avoids
 * treating the bar that created the signal as if the trade could already have
 * captured that day's high/low. If target and stop are both crossed in the same
 * daily bar before either has been observed on a prior bar, ordering is unknown
 * and the result is deliberately marked ambiguous rather than guessed.
 */
export function evaluateSwingOutcome(
  setup: SwingOutcomeSetup,
  barsInput: SwingOutcomeBar[],
): SwingOutcomeEvaluation {
  const horizon = clampInteger(setup.horizonSessions ?? DEFAULT_HORIZON, 1, 120);
  const bars = [...barsInput]
    .filter(validBar)
    .filter((bar) => bar.date > setup.signalDate)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, horizon);

  if (!validSetup(setup) || bars.length === 0) {
    return emptyEvaluation();
  }

  let maxPrice = Number.NEGATIVE_INFINITY;
  let minPrice = Number.POSITIVE_INFINITY;
  let firstTargetIndex: number | null = null;
  let firstStopIndex: number | null = null;

  for (let index = 0; index < bars.length; index += 1) {
    const bar = bars[index];
    maxPrice = Math.max(maxPrice, bar.high);
    minPrice = Math.min(minPrice, bar.low);
    if (firstTargetIndex === null && bar.high >= setup.target) firstTargetIndex = index;
    if (firstStopIndex === null && bar.low <= setup.invalidation) firstStopIndex = index;
  }

  const targetHitDate = firstTargetIndex === null ? null : bars[firstTargetIndex].date;
  const stopHitDate = firstStopIndex === null ? null : bars[firstStopIndex].date;
  const horizonComplete = bars.length >= horizon;
  const targetOvershootPct = pct(maxPrice / setup.target - 1);
  const targetShortfallPct = maxPrice < setup.target ? pct(setup.target / maxPrice - 1) : 0;
  const nearTolerancePct = Math.max(
    0.75,
    setup.atr14 !== null && setup.atr14 > 0
      ? (setup.atr14 * 0.25 / setup.target) * 100
      : 0,
  );
  const exceedTolerancePct = Math.max(
    1,
    setup.atr14 !== null && setup.atr14 > 0
      ? (setup.atr14 * 0.5 / setup.target) * 100
      : 0,
  );

  let status: SwingOutcomeStatus = "active";
  let targetBehaviour: SwingTargetBehaviour = "pending";
  let resolvedDate: string | null = null;
  let calibrationEligible = false;

  if (
    firstTargetIndex !== null &&
    firstStopIndex !== null &&
    firstTargetIndex === firstStopIndex
  ) {
    status = "ambiguous_same_bar";
    targetBehaviour = "ambiguous";
    resolvedDate = bars[firstTargetIndex].date;
  } else if (
    firstTargetIndex !== null &&
    (firstStopIndex === null || firstTargetIndex < firstStopIndex)
  ) {
    status = "target_hit";
    targetBehaviour = targetOvershootPct >= exceedTolerancePct ? "exceeded" : "hit";
    resolvedDate = targetHitDate;
    calibrationEligible = true;
  } else if (
    firstStopIndex !== null &&
    (firstTargetIndex === null || firstStopIndex < firstTargetIndex)
  ) {
    status = "stop_hit";
    targetBehaviour = "missed";
    resolvedDate = stopHitDate;
    calibrationEligible = true;
  } else if (horizonComplete) {
    if (targetShortfallPct <= nearTolerancePct) {
      status = "near_miss";
      targetBehaviour = "near_miss";
    } else {
      status = "expired";
      targetBehaviour = "missed";
    }
    resolvedDate = bars.at(-1)?.date ?? null;
    calibrationEligible = true;
  }

  const latestClose = bars.at(-1)?.close ?? null;
  return {
    status,
    targetBehaviour,
    resolved: status !== "active",
    calibrationEligible,
    sessionsObserved: bars.length,
    targetHitDate,
    stopHitDate,
    resolvedDate,
    maxPrice: Number.isFinite(maxPrice) ? round(maxPrice, 6) : null,
    minPrice: Number.isFinite(minPrice) ? round(minPrice, 6) : null,
    maxFavourablePct: Number.isFinite(maxPrice) ? pct(maxPrice / setup.entry - 1) : null,
    maxAdversePct: Number.isFinite(minPrice) ? pct(minPrice / setup.entry - 1) : null,
    targetOvershootPct: Number.isFinite(targetOvershootPct) ? Math.max(0, targetOvershootPct) : null,
    targetShortfallPct: Number.isFinite(targetShortfallPct) ? Math.max(0, targetShortfallPct) : null,
    latestReturnPct: latestClose === null ? null : pct(latestClose / setup.entry - 1),
  };
}

function emptyEvaluation(): SwingOutcomeEvaluation {
  return {
    status: "active",
    targetBehaviour: "pending",
    resolved: false,
    calibrationEligible: false,
    sessionsObserved: 0,
    targetHitDate: null,
    stopHitDate: null,
    resolvedDate: null,
    maxPrice: null,
    minPrice: null,
    maxFavourablePct: null,
    maxAdversePct: null,
    targetOvershootPct: null,
    targetShortfallPct: null,
    latestReturnPct: null,
  };
}

function validSetup(setup: SwingOutcomeSetup): boolean {
  return [setup.entry, setup.target, setup.invalidation].every(
    (value) => Number.isFinite(value) && value > 0,
  ) && setup.target > setup.entry && setup.invalidation < setup.entry;
}

function validBar(bar: SwingOutcomeBar): boolean {
  return [bar.high, bar.low, bar.close].every(
    (value) => Number.isFinite(value) && value > 0,
  ) && bar.high >= Math.max(bar.low, bar.close) && bar.low <= Math.min(bar.high, bar.close);
}

function pct(value: number): number {
  return round(value * 100, 2);
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clampInteger(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, Math.floor(value)));
}
