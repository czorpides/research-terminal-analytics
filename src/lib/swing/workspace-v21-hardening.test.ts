import assert from "node:assert/strict";
import test from "node:test";

import { hardenSwingV2Workspace } from "./workspace-v21-hardening.ts";
import type {
  SwingV2Workspace,
  SwingV2WorkspaceCandidate,
} from "./workspace-v2.functions.ts";

function candidate(overrides: {
  setup?: string;
  entryState?: string;
  current?: number;
  atr14?: number;
  hardStop?: number;
  target?: number;
  rewardRisk?: number;
  drawdown63Pct?: number;
  higherLow?: boolean;
  ma20Reclaim?: boolean;
  sma200Reclaim?: boolean;
  bullishRsiDivergence?: boolean;
  bullishMacdDivergence?: boolean;
  volumeTurnConfirmed?: boolean;
  rejectionTrigger?: boolean;
} = {}): SwingV2WorkspaceCandidate {
  const current = overrides.current ?? 10;
  const atr14 = overrides.atr14 ?? 1;
  const hardStop = overrides.hardStop ?? 9;
  const target = overrides.target ?? 13;
  const rewardRisk = overrides.rewardRisk ?? 3;
  return {
    assetId: "asset-1",
    symbol: "TEST",
    name: "Test Plc",
    exchange: "XLON",
    currency: "GBP",
    assetType: "equity",
    countryCode: "UK",
    industryCode: null,
    industryName: null,
    priceAsOf: "2026-08-06",
    catalyst: {
      score: null,
      label: null,
      confidence: 0,
      daysToEarnings: null,
      positiveRevision: false,
      negativeRevision: false,
      reasons: [],
      risks: [],
    },
    expectations: null,
    setup: {
      setup: overrides.setup ?? "trend_pullback",
      setupLabel: "Test setup",
      entryState: overrides.entryState ?? "actionable",
      modelVersion: "swing.setup.v2.1-shadow",
      technicalScore: 80,
      catalystScore: 50,
      contextScore: 50,
      entryQuality: 80,
      chaseRisk: 10,
      compositeScore: 80,
      rankingScore: 85,
      evidenceCoverage: 100,
      calibrated: false,
      geometry: {
        entryLow: current - 0.1,
        entryHigh: current + 0.1,
        invalidation: hardStop,
        target,
        rewardRisk,
        targetBasis: "test",
      },
      reasons: [`Structural reward/risk is ${rewardRisk.toFixed(2)}x.`],
      confirmations: [],
      risks: [],
      metrics: {
        current,
        rsi14: 30,
        rsiPrior5: 35,
        rsiMin10: 25,
        macdLine: -1,
        macdSignal: -0.8,
        macdHistogram: -0.2,
        macdHistogramPrior: -0.21,
        macdHistogramDelta: 0.01,
        ma20: 11,
        ma50: 12,
        ma200: 9.5,
        distanceMa20Pct: -9,
        distanceMa50Pct: -16,
        distanceMa200Pct: 5,
        return5dPct: -3,
        return20dPct: -12,
        high20: 12,
        low20: 9,
        high63: 13,
        low63: 8.5,
        high126: 14,
        low126: 8,
        high252: 15,
        low252: 7,
        drawdown63Pct: overrides.drawdown63Pct ?? -23,
        drawdown126Pct: -28,
        drawdown252Pct: -33,
        range63Location: 0.33,
        range126Location: 0.3,
        zScore20: -1.8,
        zScore50: -1.5,
        atr14,
        atrPct: atr14 / current * 100,
        atrDistanceMa200: 0.5,
        relativeVolume20: 1.1,
        gapPct: 0,
        higherLow: overrides.higherLow ?? false,
        bullishClose: true,
        ma20Reclaim: overrides.ma20Reclaim ?? false,
        sma200Reclaim: overrides.sma200Reclaim ?? false,
        breakout20: false,
        breakoutExtensionPct: null,
        baseRange40Pct: 12,
        baseCompression: true,
        breakoutRetest: false,
        latestDayReturnPct: 1,
      },
      discipline: {
        averageVolume20: 1_000_000,
        averageNotional20: 10_000_000,
        liquidityState: "pass",
        atrPct: atr14 / current * 100,
        volatilityState: "pass",
        tradeable: true,
        weeklyTrend: "down",
        weeklyMa10: 11,
        weeklyMa20: 12,
        weeklyMa40: 13,
        weeklySupportConfluence: false,
        adx14: 28,
        adxPrior5: 25,
        adxState: "strong",
        bullishRsiDivergence: overrides.bullishRsiDivergence ?? false,
        bullishMacdDivergence: overrides.bullishMacdDivergence ?? false,
        pullbackVolumeRatio: 0.9,
        reversalVolumeExpansion: 1.1,
        volumeContraction: false,
        volumeExpansion: false,
        volumeTurnConfirmed: overrides.volumeTurnConfirmed ?? false,
        hammer: false,
        bullishEngulfing: false,
        liquiditySweep: false,
        rejectionTrigger: overrides.rejectionTrigger ?? false,
        firstBreakoutRetest: false,
        breakoutLevel: null,
        breakoutDaysAgo: null,
        breakoutVolumeRatio: null,
        middleOfRange: false,
        confirmationCount: 0,
        riskPlan: {
          hardStop,
          thesisInvalidation: hardStop,
          thesisInvalidationRule: "Test invalidation rule.",
          target,
          rewardRisk,
          minimumActionableRewardRisk: 2,
          riskPerShare: current - hardStop,
          expectedHoldingSessions: [3, 10],
          timeStopSessions: 12,
        },
      },
    },
  } as unknown as SwingV2WorkspaceCandidate;
}

function workspace(candidates: SwingV2WorkspaceCandidate[]): SwingV2Workspace {
  return {
    asOf: "2026-08-06",
    modelVersion: "swing.setup.v2.1-shadow",
    shadow: true,
    calibration: { status: "shadow_unvalidated", note: "Shadow model." },
    universe: {
      activeEquities: 3_000,
      scoreScreened: 3_000,
      equityDeepScanned: 220,
      commodityDeepScanned: 2,
      surfaced: candidates.length,
      actionable: candidates.filter((item) => item.setup.entryState === "actionable").length,
      developing: 0,
      eventRisk: 0,
      extended: 0,
      cap: 220,
    },
    candidates,
    methodology: "Test methodology.",
    warnings: [],
  };
}

test("hard stop is widened to at least 0.75 ATR before reward-risk is shown", () => {
  const input = candidate({ current: 10, atr14: 2, hardStop: 9.5, target: 13, rewardRisk: 6 });
  const output = hardenSwingV2Workspace(workspace([input]));
  const hardened = output.candidates[0];
  assert.equal(hardened.setup.discipline.riskPlan.hardStop, 8.5);
  assert.equal(hardened.setup.discipline.riskPlan.riskPerShare, 1.5);
  assert.equal(hardened.setup.discipline.riskPlan.rewardRisk, 2);
  assert.equal(hardened.setup.entryState, "actionable");
});

test("counter-trend equity cannot remain Actionable on bullish close plus tiny momentum turn alone", () => {
  const input = candidate({
    setup: "deep_mean_reversion",
    higherLow: false,
    ma20Reclaim: false,
    sma200Reclaim: false,
    bullishRsiDivergence: false,
    bullishMacdDivergence: false,
    volumeTurnConfirmed: false,
    rejectionTrigger: false,
  });
  const output = hardenSwingV2Workspace(workspace([input]));
  assert.equal(output.candidates[0].setup.entryState, "developing");
  assert.ok(output.candidates[0].setup.risks.some((risk) => risk.includes("structural turn")));
});

test("a higher low is sufficient turn evidence for an otherwise valid reversal", () => {
  const input = candidate({ setup: "deep_mean_reversion", higherLow: true });
  const output = hardenSwingV2Workspace(workspace([input]));
  assert.equal(output.candidates[0].setup.entryState, "actionable");
});

test("extreme 63-day discontinuities are removed from the surfaced list", () => {
  const input = candidate({ drawdown63Pct: -98.3 });
  const output = hardenSwingV2Workspace(workspace([input]));
  assert.equal(output.candidates.length, 0);
  assert.equal(output.universe.surfaced, 0);
  assert.ok(output.warnings.some((warning) => warning.includes("63-day drawdown")));
});
