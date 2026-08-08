import assert from "node:assert/strict";
import test from "node:test";

import {
  isPermanentSwingPriorityAsset,
  priorityPatternTracking,
  surfaceWithPermanentPriority,
} from "./priority-assets-v21.ts";

test("gold and silver are the permanent Swing priority assets", () => {
  assert.equal(isPermanentSwingPriorityAsset("XAUUSD"), true);
  assert.equal(isPermanentSwingPriorityAsset("XAGUSD"), true);
  assert.equal(isPermanentSwingPriorityAsset("EURUSD"), false);
  assert.equal(isPermanentSwingPriorityAsset("AAPL"), false);
});

test("priority surfacing preserves ranking order and does not manufacture a score boost", () => {
  const ranked = [
    { symbol: "AAA", rankingScore: 90 },
    { symbol: "BBB", rankingScore: 80 },
    { symbol: "CCC", rankingScore: 70 },
    { symbol: "XAUUSD", rankingScore: 30 },
    { symbol: "XAGUSD", rankingScore: 20 },
  ];
  const surfaced = surfaceWithPermanentPriority(ranked, 3);
  assert.deepEqual(surfaced.map((row) => row.symbol), ["AAA", "XAUUSD", "XAGUSD"]);
  assert.equal(surfaced.find((row) => row.symbol === "XAUUSD")?.rankingScore, 30);
  assert.equal(surfaced.find((row) => row.symbol === "XAGUSD")?.rankingScore, 20);
});

test("metals pattern tracking is conditioned on observed macro events", () => {
  const tracking = priorityPatternTracking(
    "XAUUSD",
    "commodity_macro",
    "developing",
    {
      score: 76,
      label: "Gold macro backdrop is supportive",
      available: true,
      reasons: [],
      risks: [],
      eventConditions: ["real_yield:falling_fast", "broad_dollar:weakening"],
    },
  );
  assert.ok(tracking);
  assert.equal(tracking.mode, "event_conditioned");
  assert.equal(tracking.macroRegime, "supportive");
  assert.deepEqual(tracking.eventConditions, ["broad_dollar:weakening", "real_yield:falling_fast"]);
  assert.ok(tracking.patternKeys.includes("asset:XAUUSD|event:real_yield:falling_fast|setup:commodity_macro"));
  assert.ok(tracking.patternKeys.includes("asset:XAUUSD|event:broad_dollar:weakening|setup:commodity_macro"));
});

test("non-priority assets do not receive priority pattern tracking", () => {
  assert.equal(
    priorityPatternTracking("AAPL", "trend_pullback", "actionable", null),
    null,
  );
});
