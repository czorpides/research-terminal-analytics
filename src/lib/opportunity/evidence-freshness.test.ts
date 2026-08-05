import assert from "node:assert/strict";
import test from "node:test";

import { deriveProviderSymbol } from "@/lib/ingestion/providers/asset-symbols.server";
import {
  classifyFundamentalFreshness,
  classifyTechnicalFreshness,
  freshnessConfidenceMultiplier,
} from "./evidence-freshness.ts";

const NOW = Date.parse("2026-08-05T16:00:00.000Z");

test("fundamental freshness is fresh through 45 days, warning through 100, then stale", () => {
  assert.equal(
    classifyFundamentalFreshness("2026-07-05T16:00:00.000Z", NOW).state,
    "fresh",
  );
  assert.equal(
    classifyFundamentalFreshness("2026-06-01T16:00:00.000Z", NOW).state,
    "warning",
  );
  assert.equal(
    classifyFundamentalFreshness("2026-04-01T16:00:00.000Z", NOW).state,
    "stale",
  );
  assert.equal(classifyFundamentalFreshness(null, NOW).state, "missing");
  assert.equal(freshnessConfidenceMultiplier("warning"), 0.72);
  assert.equal(freshnessConfidenceMultiplier("stale"), 0);
});

test("technical freshness requires every score to post-date the authoritative bulk run", () => {
  const bulk = "2026-08-05T05:00:00.000Z";
  assert.equal(
    classifyTechnicalFreshness(
      [
        "2026-08-05T05:01:00.000Z",
        "2026-08-05T05:02:00.000Z",
        "2026-08-05T05:03:00.000Z",
      ],
      bulk,
    ).state,
    "fresh",
  );
  assert.equal(
    classifyTechnicalFreshness(
      [
        "2026-08-05T04:59:00.000Z",
        "2026-08-05T05:02:00.000Z",
        "2026-08-05T05:03:00.000Z",
      ],
      bulk,
    ).state,
    "stale",
  );
  assert.equal(
    classifyTechnicalFreshness(["2026-08-05T05:01:00.000Z", null, null], bulk).state,
    "missing",
  );
});

test("provider symbol derivation keeps exchange identity explicit", () => {
  assert.equal(deriveProviderSymbol("eodhd", "BP", "XLON"), "BP.LSE");
  assert.equal(deriveProviderSymbol("fmp", "BP", "XLON"), "BP.L");
  assert.equal(deriveProviderSymbol("fmp", "SAP", "XETR"), "SAP.DE");
  assert.equal(deriveProviderSymbol("twelvedata", "SAP", "XETR"), "SAP|XETR");
  assert.equal(deriveProviderSymbol("tiingo", "SAP", "XETR"), null);
  assert.equal(deriveProviderSymbol("tiingo", "MSFT", "XNAS"), "MSFT");
});
