import assert from "node:assert/strict";
import test from "node:test";

import { empiricalOverlayForSignal, type SwingLearningSignal } from "./learning.ts";
import type { SwingComponents } from "./model";

function components(): SwingComponents {
  const item = (score: number, available = true) => ({
    score,
    value: String(score),
    detail: "test",
    available,
  });
  return {
    momentum: item(72),
    rsi: item(70),
    location: item(76),
    volume: item(75),
    volatility: item(65),
    confirmation: item(80),
    regime: item(70),
    catalyst: item(60),
  };
}

const signal: SwingLearningSignal = {
  setupType: "pullback_uptrend",
  setupScore: 82,
  highConviction: true,
  components: components(),
  metrics: { rsi14: 46, relativeVolume20: 1.6 },
};

test("empirical overlay stays off before minimum sample", () => {
  const result = empiricalOverlayForSignal(
    signal,
    [{ key: "confirmation:70", label: "Confirmation 70+", sampleSize: 29, wins: 22, hitRate: 75.9, validated: false }],
    55,
  );
  assert.equal(result.active, false);
  assert.equal(result.adjustment, 0);
  assert.equal(result.expectationsAdjustment, 0);
  assert.equal(result.rankScore, 82);
});

test("validated favourable evidence modestly increases rank without rewriting raw score", () => {
  const result = empiricalOverlayForSignal(
    signal,
    [
      { key: "confirmation:70", label: "Confirmation 70+", sampleSize: 60, wins: 42, hitRate: 70, validated: true },
      { key: "relvol:1.2", label: "Relative volume 1.2x+", sampleSize: 80, wins: 56, hitRate: 70, validated: true },
    ],
    55,
  );
  assert.equal(result.active, true);
  assert.ok(result.adjustment > 0);
  assert.ok(result.adjustment <= 5);
  assert.equal(signal.setupScore, 82);
  assert.equal(result.rankScore, 82 + result.adjustment);
});

test("poor validated evidence can reduce ranking but is capped", () => {
  const result = empiricalOverlayForSignal(
    signal,
    [
      { key: "high_conviction", label: "High Conviction", sampleSize: 400, wins: 80, hitRate: 20, validated: true },
      { key: "setup:pullback_uptrend", label: "Pullback", sampleSize: 500, wins: 100, hitRate: 20, validated: true },
    ],
    60,
  );
  assert.ok(result.adjustment < 0);
  assert.ok(result.adjustment >= -5);
});

test("fresh analyst expectations can move conviction rank even before empirical calibration", () => {
  const withExpectations: SwingLearningSignal = {
    ...signal,
    metrics: { ...signal.metrics, expectationsAdjustment: 4.25 },
  };
  const result = empiricalOverlayForSignal(withExpectations, [], null);
  assert.equal(result.active, false);
  assert.equal(result.adjustment, 0);
  assert.equal(result.expectationsAdjustment, 4.25);
  assert.equal(result.totalAdjustment, 4.25);
  assert.equal(result.rankScore, 86.25);
  assert.equal(withExpectations.setupScore, 82);
});
