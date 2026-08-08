import assert from "node:assert/strict";
import test from "node:test";

import type { SwingBar } from "./model.ts";
import {
  buildSwingV21HistoricalNominationCalendar,
  reconstructSwingV21NominatedUniverse,
  selectHistoricalDeepScan,
  type SwingV21HistoricalScreenRow,
  type SwingV21HistoricalUniverseAsset,
} from "./universe-reconstruction-v21.ts";

function businessBars(length: number, start = 100, dailyPct = 0.001): SwingBar[] {
  const output: SwingBar[] = [];
  const date = new Date(Date.UTC(2024, 0, 2));
  let close = start;
  for (let index = 0; index < length; index += 1) {
    while (date.getUTCDay() === 0 || date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() + 1);
    const previous = close;
    close = index === 0 ? close : close * (1 + dailyPct);
    const open = previous * 0.998;
    output.push({
      date: date.toISOString().slice(0, 10),
      open,
      high: Math.max(open, close) * 1.01,
      low: Math.min(open, close) * 0.99,
      close,
      volume: 1_500_000,
    });
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return output;
}

function pullbackBars(): SwingBar[] {
  const values: number[] = [];
  let close = 70;
  for (let index = 0; index < 270; index += 1) {
    values.push(close);
    close *= 1.0012;
  }
  const peak = values.at(-1)!;
  values.push(
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
  );

  const bars = businessBars(values.length, values[0], 0);
  return bars.map((bar, index) => {
    const current = values[index];
    const prior = index ? values[index - 1] : current;
    const open = prior * 0.998;
    return {
      ...bar,
      open,
      high: Math.max(open, current) * 1.01,
      low: Math.min(open, current) * 0.99,
      close: current,
    };
  });
}

function screenRow(
  assetId: string,
  overrides: Partial<SwingV21HistoricalScreenRow> = {},
): SwingV21HistoricalScreenRow {
  return {
    assetId,
    symbol: assetId.toUpperCase(),
    asOf: "2025-01-02",
    bars: 252,
    current: 100,
    return5: 0,
    return20: 0,
    relativeVolume: 1,
    drawdown90: 0,
    rangeLocation90: 0.5,
    distanceMa20: 0,
    distanceMa50: 0,
    distanceMa200: 0,
    oldMomentum: null,
    oldTrend: null,
    ...overrides,
  };
}

function universeAsset(
  assetId: string,
  bars: SwingBar[],
  activeFrom = bars[0].date,
  activeTo: string | null = null,
  options: { symbol?: string; instrumentType?: "equity" | "commodity" } = {},
): SwingV21HistoricalUniverseAsset {
  return {
    assetId,
    symbol: options.symbol ?? assetId.toUpperCase(),
    instrumentType: options.instrumentType ?? "equity",
    bars,
    activeFrom,
    activeTo,
  };
}

test("historical equity deep scan never exceeds the live 220-name cap", () => {
  const rows = Array.from({ length: 300 }, (_, index) =>
    screenRow(`asset-${String(index).padStart(3, "0")}`, {
      rangeLocation90: index / 299,
      drawdown90: -index / 1_000,
    }),
  );

  const selected = selectHistoricalDeepScan(rows, 220);
  assert.ok(selected.size > 0);
  assert.ok(selected.size <= 220);
});

test("nomination calendar respects explicit historical membership boundaries", () => {
  const bars = businessBars(70);
  const penultimate = bars[bars.length - 2].date;
  const finalDate = bars.at(-1)!.date;
  const universe = [
    universeAsset("survivor", bars),
    universeAsset("delisted", bars, bars[0].date, penultimate),
  ];

  const calendar = buildSwingV21HistoricalNominationCalendar(
    universe,
    undefined,
    { startDate: penultimate, endDate: finalDate, deepScanCap: 220 },
  );

  assert.equal(calendar.dates.length, 2);
  assert.equal(calendar.dates[0].activeMembers, 2);
  assert.equal(calendar.dates[0].activeEquities, 2);
  assert.equal(calendar.dates[1].activeMembers, 1);
  assert.ok(calendar.dates[0].selectedEquities.includes("delisted"));
  assert.ok(!calendar.dates[1].selected.includes("delisted"));
});

test("future-dated broad scores are rejected rather than used in historical nomination", () => {
  const bars = businessBars(70);
  const finalDate = bars.at(-1)!.date;
  const universe = [universeAsset("asset", bars)];

  assert.throws(
    () => buildSwingV21HistoricalNominationCalendar(
      universe,
      () => ({
        availableAt: "2099-01-01T00:00:00Z",
        momentum: 90,
        trend: 90,
      }),
      { startDate: finalDate, endDate: finalDate },
    ),
    /point-in-time violation/i,
  );
});

test("same-day broad score evidence is conservative by default", () => {
  const bars = businessBars(70);
  const finalDate = bars.at(-1)!.date;
  const universe = [universeAsset("asset", bars)];

  assert.throws(
    () => buildSwingV21HistoricalNominationCalendar(
      universe,
      () => ({
        availableAt: `${finalDate}T08:00:00Z`,
        momentum: 70,
        trend: 70,
      }),
      { startDate: finalDate, endDate: finalDate },
    ),
    /point-in-time violation/i,
  );

  const allowed = buildSwingV21HistoricalNominationCalendar(
    universe,
    () => ({
      availableAt: `${finalDate}T08:00:00Z`,
      momentum: 70,
      trend: 70,
    }),
    { startDate: finalDate, endDate: finalDate, allowSameDayBroadScores: true },
  );
  assert.equal(allowed.dates[0].scoreContextResolved, 1);
});

test("equal nomination scores preserve the live symbol-order tie behaviour", () => {
  const selected = selectHistoricalDeepScan([
    screenRow("uuid-z", { symbol: "AAA" }),
    screenRow("uuid-a", { symbol: "ZZZ" }),
  ], 1);

  assert.deepEqual([...selected], ["uuid-z"]);
});

test("cross-sectional nomination keeps the depressed/location lane ahead of a clean high when capped to one", () => {
  const selected = selectHistoricalDeepScan([
    screenRow("depressed", {
      rangeLocation90: 0.02,
      drawdown90: -0.25,
      return20: -12,
      distanceMa20: -0.08,
    }),
    screenRow("high", {
      rangeLocation90: 0.95,
      drawdown90: -0.01,
      return20: 8,
      relativeVolume: 2,
      distanceMa20: 0.03,
      oldTrend: 85,
    }),
  ], 1);

  assert.deepEqual([...selected], ["depressed"]);
});

test("XAUUSD and XAGUSD sit outside the 220-equity nomination cap", () => {
  const bars = businessBars(70);
  const finalDate = bars.at(-1)!.date;
  const equities = Array.from({ length: 300 }, (_, index) =>
    universeAsset(`equity-${String(index).padStart(3, "0")}`, bars),
  );
  const gold = universeAsset("gold", bars, bars[0].date, null, {
    symbol: "XAUUSD",
    instrumentType: "commodity",
  });
  const silver = universeAsset("silver", bars, bars[0].date, null, {
    symbol: "XAGUSD",
    instrumentType: "commodity",
  });

  const equityOnly = buildSwingV21HistoricalNominationCalendar(
    equities,
    undefined,
    { startDate: finalDate, endDate: finalDate, deepScanCap: 220 },
  ).dates[0];
  const calendar = buildSwingV21HistoricalNominationCalendar(
    [...equities, gold, silver],
    undefined,
    { startDate: finalDate, endDate: finalDate, deepScanCap: 220 },
  );
  const day = calendar.dates[0];

  assert.deepEqual(day.selectedEquities, equityOnly.selectedEquities);
  assert.ok(day.selectedEquities.length <= 220);
  // The live loader is symbol-sorted, so XAGUSD precedes XAUUSD.
  assert.deepEqual(day.selectedCommodities, ["silver", "gold"]);
  assert.equal(day.selected.length, day.selectedEquities.length + 2);
  assert.equal(day.activeEquities, 300);
  assert.equal(day.activeCommodities, 2);
});

test("other commodities do not enter the live metals lane", () => {
  const bars = businessBars(70);
  const finalDate = bars.at(-1)!.date;
  const oil = universeAsset("oil", bars, bars[0].date, null, {
    symbol: "WTIUSD",
    instrumentType: "commodity",
  });

  const calendar = buildSwingV21HistoricalNominationCalendar(
    [oil],
    undefined,
    { startDate: finalDate, endDate: finalDate },
  );

  assert.deepEqual(calendar.dates[0].selectedCommodities, []);
  assert.ok(calendar.warnings.some((warning) => warning.includes("XAUUSD/XAGUSD")));
});

test("nominated-universe replay evaluates only selected historical asset sessions", () => {
  const bars = pullbackBars();
  const startDate = bars[bars.length - 5].date;
  const endDate = bars.at(-1)!.date;
  const report = reconstructSwingV21NominatedUniverse(
    [universeAsset("asset", bars)],
    undefined,
    undefined,
    {
      startDate,
      endDate,
      deepScanCap: 220,
      minimumRawRankingScore: 0,
      emitStates: ["actionable", "developing", "detected", "event_risk", "extended"],
      emission: "daily_snapshot",
    },
  );

  assert.equal(report.nominationCalendar.dates.length, 5);
  assert.equal(report.nominatedAssetSessions, 5);
  assert.equal(report.modelEvaluatedAssetSessions, 5);
  assert.ok(report.emittedSignals > 0);
  assert.equal(report.backtestCases.length, report.emittedSignals);
  assert.ok(report.signals.every((signal) => signal.assetId === "asset"));
  assert.ok(report.warnings.some((warning) => warning.includes("220-name")));
});
