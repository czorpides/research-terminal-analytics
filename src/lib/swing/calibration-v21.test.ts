import assert from "node:assert/strict";
import test from "node:test";

import {
  compareSwingV21StopFloors,
  evaluateSwingV21CalibrationSignal,
  summarizeSwingV21Calibration,
  type SwingV21CalibrationSignal,
} from "./calibration-v21.ts";
import type { SwingOutcomeBar } from "./outcomes.ts";

function signal(overrides: Partial<SwingV21CalibrationSignal> = {}): SwingV21CalibrationSignal {
  return {
    setup: "deep_mean_reversion",
    entryState: "actionable",
    signalDate: "2026-01-05",
    entry: 100,
    target: 109,
    structuralStop: 99,
    atr14: 4,
    rankingScore: 78,
    entryQuality: 74,
    confirmationCount: 2,
    timeStopSessions: 3,
    ...overrides,
  };
}

function bars(...rows: Array<[string, number, number, number]>): SwingOutcomeBar[] {
  return rows.map(([date, high, low, close]) => ({ date, high, low, close }));
}

test("normalises execution stop to the selected ATR floor", () => {
  const result = evaluateSwingV21CalibrationSignal(
    signal(),
    bars(["2026-01-06", 110, 100, 108]),
    0.75,
  );

  assert.equal(result.executionStop, 97);
  assert.equal(result.riskPerShare, 3);
  assert.equal(result.plannedRewardRisk, 3);
  assert.equal(result.outcome.status, "target_hit");
  assert.equal(result.realisedR, 3);
});

test("records a stop hit as minus one R", () => {
  const result = evaluateSwingV21CalibrationSignal(
    signal({ target: 112 }),
    bars(["2026-01-06", 101, 96.5, 97]),
    0.75,
  );

  assert.equal(result.outcome.status, "stop_hit");
  assert.equal(result.realisedR, -1);
});

test("same-bar target and stop remains ambiguous and calibration-ineligible", () => {
  const result = evaluateSwingV21CalibrationSignal(
    signal(),
    bars(["2026-01-06", 110, 96, 103]),
    0.75,
  );

  assert.equal(result.outcome.status, "ambiguous_same_bar");
  assert.equal(result.outcome.calibrationEligible, false);
  assert.equal(result.realisedR, null);
});

test("time-stop expiry converts the closing return into realised R", () => {
  const result = evaluateSwingV21CalibrationSignal(
    signal({ target: 120, structuralStop: 95, atr14: 2, timeStopSessions: 2 }),
    bars(
      ["2026-01-06", 103, 99, 102],
      ["2026-01-07", 104, 100, 103],
    ),
    0.75,
  );

  assert.equal(result.executionStop, 95);
  assert.equal(result.outcome.status, "expired");
  assert.equal(result.realisedR, 0.6);
});

test("summarises expectancy by setup and score band while excluding ambiguity", () => {
  const win = evaluateSwingV21CalibrationSignal(
    signal({ setup: "trend_pullback", rankingScore: 82, entryQuality: 81 }),
    bars(["2026-01-06", 110, 100, 109]),
  );
  const loss = evaluateSwingV21CalibrationSignal(
    signal({ setup: "trend_pullback", rankingScore: 82, entryQuality: 81 }),
    bars(["2026-01-06", 101, 96, 97]),
  );
  const ambiguous = evaluateSwingV21CalibrationSignal(
    signal({ rankingScore: 65, entryQuality: 65 }),
    bars(["2026-01-06", 110, 96, 101]),
  );

  const summary = summarizeSwingV21Calibration([win, loss, ambiguous], 2);

  assert.equal(summary.totalSignals, 3);
  assert.equal(summary.calibrationEligible, 2);
  assert.equal(summary.ambiguous, 1);
  assert.equal(summary.overall.sampleSize, 2);
  assert.equal(summary.overall.targetHits, 1);
  assert.equal(summary.overall.stopHits, 1);
  assert.equal(summary.overall.averageRealisedR, 1);
  assert.equal(summary.overall.validated, true);

  const trend = summary.bySetup.find((bucket) => bucket.key === "trend_pullback");
  assert.equal(trend?.sampleSize, 2);
  assert.equal(trend?.validated, true);

  const rank80 = summary.byRankingScore.find((bucket) => bucket.key === "rank:80+");
  assert.equal(rank80?.sampleSize, 2);
  assert.equal(rank80?.averageRealisedR, 1);
});

test("event-conditioned pattern keys are tracked as outcome buckets without changing scores", () => {
  const patternKey = "asset:XAUUSD|event:real_yield:falling_fast|setup:commodity_macro";
  const win = evaluateSwingV21CalibrationSignal(
    signal({
      setup: "commodity_macro",
      rankingScore: 61,
      patternKeys: ["asset:XAUUSD", patternKey],
    }),
    bars(["2026-01-06", 110, 100, 109]),
  );
  const loss = evaluateSwingV21CalibrationSignal(
    signal({
      setup: "commodity_macro",
      rankingScore: 44,
      patternKeys: ["asset:XAUUSD", patternKey],
    }),
    bars(["2026-01-06", 101, 96, 97]),
  );

  const summary = summarizeSwingV21Calibration([win, loss], 2);
  const eventBucket = summary.byPattern.find((bucket) => bucket.key === patternKey);

  assert.equal(win.signal.rankingScore, 61);
  assert.equal(loss.signal.rankingScore, 44);
  assert.equal(eventBucket?.sampleSize, 2);
  assert.equal(eventBucket?.targetHits, 1);
  assert.equal(eventBucket?.stopHits, 1);
  assert.equal(eventBucket?.validated, true);
});

test("compares 0.50, 0.75 and 1.00 ATR floors on identical signals", () => {
  const cases = [{
    signal: signal(),
    bars: bars(["2026-01-06", 110, 97.5, 109]),
  }];

  const comparison = compareSwingV21StopFloors(cases, [0.5, 0.75, 1], 1);

  assert.equal(comparison.length, 3);
  assert.equal(comparison[0].summary.stopFloorAtr, 0.5);
  assert.equal(comparison[0].summary.overall.averageRealisedR, null);
  assert.equal(comparison[0].summary.ambiguous, 1);

  assert.equal(comparison[1].summary.stopFloorAtr, 0.75);
  assert.equal(comparison[1].summary.overall.averageRealisedR, 3);

  assert.equal(comparison[2].summary.stopFloorAtr, 1);
  assert.equal(comparison[2].summary.overall.averageRealisedR, 2.25);
});
