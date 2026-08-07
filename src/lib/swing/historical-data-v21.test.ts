import assert from "node:assert/strict";
import test from "node:test";

import { buildSwingV21SplitAdjustedBars } from "./historical-data-v21.ts";

test("joins split-adjusted OHLC to split-adjusted volume without using dividend-adjusted close", () => {
  const report = buildSwingV21SplitAdjustedBars(
    [
      { date: "2024-06-03", open: 48, high: 51, low: 47, close: 50 },
      { date: "2024-06-04", open: 50, high: 53, low: 49, close: 52 },
    ],
    [
      // The ordinary EOD payload may also contain adjusted_close, but the
      // normalizer accepts volume only and cannot accidentally use it as price.
      { date: "2024-06-03", volume: 2_000_000 },
      { date: "2024-06-04", volume: 1_800_000 },
    ],
  );

  assert.equal(report.priceBasis, "split_adjusted_not_dividend_adjusted");
  assert.equal(report.volumeBasis, "split_adjusted");
  assert.deepEqual(report.bars, [
    { date: "2024-06-03", open: 48, high: 51, low: 47, close: 50, volume: 2_000_000 },
    { date: "2024-06-04", open: 50, high: 53, low: 49, close: 52, volume: 1_800_000 },
  ]);
});

test("keeps a split-adjusted price series continuous across a raw split discontinuity", () => {
  const report = buildSwingV21SplitAdjustedBars(
    [
      { date: "2024-05-31", open: 49, high: 51, low: 48, close: 50 },
      { date: "2024-06-03", open: 50, high: 52, low: 49, close: 51 },
    ],
    [
      { date: "2024-05-31", volume: 1_000_000 },
      { date: "2024-06-03", volume: 2_100_000 },
    ],
  );

  assert.equal(report.bars.length, 2);
  assert.equal(report.bars[0].close, 50);
  assert.equal(report.bars[1].close, 51);
  assert.equal(report.bars[1].close / report.bars[0].close - 1 > -0.1, true);
});

test("rejects malformed OHLC rather than falling back to raw or adjusted-close prices", () => {
  const report = buildSwingV21SplitAdjustedBars(
    [
      { date: "2024-01-02", open: 100, high: 90, low: 95, close: 98 },
      { date: "bad-date", open: 100, high: 105, low: 95, close: 102 },
      { date: "2024-01-03", open: 100, high: 105, low: 95, close: 102 },
    ],
    [{ date: "2024-01-03", volume: 500_000 }],
  );

  assert.equal(report.inputOhlcRows, 3);
  assert.equal(report.invalidOhlcRows, 2);
  assert.equal(report.usableOhlcRows, 1);
  assert.deepEqual(report.bars[0], {
    date: "2024-01-03",
    open: 100,
    high: 105,
    low: 95,
    close: 102,
    volume: 500_000,
  });
});

test("deduplicates dates deterministically and leaves missing volume explicitly null", () => {
  const report = buildSwingV21SplitAdjustedBars(
    [
      { date: "2024-02-01", open: 10, high: 11, low: 9, close: 10.5 },
      { date: "2024-02-01", open: 10.5, high: 12, low: 10, close: 11.5 },
      { date: "2024-02-02", open: 11.5, high: 12, low: 11, close: 11.8 },
    ],
    [{ date: "2024-02-01", volume: 250_000 }],
  );

  assert.equal(report.duplicateOhlcDates, 1);
  assert.equal(report.bars.length, 2);
  assert.equal(report.bars[0].open, 10.5);
  assert.equal(report.bars[0].volume, 250_000);
  assert.equal(report.bars[1].volume, null);
  assert.equal(report.missingVolumeDates, 1);
  assert.equal(report.warnings.length >= 2, true);
});

test("accepts numeric strings but rejects negative volume", () => {
  const report = buildSwingV21SplitAdjustedBars(
    [{ date: "2024-03-01", open: "20", high: "22", low: "19", close: "21" }],
    [{ date: "2024-03-01", volume: "-1" }],
  );

  assert.deepEqual(report.bars[0], {
    date: "2024-03-01",
    open: 20,
    high: 22,
    low: 19,
    close: 21,
    volume: null,
  });
  assert.equal(report.missingVolumeDates, 1);
});
