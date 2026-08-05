import assert from "node:assert/strict";
import test from "node:test";

import {
  computeSwingTradeV2,
  type SwingV2CatalystContext,
  type SwingV2Context,
} from "./model-v2.ts";
import type { SwingBar } from "./model.ts";

const neutralCatalyst: SwingV2CatalystContext = {
  score: null,
  label: null,
  confidence: 0,
  daysToEarnings: null,
  positiveRevision: false,
  negativeRevision: false,
  reasons: [],
  risks: [],
};

function context(overrides: Partial<SwingV2Context> = {}): SwingV2Context {
  return {
    existingMomentum: 55,
    existingTrend: 62,
    quality: 65,
    valuation: 55,
    catalyst: neutralCatalyst,
    instrumentType: "equity",
    ...overrides,
  };
}

function barsFromCloses(closes: number[], volume = 1_000_000): SwingBar[] {
  return closes.map((close, index) => {
    const previous = index ? closes[index - 1] : close;
    const open = previous * 0.998;
    const high = Math.max(open, close) * 1.008;
    const low = Math.min(open, close) * 0.992;
    const date = new Date(Date.UTC(2025, 0, 2 + index)).toISOString().slice(0, 10);
    return { date, open, high, low, close, volume };
  });
}

function series(length: number, start: number, dailyPct: number): number[] {
  const values = [start];
  for (let index = 1; index < length; index += 1) values.push(values[index - 1] * (1 + dailyPct));
  return values;
}

test("vertical strength near a major high is marked extended instead of actionable", () => {
  const closes = series(220, 70, 0.0024);
  const trade = computeSwingTradeV2(barsFromCloses(closes, 1_600_000), context({ existingTrend: 82, existingMomentum: 85 }));
  assert.ok(trade);
  assert.notEqual(trade.entryState, "actionable");
  assert.ok(trade.chaseRisk >= 50);
});

test("controlled pullback in an established trend can surface as trend pullback", () => {
  const uptrend = series(205, 70, 0.0015);
  const peak = uptrend.at(-1)!;
  const pullback = [
    peak * 0.985,
    peak * 0.97,
    peak * 0.955,
    peak * 0.94,
    peak * 0.93,
    peak * 0.925,
    peak * 0.93,
    peak * 0.938,
    peak * 0.945,
    peak * 0.952,
    peak * 0.958,
    peak * 0.964,
    peak * 0.97,
    peak * 0.976,
    peak * 0.981,
  ];
  const trade = computeSwingTradeV2(barsFromCloses([...uptrend, ...pullback]), context({ existingTrend: 75 }));
  assert.ok(trade);
  assert.ok(["trend_pullback", "sma200_bounce"].includes(trade.setup));
  assert.notEqual(trade.entryState, "extended");
  assert.ok(trade.entryQuality >= 45);
});

test("severely oversold stock with improving momentum is recognised as mean reversion", () => {
  const stable = series(70, 100, 0.0005);
  const selloff = [98, 94, 91, 87, 83, 79, 75, 72, 70, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79];
  const trade = computeSwingTradeV2(barsFromCloses([...stable, ...selloff]), context({ existingTrend: 38 }));
  assert.ok(trade);
  assert.equal(trade.setup, "deep_mean_reversion");
  assert.ok(trade.metrics.rsiMin10 !== null);
  assert.ok(trade.confirmations.some((item) => item.includes("RSI") || item.includes("MACD") || item.includes("Higher")));
});

test("positive forward revisions can turn depressed equity into catalyst repricing candidate", () => {
  const base = series(105, 80, 0.0012);
  const peak = base.at(-1)!;
  const correction = Array.from({ length: 25 }, (_, index) => peak * (1 - 0.006 * (index + 1)));
  const recovery = [correction.at(-1)! * 1.01, correction.at(-1)! * 1.025, correction.at(-1)! * 1.04, correction.at(-1)! * 1.055];
  const catalyst: SwingV2CatalystContext = {
    score: 82,
    label: "FY1 EPS consensus revised higher",
    confidence: 82,
    daysToEarnings: 18,
    positiveRevision: true,
    negativeRevision: false,
    reasons: ["FY1 EPS consensus rose 6.0% versus the prior stored vintage."],
    risks: [],
  };
  const trade = computeSwingTradeV2(barsFromCloses([...base, ...correction, ...recovery]), context({ catalyst, existingTrend: 48 }));
  assert.ok(trade);
  assert.equal(trade.setup, "catalyst_repricing");
  assert.ok(trade.catalystScore > 70);
  assert.ok(trade.reasons.some((reason) => reason.toLowerCase().includes("eps") || reason.toLowerCase().includes("catalyst")));
});

test("earnings inside three days forces event-risk state rather than actionable", () => {
  const base = series(105, 80, 0.0012);
  const peak = base.at(-1)!;
  const correction = Array.from({ length: 20 }, (_, index) => peak * (1 - 0.006 * (index + 1)));
  const recovery = [correction.at(-1)! * 1.01, correction.at(-1)! * 1.02, correction.at(-1)! * 1.03];
  const catalyst: SwingV2CatalystContext = {
    score: 80,
    label: "Positive estimates into earnings",
    confidence: 85,
    daysToEarnings: 2,
    positiveRevision: true,
    negativeRevision: false,
    reasons: ["Forward EPS estimates are rising."],
    risks: [],
  };
  const trade = computeSwingTradeV2(barsFromCloses([...base, ...correction, ...recovery]), context({ catalyst }));
  assert.ok(trade);
  assert.equal(trade.entryState, "event_risk");
});

test("commodity setup combines technical turn with supportive macro context", () => {
  const trend = series(180, 1800, 0.001);
  const peak = trend.at(-1)!;
  const pullback = [peak * 0.99, peak * 0.975, peak * 0.96, peak * 0.945, peak * 0.94, peak * 0.942, peak * 0.948, peak * 0.955, peak * 0.963, peak * 0.972];
  const trade = computeSwingTradeV2(
    barsFromCloses([...trend, ...pullback], 0),
    context({
      instrumentType: "commodity",
      catalyst: neutralCatalyst,
      macro: {
        score: 78,
        label: "Falling real yields and a softer dollar support precious metals",
        available: true,
        reasons: ["US real yields are falling.", "The broad dollar has weakened."],
        risks: [],
      },
    }),
  );
  assert.ok(trade);
  assert.equal(trade.setup, "commodity_macro");
  assert.ok(trade.contextScore >= 70);
});
