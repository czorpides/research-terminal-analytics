import type {
  SwingV2Workspace,
  SwingV2WorkspaceCandidate,
} from "./workspace-v2.functions";

const MINIMUM_STOP_ATR = 0.75;
const EXTREME_63D_DRAWDOWN_PCT = -85;
const EQUITY_REVERSAL_SETUPS = new Set([
  "deep_mean_reversion",
  "sma200_bounce",
  "catalyst_repricing",
]);

/**
 * Defensive presentation/runtime layer for the v2.1 shadow workspace.
 *
 * The underlying v2/v2.1 model remains unchanged so its point-in-time control
 * history stays auditable. This layer only prevents three failure modes seen in
 * the live diagnostic sample from being presented as Actionable:
 *   1) counter-trend longs without an actual turn confirmation;
 *   2) reward/risk inflated by a hard stop inside ordinary ATR noise;
 *   3) extreme 63-day discontinuities that are either unadjusted corporate
 *      actions or genuine collapses unsuitable for a routine swing-long screen.
 */
export function hardenSwingV2Workspace(workspace: SwingV2Workspace): SwingV2Workspace {
  let extremeDiscontinuities = 0;
  let widenedStops = 0;
  let reversalDowngrades = 0;
  let rewardRiskDowngrades = 0;

  const candidates = workspace.candidates.flatMap((candidate) => {
    if (isExtremeDiscontinuity(candidate)) {
      extremeDiscontinuities += 1;
      return [];
    }

    const result = hardenCandidate(candidate);
    if (result.stopWidened) widenedStops += 1;
    if (result.reversalDowngraded) reversalDowngrades += 1;
    if (result.rewardRiskDowngraded) rewardRiskDowngrades += 1;
    return [result.candidate];
  });

  candidates.sort((left, right) =>
    right.setup.rankingScore - left.setup.rankingScore ||
    right.setup.entryQuality - left.setup.entryQuality ||
    right.setup.technicalScore - left.setup.technicalScore,
  );

  const warnings = [...workspace.warnings];
  if (extremeDiscontinuities > 0) {
    warnings.push(
      `Defensive guard excluded ${extremeDiscontinuities} surfaced candidate${extremeDiscontinuities === 1 ? "" : "s"} with a 63-day drawdown beyond ${Math.abs(EXTREME_63D_DRAWDOWN_PCT)}%; these are treated as corporate-action/discontinuity or collapse risks, not normal swing dislocations.`,
    );
  }
  if (widenedStops > 0) {
    warnings.push(
      `Defensive guard widened ${widenedStops} hard stop${widenedStops === 1 ? "" : "s"} to at least ${MINIMUM_STOP_ATR.toFixed(2)} ATR before recalculating reward/risk and position size.`,
    );
  }
  if (reversalDowngrades > 0) {
    warnings.push(
      `Defensive guard downgraded ${reversalDowngrades} counter-trend Actionable setup${reversalDowngrades === 1 ? "" : "s"} that lacked a higher low, moving-average reclaim, bullish divergence, confirmed volume turn or rejection trigger.`,
    );
  }
  if (rewardRiskDowngrades > 0) {
    warnings.push(
      `Defensive guard downgraded ${rewardRiskDowngrades} Actionable setup${rewardRiskDowngrades === 1 ? "" : "s"} after ATR-normalised reward/risk fell below the 2.0x Actionable floor.`,
    );
  }

  return {
    ...workspace,
    calibration: {
      ...workspace.calibration,
      note: `${workspace.calibration.note} Live presentation additionally applies defensive v2.1 guards for confirmed reversal evidence, a 0.75-ATR minimum hard-stop distance and extreme price discontinuities. These guards remain shadow hypotheses pending realised-outcome calibration.`,
    },
    universe: {
      ...workspace.universe,
      surfaced: candidates.length,
      actionable: candidates.filter((candidate) => candidate.setup.entryState === "actionable").length,
      developing: candidates.filter((candidate) => candidate.setup.entryState === "developing").length,
      eventRisk: candidates.filter((candidate) => candidate.setup.entryState === "event_risk").length,
      extended: candidates.filter((candidate) => candidate.setup.entryState === "extended").length,
    },
    candidates,
    methodology: `${workspace.methodology} A defensive v2.1 presentation layer additionally requires explicit turn evidence for counter-trend Actionable equities, calculates execution R/R using a minimum hard-stop distance of 0.75 ATR, and excludes >85% 63-day discontinuities from the surfaced list.`,
    warnings: unique(warnings).slice(0, 20),
  };
}

function hardenCandidate(candidate: SwingV2WorkspaceCandidate): {
  candidate: SwingV2WorkspaceCandidate;
  stopWidened: boolean;
  reversalDowngraded: boolean;
  rewardRiskDowngraded: boolean;
} {
  const setup = candidate.setup;
  const discipline = setup.discipline;
  const originalRiskPlan = discipline.riskPlan;
  const current = setup.metrics.current;
  const atr = setup.metrics.atr14;
  const target = originalRiskPlan.target;
  const originalStop = originalRiskPlan.hardStop;

  let stopWidened = false;
  let adjustedStop = originalStop;
  let adjustedRewardRisk = originalRiskPlan.rewardRisk;
  let adjustedRiskPerShare = originalRiskPlan.riskPerShare;

  if (
    atr !== null &&
    atr > 0 &&
    originalStop !== null &&
    originalStop > 0 &&
    originalStop < current
  ) {
    const minimumNoiseStop = current - MINIMUM_STOP_ATR * atr;
    if (minimumNoiseStop > 0 && originalStop > minimumNoiseStop) {
      adjustedStop = minimumNoiseStop;
      stopWidened = true;
    }
  }

  if (adjustedStop !== null && adjustedStop > 0 && adjustedStop < current) {
    adjustedRiskPerShare = current - adjustedStop;
    adjustedRewardRisk = target !== null && target > current && adjustedRiskPerShare > 0
      ? (target - current) / adjustedRiskPerShare
      : null;
  }

  const originalRr = originalRiskPlan.rewardRisk;
  const roundedRr = adjustedRewardRisk === null ? null : round(adjustedRewardRisk, 2);
  const riskPlan = {
    ...originalRiskPlan,
    hardStop: adjustedStop === null ? null : round(adjustedStop, 6),
    rewardRisk: roundedRr,
    riskPerShare: adjustedRiskPerShare === null ? null : round(adjustedRiskPerShare, 6),
  };

  let entryState = setup.entryState;
  let entryQuality = setup.entryQuality;
  let rankingScore = setup.rankingScore;
  const reasons = setup.reasons.filter((reason) => !reason.startsWith("Structural reward/risk is"));
  const risks = setup.risks.filter((risk) => !risk.startsWith("Structural reward/risk is only"));

  if (stopWidened) {
    risks.unshift(
      `Execution hard stop widened to the ${MINIMUM_STOP_ATR.toFixed(2)} ATR noise floor before calculating R/R and position size.`,
    );
  }

  const oldRrContribution = rewardRiskContribution(originalRr);
  const newRrContribution = rewardRiskContribution(roundedRr);
  entryQuality += newRrContribution.entry - oldRrContribution.entry;
  rankingScore += newRrContribution.rank - oldRrContribution.rank;

  if (roundedRr !== null) {
    if (roundedRr >= 2) {
      reasons.push(`ATR-normalised structural reward/risk is ${roundedRr.toFixed(2)}x.`);
    } else if (roundedRr >= 1.5) {
      risks.push(`ATR-normalised reward/risk is only ${roundedRr.toFixed(2)}x; Actionable requires at least 2.0x.`);
    } else {
      risks.push(`ATR-normalised reward/risk is only ${roundedRr.toFixed(2)}x and is not attractive enough for entry.`);
    }
  }

  const rewardRiskDowngraded =
    entryState === "actionable" &&
    (roundedRr === null || roundedRr < originalRiskPlan.minimumActionableRewardRisk);
  if (rewardRiskDowngraded) {
    entryState = "developing";
    entryQuality -= 6;
    rankingScore -= 6;
  }

  const reversalNeedsTurn =
    candidate.assetType === "equity" &&
    EQUITY_REVERSAL_SETUPS.has(setup.setup);
  const hasTurnConfirmation =
    setup.metrics.higherLow ||
    setup.metrics.ma20Reclaim ||
    setup.metrics.sma200Reclaim ||
    discipline.bullishRsiDivergence ||
    discipline.bullishMacdDivergence ||
    discipline.volumeTurnConfirmed ||
    discipline.rejectionTrigger;
  const reversalDowngraded =
    entryState === "actionable" && reversalNeedsTurn && !hasTurnConfirmation;
  if (reversalDowngraded) {
    entryState = "developing";
    entryQuality -= 10;
    rankingScore -= 10;
    risks.unshift(
      "Counter-trend setup is still waiting for a structural turn: require a higher low, moving-average reclaim, bullish divergence, confirmed volume turn or rejection trigger before Actionable status.",
    );
  }

  return {
    candidate: {
      ...candidate,
      setup: {
        ...setup,
        entryState,
        entryQuality: round(clamp(entryQuality), 1),
        rankingScore: round(clamp(rankingScore), 1),
        reasons: unique(reasons).slice(0, 10),
        risks: unique(risks).slice(0, 10),
        discipline: {
          ...discipline,
          riskPlan,
        },
      },
    },
    stopWidened,
    reversalDowngraded,
    rewardRiskDowngraded,
  };
}

function isExtremeDiscontinuity(candidate: SwingV2WorkspaceCandidate): boolean {
  const drawdown = candidate.setup.metrics.drawdown63Pct;
  return drawdown !== null && drawdown <= EXTREME_63D_DRAWDOWN_PCT;
}

function rewardRiskContribution(rr: number | null): { entry: number; rank: number } {
  if (rr === null) return { entry: 0, rank: 0 };
  if (rr >= 3) return { entry: 5, rank: 4 };
  if (rr >= 2) return { entry: 0, rank: 0 };
  if (rr >= 1.5) return { entry: -5, rank: -4 };
  return { entry: -14, rank: -10 };
}

function clamp(value: number, low = 0, high = 100): number {
  return Math.max(low, Math.min(high, value));
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
