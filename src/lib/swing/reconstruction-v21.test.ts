import assert from "node:assert/strict";
import test from "node:test";

import type { SwingBar } from "./model.ts";
import type { SwingV2Context } from "./model-v21.ts";
import { hardenSwingV2Workspace } from "./workspace-v21-hardening.ts";
import {
  createSwingV21SnapshotContextResolver,
  reconstructSwingV21History,
  reconstructedSwingV21BacktestCases,
  technicalOnlyContext,
  type SwingV21ContextSnapshot,
} from "./reconstruction-v21.ts";

function series(length: number, start: number, dailyPct: number): number[] {
  const values = [start];
  for (let index = 1; index < length; index += 1) {
    values.push(values[index - 1] * (1 + dailyPct));
  }
  return values;
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

function businessBarsFromCloses(closes: number[], volume = 1_500_000): SwingBar[] {
  const output: SwingBar[] = [];
  const date = new Date(Date.UTC(2024, 0, 2));
  for (let index = 0; index < closes.length; index += 1) {
    while (date.getUTCDay() === 0 || date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() + 1);
    const close = closes[index];
    const previous = index ? closes[index - 1] : close;
    const open = previous * 0.998;
    const high = Math.max(open, close) * 1.01;
    const low = Math.min(open, close) * 0.99;
    output.push({
      date: date.toISOString().slice(0, 10),
      open,
      high,
      low,
      close,
      volume,
    });
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return output;
}

function pointInTimeContext(label = "historical"): SwingV2Context {
  return {
    existingMomentum: 55,
    existingTrend: 65,
    quality: null,
    valuation: null,
    instrumentType: "equity",
    catalyst: {
      score: null,
      label: null,
      confidence: 0,
      daysToEarnings: null,
      positiveRevision: false,
      negativeRevision: false,
      reasons: [label],
      risks: [],
    },
  };
}

function allVisibleStates() {
  return ["actionable", "developing", "detected", "event_risk", "extended"] as const;
}

test("snapshot resolver excludes same-day context by default", () => {
  const snapshots: Record<string, SwingV21ContextSnapshot[]> = {
    asset: [
      { availableAt: "2025-01-09T18:00:00Z", context: pointInTimeContext("prior") },
      { availableAt: "2025-01-10T08:00:00Z", context: pointInTimeContext("same-day") },
    ],
  };

  const conservative = createSwingV21SnapshotContextResolver(snapshots);
  assert.equal(conservative("asset", "2025-01-10")?.context.catalyst.reasons[0], "prior");

  const sameDayAllowed = createSwingV21SnapshotContextResolver(snapshots, { allowSameDayContext: true });
  assert.equal(sameDayAllowed("asset", "2025-01-10")?.context.catalyst.reasons[0], "same-day");
});

test("replay rejects context that was not yet available on the historical date", () => {
  const bars = businessBarsFromCloses(pullbackSeries());
  const signalDate = bars.at(-1)!.date;

  assert.throws(
    () => reconstructSwingV21History(
      { assetId: "asset", symbol: "TEST", instrumentType: "equity", bars },
      () => ({
        availableAt: "2099-01-01T00:00:00Z",
        context: pointInTimeContext(),
      }),
      { startDate: signalDate, endDate: signalDate },
    ),
    /point-in-time violation/i,
  );
});

test("technical-only fallback is explicitly unknown rather than known-neutral catalyst evidence", () => {
  const bars = businessBarsFromCloses(pullbackSeries());
  const lastThree = bars.slice(-3);
  const report = reconstructSwingV21History(
    { assetId: "asset", symbol: "TEST", instrumentType: "equity", bars },
    undefined,
    {
      startDate: lastThree[0].date,
      endDate: lastThree.at(-1)!.date,
      minimumRawRankingScore: 0,
      emitStates: [...allVisibleStates()],
      emission: "daily_snapshot",
    },
  );

  assert.equal(report.sessionsEvaluated, 3);
  assert.equal(report.contextTechnicalOnly, 3);
  assert.equal(report.contextResolved, 0);
  assert.ok(report.warnings.some((warning) => warning.includes("unknown")));

  const context = technicalOnlyContext("equity");
  assert.equal(context.catalyst.score, null);
  assert.equal(context.catalyst.daysToEarnings, null);
  assert.ok(context.catalyst.risks.some((risk) => risk.includes("unknown")));
});

test("reconstructed signals see no future price bars and future bars begin after the signal date", () => {
  const bars = businessBarsFromCloses(pullbackSeries());
  const window = bars.slice(-5);
  const snapshots: Record<string, SwingV21ContextSnapshot[]> = {
    asset: [{
      availableAt: `${bars[bars.length - 6].date}T12:00:00Z`,
      context: pointInTimeContext(),
      source: "historical-test",
    }],
  };
  const resolver = createSwingV21SnapshotContextResolver(snapshots);

  const report = reconstructSwingV21History(
    { assetId: "asset", symbol: "TEST", instrumentType: "equity", bars },
    resolver,
    {
      startDate: window[0].date,
      endDate: window.at(-1)!.date,
      minimumRawRankingScore: 0,
      emitStates: [...allVisibleStates()],
      emission: "daily_snapshot",
    },
  );

  assert.ok(report.emittedSignals > 0);
  for (const signal of report.signals) {
    assert.ok(signal.barsVisible <= 280);
    assert.equal(signal.contextMode, "point_in_time");
    assert.equal(signal.contextSource, "historical-test");
    assert.ok(signal.futureBars.every((bar) => bar.date > signal.signalDate));
  }

  const cases = reconstructedSwingV21BacktestCases(report);
  assert.equal(cases.length, report.emittedSignals);
  assert.deepEqual(cases[0].signal, report.signals[0].calibrationSignal);
});

test("state-transition emission suppresses repeated daily observations of the same setup state", () => {
  const closes = [...pullbackSeries(), ...series(8, pullbackSeries().at(-1)!, 0.001).slice(1)];
  const bars = businessBarsFromCloses(closes);
  const startDate = bars[bars.length - 10].date;
  const common = {
    startDate,
    endDate: bars.at(-1)!.date,
    minimumRawRankingScore: 0,
    emitStates: [...allVisibleStates()],
  };

  const daily = reconstructSwingV21History(
    { assetId: "asset", symbol: "TEST", instrumentType: "equity", bars },
    undefined,
    { ...common, emission: "daily_snapshot" },
  );
  const transitions = reconstructSwingV21History(
    { assetId: "asset", symbol: "TEST", instrumentType: "equity", bars },
    undefined,
    { ...common, emission: "state_transition" },
  );

  assert.ok(daily.emittedSignals > 0);
  assert.ok(transitions.emittedSignals > 0);
  assert.ok(transitions.emittedSignals <= daily.emittedSignals);
});

test("historical guard output matches the live workspace hardening layer for the same reconstructed candidate", () => {
  const bars = businessBarsFromCloses(pullbackSeries());
  const signalDate = bars.at(-1)!.date;
  const report = reconstructSwingV21History(
    { assetId: "asset", symbol: "TEST", instrumentType: "equity", bars },
    undefined,
    {
      startDate: signalDate,
      endDate: signalDate,
      minimumRawRankingScore: 0,
      emitStates: [...allVisibleStates()],
      emission: "daily_snapshot",
    },
  );
  assert.equal(report.emittedSignals, 1);
  const reconstructed = report.signals[0];

  const hardened = hardenSwingV2Workspace({
    asOf: signalDate,
    modelVersion: reconstructed.candidate.modelVersion,
    shadow: true,
    calibration: { status: "shadow_unvalidated", note: "test" },
    universe: {
      activeEquities: 1,
      scoreScreened: 1,
      equityDeepScanned: 1,
      commodityDeepScanned: 0,
      surfaced: 1,
      actionable: Number(reconstructed.candidate.entryState === "actionable"),
      developing: Number(reconstructed.candidate.entryState === "developing"),
      eventRisk: Number(reconstructed.candidate.entryState === "event_risk"),
      extended: Number(reconstructed.candidate.entryState === "extended"),
      cap: 220,
    },
    candidates: [{
      assetId: "asset",
      symbol: "TEST",
      name: "Test Asset",
      exchange: "NYSE",
      currency: "USD",
      assetType: "equity",
      countryCode: "US",
      industryCode: null,
      industryName: null,
      priceAsOf: signalDate,
      setup: reconstructed.candidate,
      catalyst: pointInTimeContext().catalyst,
      expectations: null,
    }],
    methodology: "test",
    warnings: [],
  });

  assert.equal(hardened.candidates.length, 1);
  const live = hardened.candidates[0].setup;
  assert.equal(reconstructed.hardenedEntryState, live.entryState);
  assert.equal(reconstructed.hardenedRankingScore, live.rankingScore);
  assert.equal(reconstructed.hardenedEntryQuality, live.entryQuality);
  assert.equal(reconstructed.guards.productionExecutionStop, live.discipline.riskPlan.hardStop);
  assert.equal(reconstructed.guards.productionRewardRisk, live.discipline.riskPlan.rewardRisk);
});
