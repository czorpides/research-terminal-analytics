import assert from "node:assert/strict";
import test from "node:test";

import type { SwingOutcomeBar } from "./outcomes.ts";
import type {
  SwingV21BacktestCase,
  SwingV21CalibrationSignal,
} from "./calibration-v21.ts";
import {
  buildSwingV21WalkForwardWindows,
  defaultSwingV21WalkForwardHypotheses,
  evaluateSwingV21WalkForward,
  type SwingV21WalkForwardHypothesis,
} from "./walk-forward-v21.ts";

function signal(
  signalDate: string,
  overrides: Partial<SwingV21CalibrationSignal> = {},
): SwingV21CalibrationSignal {
  return {
    signalId: `sig:${signalDate}`,
    setup: "deep_mean_reversion",
    entryState: "actionable",
    signalDate,
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

function backtestCase(
  signalDate: string,
  futureBars: SwingOutcomeBar[],
  overrides: Partial<SwingV21CalibrationSignal> = {},
): SwingV21BacktestCase {
  return {
    signal: signal(signalDate, overrides),
    bars: futureBars,
  };
}

const control: SwingV21WalkForwardHypothesis = {
  id: "control",
  label: "Control",
  control: true,
  stopFloorAtr: 0.75,
  entryStates: ["actionable"],
  minimumPlannedRewardRisk: 2,
};

test("builds fixed chronological train-validation-test windows without date overlap", () => {
  const cases = [
    backtestCase("2025-01-15", []),
    backtestCase("2025-06-15", []),
  ];
  const windows = buildSwingV21WalkForwardWindows(cases, {
    trainMonths: 2,
    validationMonths: 1,
    testMonths: 1,
    stepMonths: 1,
    startDate: "2025-01-01",
    endDate: "2025-06-30",
  });

  assert.equal(windows.length, 3);
  assert.deepEqual(windows[0], {
    index: 0,
    train: { startDate: "2025-01-01", endDateExclusive: "2025-03-01" },
    validation: { startDate: "2025-03-01", endDateExclusive: "2025-04-01" },
    test: { startDate: "2025-04-01", endDateExclusive: "2025-05-01" },
  });
  assert.equal(windows[1].test.startDate, "2025-05-01");
  assert.equal(windows[2].test.startDate, "2025-06-01");
  assert.equal(windows[2].test.endDateExclusive, "2025-07-01");
});

test("clips validation outcomes at the validation boundary to prevent future leakage", () => {
  const cases = [
    backtestCase("2025-01-15", bars(["2025-01-16", 110, 100, 109])),
    // This target is hit only after validation ends on 1 March.
    backtestCase("2025-02-28", bars(["2025-03-02", 110, 100, 109])),
    backtestCase("2025-03-15", bars(["2025-03-16", 110, 100, 109])),
  ];
  const report = evaluateSwingV21WalkForward(cases, [control], {
    trainMonths: 1,
    validationMonths: 1,
    testMonths: 1,
    startDate: "2025-01-01",
    endDate: "2025-03-31",
    minimumTrainSample: 1,
    minimumValidationSample: 1,
    minimumTestSample: 1,
  });

  assert.equal(report.windows.length, 1);
  const result = report.windows[0].hypotheses[0];
  assert.equal(result.train.calibrationEligible, 1);
  assert.equal(result.validation.selectedSignals, 1);
  assert.equal(result.validation.calibrationEligible, 0);
  assert.equal(result.validation.unresolved, 1);
  assert.equal(result.selectionEligible, false);
  assert.equal(result.selectionReason, "insufficient_validation_sample");
  assert.equal(report.windows[0].selectedHypothesisId, null);
});

test("selects using train and validation only even when another hypothesis wins the unseen test", () => {
  const tighterStop: SwingV21WalkForwardHypothesis = {
    id: "stop_050",
    label: "0.50 ATR stop",
    stopFloorAtr: 0.5,
    entryStates: ["actionable"],
    minimumPlannedRewardRisk: 2,
  };
  const cases = [
    // 97.5 is above the 0.75 ATR stop (97) but below the 0.50 ATR stop (98).
    // Control therefore reaches target while the tighter stop is ambiguous.
    backtestCase("2025-01-15", bars(["2025-01-16", 110, 97.5, 109])),
    backtestCase("2025-02-15", bars(["2025-02-16", 110, 97.5, 109])),
    // In the unseen test both reach target, but 0.50 ATR earns the higher R multiple.
    backtestCase("2025-03-15", bars(["2025-03-16", 110, 100, 109])),
  ];
  const report = evaluateSwingV21WalkForward(cases, [control, tighterStop], {
    trainMonths: 1,
    validationMonths: 1,
    testMonths: 1,
    startDate: "2025-01-01",
    endDate: "2025-03-31",
    minimumTrainSample: 1,
    minimumValidationSample: 1,
    minimumTestSample: 1,
  });

  const window = report.windows[0];
  assert.equal(window.selectedHypothesisId, "control");
  const controlResult = window.hypotheses.find((row) => row.hypothesisId === "control")!;
  const tighterResult = window.hypotheses.find((row) => row.hypothesisId === "stop_050")!;
  assert.equal(controlResult.validation.averageRealisedR, 3);
  assert.equal(tighterResult.validation.calibrationEligible, 0);
  assert.equal(controlResult.test.averageRealisedR, 3);
  assert.equal(tighterResult.test.averageRealisedR, 4.5);
  assert.equal(window.selectedTest?.averageRealisedR, 3);
});

test("default hypotheses keep production actionability as the control population", () => {
  const hypotheses = defaultSwingV21WalkForwardHypotheses();
  const controlHypothesis = hypotheses.find((row) => row.control);

  assert.equal(controlHypothesis?.stopFloorAtr, 0.75);
  assert.equal(controlHypothesis?.minimumPlannedRewardRisk, 2);
  assert.deepEqual(controlHypothesis?.entryStates, ["actionable"]);
  assert.equal(
    hypotheses.some((row) => (row.minimumPlannedRewardRisk ?? 2) < 2),
    false,
  );
});

test("reports sequential R drawdown and out-of-sample stability without treating it as portfolio drawdown", () => {
  const cases = [
    backtestCase("2025-01-10", bars(["2025-01-11", 110, 100, 109])),
    backtestCase("2025-01-20", bars(["2025-01-21", 101, 96, 97])),
    backtestCase("2025-02-10", bars(["2025-02-11", 110, 100, 109])),
    backtestCase("2025-02-20", bars(["2025-02-21", 101, 96, 97])),
    backtestCase("2025-03-10", bars(["2025-03-11", 110, 100, 109])),
    backtestCase("2025-03-20", bars(["2025-03-21", 101, 96, 97])),
  ];
  const report = evaluateSwingV21WalkForward(cases, [control], {
    trainMonths: 1,
    validationMonths: 1,
    testMonths: 1,
    startDate: "2025-01-01",
    endDate: "2025-03-31",
    minimumTrainSample: 2,
    minimumValidationSample: 2,
    minimumTestSample: 2,
  });

  const testMetrics = report.windows[0].hypotheses[0].test;
  assert.equal(testMetrics.calibrationEligible, 2);
  assert.equal(testMetrics.totalRealisedR, 2);
  assert.equal(testMetrics.averageRealisedR, 1);
  assert.equal(testMetrics.maximumSignalSequenceDrawdownR, 1);

  const stability = report.stabilityByHypothesis[0];
  assert.equal(stability.validatedTestWindows, 1);
  assert.equal(stability.positiveValidatedTestWindows, 1);
  assert.equal(stability.weightedAverageTestR, 1);
  assert.equal(report.selectedStrategy.weightedAverageTestR, 1);
});

test("flags overlapping test windows because stability aggregates can double count signals", () => {
  const cases = [
    backtestCase("2025-01-15", []),
    backtestCase("2025-06-15", []),
  ];
  const report = evaluateSwingV21WalkForward(cases, [control], {
    trainMonths: 1,
    validationMonths: 1,
    testMonths: 2,
    stepMonths: 1,
    startDate: "2025-01-01",
    endDate: "2025-06-30",
    minimumTrainSample: 1,
    minimumValidationSample: 1,
    minimumTestSample: 1,
  });

  assert.equal(
    report.warnings.some((warning) => warning.includes("Test windows overlap")),
    true,
  );
});
