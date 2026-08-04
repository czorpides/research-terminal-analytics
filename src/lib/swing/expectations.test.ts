import assert from "node:assert/strict";
import test from "node:test";

import { buildExpectationSignal, type AnalystExpectationSnapshot } from "./expectations.ts";

const NOW = "2026-08-04T12:00:00.000Z";

function snapshot(overrides: Partial<AnalystExpectationSnapshot> = {}): AnalystExpectationSnapshot {
  return {
    id: "snapshot",
    assetId: "asset-1",
    providerCode: "fmp",
    sourceTier: "tier2_regulated",
    observedAt: "2026-08-04T10:00:00.000Z",
    lastVerifiedAt: "2026-08-04T11:30:00.000Z",
    listingCurrency: "USD",
    referencePrice: 80,
    fy1Date: "2027-09-30",
    fy1EpsAvg: 5.5,
    fy1EpsLow: 5.1,
    fy1EpsHigh: 5.9,
    fy1EpsAnalysts: 12,
    fy1RevenueAvg: 110,
    fy1RevenueLow: 105,
    fy1RevenueHigh: 115,
    fy1RevenueAnalysts: 10,
    fy2Date: "2028-09-30",
    fy2EpsAvg: 6.3,
    fy2EpsLow: 5.9,
    fy2EpsHigh: 6.7,
    fy2EpsAnalysts: 10,
    fy2RevenueAvg: 121,
    fy2RevenueLow: 116,
    fy2RevenueHigh: 126,
    fy2RevenueAnalysts: 9,
    targetConsensus: 104,
    targetMedian: 103,
    targetHigh: 120,
    targetLow: 90,
    targetLastMonthAvg: 102,
    targetLastMonthCount: 8,
    targetLastQuarterAvg: 91,
    targetLastQuarterCount: 18,
    targetLastYearAvg: 88,
    targetLastYearCount: 45,
    targetPublishers: ["Example Research"],
    validationState: "accepted",
    validationReasons: [],
    confidence: 90,
    ...overrides,
  };
}

const baseline = snapshot({
  id: "baseline",
  observedAt: "2026-07-05T10:00:00.000Z",
  lastVerifiedAt: "2026-07-05T10:00:00.000Z",
  fy1EpsAvg: 5,
  fy2EpsAvg: 5.8,
  fy1RevenueAvg: 103,
  targetConsensus: 87,
  targetLastMonthAvg: 89,
  targetLastQuarterAvg: 88,
});

test("broad positive revisions raise conviction without exceeding the cap", () => {
  const result = buildExpectationSignal(snapshot(), baseline, NOW);
  assert.equal(result.freshness, "fresh");
  assert.equal(result.validationState, "accepted");
  assert.ok(result.adjustment >= 3);
  assert.ok(result.adjustment <= 7);
  assert.equal(result.strongPositive, true);
  assert.equal(result.blockHighConviction, false);
  assert.ok((result.fy1EpsRevisionPct ?? 0) > 9);
  assert.ok((result.targetRevisionPct ?? 0) > 19);
});

test("stale evidence contributes zero conviction", () => {
  const result = buildExpectationSignal(
    snapshot({ lastVerifiedAt: "2026-08-02T09:00:00.000Z" }),
    baseline,
    NOW,
  );
  assert.equal(result.freshness, "stale");
  assert.equal(result.adjustment, 0);
  assert.equal(result.strongPositive, false);
});

test("quarantined evidence remains auditable but cannot affect rank", () => {
  const result = buildExpectationSignal(
    snapshot({
      validationState: "quarantined",
      validationReasons: ["target_consensus_extreme_vs_reference_price"],
    }),
    baseline,
    NOW,
  );
  assert.equal(result.adjustment, 0);
  assert.equal(result.strongPositive, false);
  assert.ok(result.warnings.some((warning) => warning.includes("quarantined")));
});

test("material negative revisions can block High Conviction", () => {
  const result = buildExpectationSignal(
    snapshot({
      fy1EpsAvg: 4.4,
      fy2EpsAvg: 5.2,
      fy1RevenueAvg: 96,
      targetConsensus: 74,
      targetLastMonthAvg: 76,
      targetLastQuarterAvg: 91,
    }),
    baseline,
    NOW,
  );
  assert.ok(result.adjustment < 0);
  assert.equal(result.blockHighConviction, true);
});

test("EPS sign changes do not manufacture misleading revision percentages", () => {
  const negativeBaseline = snapshot({
    fy1EpsAvg: -0.4,
    observedAt: "2026-07-05T10:00:00.000Z",
    lastVerifiedAt: "2026-07-05T10:00:00.000Z",
  });
  const result = buildExpectationSignal(snapshot({ fy1EpsAvg: 0.5 }), negativeBaseline, NOW);
  assert.equal(result.fy1EpsRevisionPct, null);
});
