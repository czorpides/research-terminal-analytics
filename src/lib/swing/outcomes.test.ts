import assert from "node:assert/strict";
import test from "node:test";

import { evaluateSwingOutcome, type SwingOutcomeBar } from "./outcomes";

const setup = {
  signalDate: "2026-01-02",
  entry: 100,
  target: 110,
  invalidation: 95,
  atr14: 4,
  horizonSessions: 5,
};

function bars(values: Array<[string, number, number, number]>): SwingOutcomeBar[] {
  return values.map(([date, high, low, close]) => ({ date, high, low, close }));
}

test("target hit is classified as a win and target overshoot is retained", () => {
  const result = evaluateSwingOutcome(
    setup,
    bars([
      ["2026-01-03", 104, 98, 103],
      ["2026-01-04", 111, 101, 109],
      ["2026-01-05", 114, 107, 113],
    ]),
  );

  assert.equal(result.status, "target_hit");
  assert.equal(result.targetHitDate, "2026-01-04");
  assert.equal(result.calibrationEligible, true);
  assert.ok((result.targetOvershootPct ?? 0) > 3);
  assert.equal(result.targetBehaviour, "exceeded");
});

test("stop before target is classified as a loss even if price later recovers", () => {
  const result = evaluateSwingOutcome(
    setup,
    bars([
      ["2026-01-03", 103, 94, 96],
      ["2026-01-04", 112, 97, 111],
    ]),
  );

  assert.equal(result.status, "stop_hit");
  assert.equal(result.stopHitDate, "2026-01-03");
  assert.equal(result.targetBehaviour, "missed");
});

test("same-bar target and stop is kept ambiguous rather than guessing ordering", () => {
  const result = evaluateSwingOutcome(
    setup,
    bars([["2026-01-03", 112, 94, 105]]),
  );

  assert.equal(result.status, "ambiguous_same_bar");
  assert.equal(result.calibrationEligible, false);
  assert.equal(result.targetBehaviour, "ambiguous");
});

test("a completed horizon just below target is labelled near miss", () => {
  const result = evaluateSwingOutcome(
    setup,
    bars([
      ["2026-01-03", 104, 98, 102],
      ["2026-01-04", 106, 99, 104],
      ["2026-01-05", 108, 100, 106],
      ["2026-01-06", 109.4, 101, 108],
      ["2026-01-07", 109.3, 103, 109],
    ]),
  );

  assert.equal(result.status, "near_miss");
  assert.equal(result.targetBehaviour, "near_miss");
  assert.equal(result.calibrationEligible, true);
  assert.ok((result.targetShortfallPct ?? 99) < 0.75);
});

test("signal-day high and low are excluded to prevent look-ahead", () => {
  const result = evaluateSwingOutcome(
    setup,
    bars([
      ["2026-01-02", 120, 90, 101],
      ["2026-01-03", 103, 98, 102],
    ]),
  );

  assert.equal(result.status, "active");
  assert.equal(result.sessionsObserved, 1);
  assert.equal(result.targetHitDate, null);
  assert.equal(result.stopHitDate, null);
});
