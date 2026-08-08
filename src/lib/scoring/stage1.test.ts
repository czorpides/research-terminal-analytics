import assert from "node:assert/strict";
import test from "node:test";

import type { Bar } from "./series.ts";
import { computeStage1 } from "./stage1.server.ts";

function bar(
  index: number,
  close: number,
  low = close - 1,
  high = close + 1,
  volume = 1_000_000,
): Bar {
  const date = new Date(Date.UTC(2025, 0, 1 + index)).toISOString().slice(0, 10);
  return { date, open: close - 0.3, high, low, close, volume };
}

test("persistent markdown does not invent a structural invalidation", () => {
  const bars = Array.from({ length: 180 }, (_, index) => {
    const close = 220 - index * 0.55;
    return bar(index, close, close - 1.2, close + 0.8, 900_000);
  });
  const result = computeStage1(bars);

  assert.equal(result.state, "markdown");
  assert.equal(result.inputs.structural_invalidation, null);
  assert.equal(result.inputs.choch_confirmed, 0);
});

test("liquidity sweep, change of character and higher-low retest persist a base invalidation", () => {
  const bars: Bar[] = [];

  for (let index = 0; index < 115; index += 1) {
    const close = 150 - index * 0.38;
    bars.push(bar(index, close, close - 0.9, close + 0.9, 900_000));
  }

  for (let index = 115; index < 160; index += 1) {
    const close = 101 + Math.sin((index - 115) / 2.5) * 2;
    const volume = 800_000 + (index % 4) * 25_000;
    bars.push(bar(index, close, close - 1.2, close + 1.2, volume));
  }

  // Most recent pre-sweep swing high around 104, then a capitulation wick under
  // the base that closes back above the prior low.
  bars[157] = bar(157, 102.5, 101.2, 104.2, 950_000);
  bars[158] = bar(158, 101.5, 100.3, 103.1, 900_000);
  bars[159] = bar(159, 100.8, 99.7, 102.2, 920_000);

  bars.push(bar(160, 100.2, 96.0, 101.8, 1_800_000));
  bars.push(bar(161, 102.0, 99.8, 103.0, 1_450_000));
  bars.push(bar(162, 104.5, 101.5, 105.2, 1_500_000));
  bars.push(bar(163, 106.0, 103.5, 107.0, 1_550_000));
  bars.push(bar(164, 108.0, 105.0, 109.0, 1_600_000));
  bars.push(bar(165, 110.0, 107.0, 111.0, 1_650_000));
  bars.push(bar(166, 108.0, 105.8, 109.0, 650_000));
  bars.push(bar(167, 106.5, 104.8, 108.0, 620_000));
  bars.push(bar(168, 107.5, 105.2, 108.5, 680_000));
  bars.push(bar(169, 109.5, 106.5, 110.5, 1_350_000));
  bars.push(bar(170, 111.0, 108.5, 112.0, 1_450_000));
  bars.push(bar(171, 112.0, 109.8, 113.0, 1_500_000));
  bars.push(bar(172, 113.0, 110.5, 114.0, 1_550_000));
  bars.push(bar(173, 112.5, 110.8, 113.5, 700_000));
  bars.push(bar(174, 113.5, 111.0, 114.5, 1_400_000));
  bars.push(bar(175, 114.0, 112.0, 115.0, 1_450_000));
  bars.push(bar(176, 115.0, 112.8, 116.0, 1_500_000));
  bars.push(bar(177, 114.5, 113.0, 115.5, 720_000));
  bars.push(bar(178, 115.5, 113.5, 116.5, 1_450_000));
  bars.push(bar(179, 116.0, 114.0, 117.0, 1_500_000));

  const result = computeStage1(bars);

  assert.equal(result.state, "confirmed");
  assert.equal(result.inputs.liquidity_sweep, 1);
  assert.equal(result.inputs.choch_confirmed, 1);
  assert.equal(result.inputs.first_higher_low, 1);
  assert.ok(Number(result.inputs.structural_invalidation) <= 96.1);
  assert.ok(String(result.inputs.base_low_date).length > 0);
});
