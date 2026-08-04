import assert from "node:assert/strict";
import test from "node:test";

import {
  applyRegimeContext,
  computeSwingTrade,
  regimeScoreForLabel,
  type SwingBar,
  type SwingContext,
} from "../swing/model.ts";

const context: SwingContext = {
  existingMomentum: 72,
  existingTrend: 80,
  existingVolatility: 65,
  ma50: 105,
  ma200: 95,
  hi52: 125,
  quality: 80,
  valuation: 72,
  catalystScore: 82,
  catalystLabel: "Recent EPS surprise +12%",
  catalystRisk: null,
};

function bars(values: number[], lastVolume = 2): SwingBar[] {
  return values.map((close, index) => ({
    date: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
    open: close * 0.994,
    high: close * 1.004,
    low: close * 0.989,
    close,
    volume: index === values.length - 1 ? lastVolume * 1_000_000 : 1_000_000,
  }));
}

function confirmedPullbackBars(): SwingBar[] {
  const values: number[] = [];
  for (let index = 0; index < 50; index++) values.push(100 + index * 0.28);
  for (let index = 0; index < 12; index++) values.push(114 - index * 0.48);
  values.push(108.9, 109.4, 109.8, 110.2, 110.8, 111.4, 112.0, 112.6);
  return bars(values);
}

test("confirmed pullback requires observable structure and produces trade geometry", () => {
  const result = computeSwingTrade(confirmedPullbackBars(), context);
  assert.ok(result);
  assert.equal(result.status, "confirmed");
  assert.equal(result.setup, "pullback_uptrend");
  assert.ok(result.setupScore >= 70);
  assert.ok(result.components.confirmation.score >= 70);
  assert.ok(result.geometry);
  assert.ok(result.geometry.invalidation < result.metrics.current);
  assert.ok(result.geometry.target > result.metrics.current);
});

test("risk-off regime reduces the same setup score versus goldilocks", () => {
  const base = computeSwingTrade(confirmedPullbackBars(), context);
  assert.ok(base);
  const goldilocks = applyRegimeContext(
    base,
    regimeScoreForLabel("goldilocks"),
    "goldilocks",
    true,
  );
  const contraction = applyRegimeContext(
    base,
    regimeScoreForLabel("contraction"),
    "contraction",
    true,
  );
  assert.ok(goldilocks.setupScore > contraction.setupScore);
  assert.ok(contraction.risks.some((risk) => risk.includes("Macro regime")));
});

test("extreme momentum is marked extended rather than promoted as high conviction", () => {
  const values: number[] = [];
  for (let index = 0; index < 55; index++) values.push(100 + index * 0.15);
  for (let index = 0; index < 15; index++) values.push(108 + index * 1.2);
  const result = computeSwingTrade(bars(values, 2.5), context);
  assert.ok(result);
  assert.equal(result.status, "extended");
  assert.equal(result.highConviction, false);
  assert.ok(
    (result.metrics.rsi14 ?? 0) > 74 ||
      (result.metrics.ma20 !== null && result.metrics.current > result.metrics.ma20 * 1.09),
  );
});

test("regime score mapping remains deterministic", () => {
  assert.equal(regimeScoreForLabel("goldilocks"), 85);
  assert.equal(regimeScoreForLabel("contraction"), 20);
  assert.equal(regimeScoreForLabel("insufficient"), 50);
});
