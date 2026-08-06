import assert from "node:assert/strict";
import test from "node:test";

import {
  computeSwingTradeV2,
  SWING_V2_MODEL_VERSION,
  type SwingV2CatalystContext,
  type SwingV2Context,
} from "./model-v21.ts";
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
    existingTrend: 65,
    quality: 50,
    valuation: 50,
    catalyst: neutralCatalyst,
    instrumentType: "equity",
    ...overrides,
  };
}

function series(length: number, start: number, dailyPct: number): number[] {
  const values = [start];
  for (let index = 1; index < length; index += 1) values.push(values[index - 1] * (1 + dailyPct));
  return values;
}

function businessBarsFromCloses(closes: number[], volume = 1_500_000): SwingBar[] {
  const bars: SwingBar[] = [];
  const date = new Date(Date.UTC(2024, 0, 2));
  for (let index = 0; index < closes.length; index += 1) {
    while (date.getUTCDay() === 0 || date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() + 1);
    const close = closes[index];
    const previous = index ? closes[index - 1] : close;
    const open = previous * 0.998;
    const high = Math.max(open, close) * 1.01;
    const low = Math.min(open, close) * 0.99;
    bars.push({
      date: date.toISOString().slice(0, 10),
      open,
      high,
      low,
      close,
      volume,
    });
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return bars;
}

function pullbackSeries(): number[] {
  const trend = series(270, 70, 0.0012);
  const peak = trend.at(-1)!;
  return [
    ...trend,
    peak * 0.99,
    peak * 0.978,
    peak * 0.965,
    peak * 0.952,
    peak * 0.94,
    peak * 0.932,
    peak * 0.928,
    peak * 0.933,
    peak * 0.94,
    peak * 0.948,
    peak * 0.956,
    peak * 0.964,
    peak * 0.972,
    peak * 0.98,
  ];
}

test("v2.1 exposes weekly, ADX and execution risk-plan evidence", () => {
  const trade = computeSwingTradeV2(businessBarsFromCloses(pullbackSeries()), context());
  assert.ok(trade);
  assert.equal(trade.modelVersion, SWING_V2_MODEL_VERSION);
  assert.equal(trade.discipline.riskPlan.minimumActionableRewardRisk, 2);
  assert.ok(trade.discipline.weeklyMa20 !== null);
  assert.ok(trade.discipline.adx14 !== null);
  assert.ok(trade.discipline.riskPlan.expectedHoldingSessions[0] > 0);
  assert.ok(trade.discipline.riskPlan.timeStopSessions >= trade.discipline.riskPlan.expectedHoldingSessions[1]);
  assert.ok(trade.discipline.riskPlan.thesisInvalidationRule.length > 20);
});

test("long-term valuation and quality no longer change the Swing v2.1 result", () => {
  const bars = businessBarsFromCloses(pullbackSeries());
  const expensive = computeSwingTradeV2(bars, context({ quality: 100, valuation: 100 }));
  const cheap = computeSwingTradeV2(bars, context({ quality: 0, valuation: 0 }));
  assert.ok(expensive);
  assert.ok(cheap);
  assert.equal(expensive.setup, cheap.setup);
  assert.equal(expensive.technicalScore, cheap.technicalScore);
  assert.equal(expensive.entryQuality, cheap.entryQuality);
  assert.equal(expensive.rankingScore, cheap.rankingScore);
});

test("illiquid equities cannot become Actionable", () => {
  const trade = computeSwingTradeV2(businessBarsFromCloses(pullbackSeries(), 5_000), context());
  assert.ok(trade);
  assert.equal(trade.discipline.liquidityState, "fail");
  assert.equal(trade.discipline.tradeable, false);
  assert.notEqual(trade.entryState, "actionable");
});

test("Actionable status requires at least 2x structural reward-risk", () => {
  const trade = computeSwingTradeV2(businessBarsFromCloses(pullbackSeries()), context());
  assert.ok(trade);
  const rr = trade.discipline.riskPlan.rewardRisk;
  if (trade.entryState === "actionable") {
    assert.ok(rr !== null && rr >= 2);
    assert.equal(trade.discipline.tradeable, true);
    assert.equal(trade.discipline.middleOfRange, false);
  }
  if (rr !== null && rr < 2) assert.notEqual(trade.entryState, "actionable");
});

test("volume contraction followed by reversal expansion is captured as trigger evidence", () => {
  const bars = businessBarsFromCloses(pullbackSeries());
  const start = Math.max(0, bars.length - 26);
  for (let index = start; index < bars.length - 6; index += 1) bars[index].volume = 1_500_000;
  for (let index = bars.length - 6; index < bars.length - 1; index += 1) bars[index].volume = 650_000;
  bars[bars.length - 1].volume = 1_600_000;

  const trade = computeSwingTradeV2(bars, context());
  assert.ok(trade);
  assert.equal(trade.discipline.volumeContraction, true);
  assert.equal(trade.discipline.volumeExpansion, true);
  assert.equal(trade.discipline.volumeTurnConfirmed, true);
  assert.ok(trade.confirmations.some((item) => item.toLowerCase().includes("volume")));
});

test("precious-metal spot setups do not pretend provider volume is a central liquidity gate", () => {
  const closes = pullbackSeries().map((value) => value * 25);
  const trade = computeSwingTradeV2(
    businessBarsFromCloses(closes, 0),
    context({
      instrumentType: "commodity",
      macro: {
        score: 75,
        label: "Supportive precious-metals macro backdrop",
        available: true,
        reasons: ["Real yields are falling.", "The broad dollar is softer."],
        risks: [],
      },
    }),
  );
  assert.ok(trade);
  assert.equal(trade.discipline.liquidityState, "unavailable");
});
