import assert from "node:assert/strict";
import test from "node:test";

import { computeTrend } from "../scoring/trend.server.ts";
import type { Bar } from "../scoring/series.ts";

function bar(index: number, close: number, volume = 1_000_000): Bar {
  const date = new Date(Date.UTC(2025, 0, 1 + index)).toISOString().slice(0, 10);
  return { date, close, volume };
}

test("persistent markdown remains weak despite being deeply sold off", () => {
  const bars = Array.from({ length: 180 }, (_, index) =>
    bar(index, 220 - index * 0.55, 900_000 + (index % 7) * 15_000),
  );
  const result = computeTrend(bars);

  assert.ok(result.value < 32);
  assert.equal(result.inputs.weekly_bias, "falling");
  assert.equal(result.inputs.change_of_character_close, 0);
  assert.ok(result.deductions.some((item) => item.id === "weekly-falling"));
});

test("base breakout and higher-low retest produce constructive recovery confirmation", () => {
  const bars: Bar[] = [];
  for (let index = 0; index < 120; index += 1) {
    bars.push(bar(index, 190 - index * 0.55, 900_000));
  }
  for (let index = 120; index < 170; index += 1) {
    const close = 119 + Math.sin((index - 120) / 3) * 3 + (index - 120) * 0.08;
    bars.push(bar(index, close, 800_000));
  }
  const recovery = [124, 127, 131, 135, 139, 137, 134, 132, 133, 136];
  recovery.forEach((close, offset) => {
    const prior = offset === 0 ? bars[bars.length - 1].close : recovery[offset - 1];
    const volume = close > prior ? 1_450_000 : 650_000;
    bars.push(bar(170 + offset, close, volume));
  });

  const result = computeTrend(bars);

  assert.ok(result.value >= 50);
  assert.equal(result.inputs.change_of_character_close, 1);
  assert.equal(result.inputs.first_higher_low_close, 1);
  assert.ok(result.positives.some((item) => item.id === "change-of-character"));
  assert.ok(result.positives.some((item) => item.id === "first-higher-low"));
});
