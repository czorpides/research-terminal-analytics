import assert from "node:assert/strict";
import test from "node:test";

import type { Bar } from "./series.ts";
import { detectStageOneStructure } from "./stage-one.ts";

function bar(index: number, close: number, low = close - 0.5, high = close + 0.5, volume = 100): Bar {
  return {
    date: `2026-01-${String((index % 28) + 1).padStart(2, "0")}`,
    open: close,
    high,
    low,
    close,
    volume,
  };
}

test("falling markdown does not fabricate a Stage-1 base", () => {
  const bars = Array.from({ length: 100 }, (_, i) => bar(i, 200 - i));
  const result = detectStageOneStructure(bars);
  assert.equal(result.ohlcAvailable, true);
  assert.equal(result.liquiditySweep, false);
  assert.equal(result.changeOfCharacter, false);
  assert.equal(result.invalidation, null);
});

test("sweep -> break of structure -> higher low persists the accumulation-base invalidation", () => {
  const bars: Bar[] = [];
  for (let i = 0; i < 60; i += 1) bars.push(bar(i, 120 - i * 0.2, 119 - i * 0.2, 121 - i * 0.2));
  // Prior lower-high zone is around 111-113; sweep below prior support then reject.
  for (let i = 60; i < 74; i += 1) bars.push(bar(i, 109 - (i - 60) * 0.08, 108.3 - (i - 60) * 0.08, 110 - (i - 60) * 0.08));
  bars.push(bar(74, 108.8, 106.2, 109.4, 180));
  bars.push(bar(75, 109.5, 108.4, 110.2, 140));
  bars.push(bar(76, 111.0, 109.3, 112.0, 150));
  bars.push(bar(77, 113.0, 110.5, 114.2, 170));
  bars.push(bar(78, 115.0, 112.2, 116.0, 170));
  bars.push(bar(79, 114.5, 112.0, 115.2, 90));
  bars.push(bar(80, 114.8, 112.4, 115.4, 85));
  bars.push(bar(81, 115.4, 113.0, 116.2, 120));
  bars.push(bar(82, 116.0, 113.8, 116.8, 125));
  for (let i = 83; i < 100; i += 1) bars.push(bar(i, 116 + (i - 83) * 0.12, 114 + (i - 83) * 0.1, 117 + (i - 83) * 0.12));

  const result = detectStageOneStructure(bars);
  assert.equal(result.liquiditySweep, true);
  assert.equal(result.changeOfCharacter, true);
  assert.equal(result.firstHigherLow, true);
  assert.equal(result.baseLow, 106.2);
  assert.equal(result.invalidation, 106.2);
  assert.ok((result.higherLow ?? 0) > 106.2);
});
