import assert from "node:assert/strict";
import test from "node:test";

import { FUNDAMENTAL_METRICS } from "@/lib/ingestion/fundamentals/metrics";
import {
  assessHistoricalSelfValuation,
  type HistoricalValuationObservation,
} from "./historical-self-valuation.ts";

function observations(
  metricCode: string,
  values: number[],
  startYear = 2017,
): HistoricalValuationObservation[] {
  return values.map((value, index) => ({
    metricCode,
    periodEnd: `${startYear + index}-12-31`,
    value,
  }));
}

test("low current EV/EBITDA scores as cheap versus its own annual history", () => {
  const result = assessHistoricalSelfValuation(
    { evEbitda: 7, fcfYield: null, pe: null, pb: null, ps: null },
    observations(FUNDAMENTAL_METRICS.evEbitda, [15, 14, 13, 12, 11, 10, 9, 8]),
    "2026-08-08",
  );

  assert.equal(result.state, "strong");
  assert.equal(result.score, 100);
  assert.equal(result.metrics[0].sampleCount, 8);
  assert.equal(result.metrics[0].cheapnessPercentile, 100);
});

test("high FCF yield scores as cheap while lower yield does not", () => {
  const history = observations(
    FUNDAMENTAL_METRICS.fcfYield,
    [0.025, 0.03, 0.035, 0.04, 0.045, 0.05, 0.055, 0.06],
  );
  const cheap = assessHistoricalSelfValuation(
    { evEbitda: null, fcfYield: 0.075, pe: null, pb: null, ps: null },
    history,
    "2026-08-08",
  );
  const expensive = assessHistoricalSelfValuation(
    { evEbitda: null, fcfYield: 0.02, pe: null, pb: null, ps: null },
    history,
    "2026-08-08",
  );

  assert.equal(cheap.score, 100);
  assert.equal(expensive.score, 0);
  assert.equal(expensive.state, "expensive");
});

test("fewer than five annual observations remain insufficient", () => {
  const result = assessHistoricalSelfValuation(
    { evEbitda: 8, fcfYield: null, pe: null, pb: null, ps: null },
    observations(FUNDAMENTAL_METRICS.evEbitda, [12, 11, 10, 9]),
    "2026-08-08",
  );

  assert.equal(result.state, "insufficient");
  assert.equal(result.score, null);
  assert.equal(result.metrics.length, 0);
});

test("non-positive historical multiples are excluded rather than treated as cheap valuation", () => {
  const result = assessHistoricalSelfValuation(
    { evEbitda: 9, fcfYield: null, pe: null, pb: null, ps: null },
    observations(FUNDAMENTAL_METRICS.evEbitda, [-5, 0, 15, 14, 13, 12]),
    "2026-08-08",
  );

  assert.equal(result.state, "insufficient");
  assert.equal(result.score, null);
});

test("observations older than ten years do not affect the current percentile", () => {
  const old = observations(FUNDAMENTAL_METRICS.pe, [30, 28, 26, 24, 22], 2005);
  const recent = observations(FUNDAMENTAL_METRICS.pe, [18, 17, 16, 15, 14, 13], 2020);
  const result = assessHistoricalSelfValuation(
    { evEbitda: null, fcfYield: null, pe: 12, pb: null, ps: null },
    [...old, ...recent],
    "2026-08-08",
  );

  assert.equal(result.score, 100);
  assert.equal(result.metrics[0].sampleCount, 6);
  assert.equal(result.metrics[0].oldestPeriodEnd, "2020-12-31");
});
