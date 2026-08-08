import type { SwingBar } from "./model.ts";

export interface SwingV21SplitAdjustedOhlcRow {
  date?: string;
  open?: number | string | null;
  high?: number | string | null;
  low?: number | string | null;
  close?: number | string | null;
}

export interface SwingV21SplitAdjustedVolumeRow {
  date?: string;
  volume?: number | string | null;
}

export interface SwingV21HistoricalBarBuildReport {
  /** Split-adjusted OHLC with split-adjusted volume, suitable for technical replay. */
  bars: SwingBar[];
  priceBasis: "split_adjusted_not_dividend_adjusted";
  volumeBasis: "split_adjusted";
  inputOhlcRows: number;
  usableOhlcRows: number;
  invalidOhlcRows: number;
  duplicateOhlcDates: number;
  missingVolumeDates: number;
  warnings: string[];
}

/**
 * Build the price basis expected by Swing v2.1 historical reconstruction.
 *
 * EODHD's ordinary EOD endpoint exposes raw OHLC, dividend+split adjusted close,
 * and split-adjusted volume. Technical `function=splitadjusted` exposes OHLC
 * adjusted for splits only. Historical Swing signals must use the latter OHLC
 * joined to ordinary EOD volume by date; using raw OHLC would manufacture split
 * crashes, while using dividend-adjusted close as OHLC would alter real ex-dividend
 * price behaviour.
 *
 * This function is deliberately provider-shape tolerant and pure: it performs
 * no network/database work and never fills missing prices from another basis.
 */
export function buildSwingV21SplitAdjustedBars(
  ohlcRows: SwingV21SplitAdjustedOhlcRow[],
  volumeRows: SwingV21SplitAdjustedVolumeRow[],
): SwingV21HistoricalBarBuildReport {
  const volumeByDate = new Map<string, number>();
  for (const row of volumeRows) {
    if (!validDate(row.date)) continue;
    const volume = finite(row.volume);
    if (volume === null || volume < 0) continue;
    volumeByDate.set(row.date!, volume);
  }

  const byDate = new Map<string, SwingBar>();
  let invalidOhlcRows = 0;
  let duplicateOhlcDates = 0;

  for (const row of ohlcRows) {
    if (!validDate(row.date)) {
      invalidOhlcRows += 1;
      continue;
    }
    const open = finite(row.open);
    const high = finite(row.high);
    const low = finite(row.low);
    const close = finite(row.close);
    if (!validOhlc(open, high, low, close)) {
      invalidOhlcRows += 1;
      continue;
    }
    if (byDate.has(row.date!)) duplicateOhlcDates += 1;
    byDate.set(row.date!, {
      date: row.date!,
      open: open!,
      high: high!,
      low: low!,
      close: close!,
      volume: volumeByDate.get(row.date!) ?? null,
    });
  }

  const bars = [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
  const missingVolumeDates = bars.filter((bar) => bar.volume === null).length;
  const warnings: string[] = [];
  if (invalidOhlcRows > 0) {
    warnings.push(`${invalidOhlcRows} split-adjusted OHLC row${invalidOhlcRows === 1 ? " was" : "s were"} rejected as invalid.`);
  }
  if (duplicateOhlcDates > 0) {
    warnings.push(`${duplicateOhlcDates} duplicate split-adjusted date${duplicateOhlcDates === 1 ? " was" : "s were"} resolved by keeping the last valid row.`);
  }
  if (missingVolumeDates > 0) {
    warnings.push(`${missingVolumeDates} usable OHLC date${missingVolumeDates === 1 ? " has" : "s have"} no matching split-adjusted volume and remain volume-null.`);
  }

  return {
    bars,
    priceBasis: "split_adjusted_not_dividend_adjusted",
    volumeBasis: "split_adjusted",
    inputOhlcRows: ohlcRows.length,
    usableOhlcRows: bars.length,
    invalidOhlcRows,
    duplicateOhlcDates,
    missingVolumeDates,
    warnings,
  };
}

function validDate(value: string | undefined): value is string {
  return Boolean(
    value &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)),
  );
}

function validOhlc(
  open: number | null,
  high: number | null,
  low: number | null,
  close: number | null,
): boolean {
  if ([open, high, low, close].some((value) => value === null || value <= 0)) return false;
  return high! >= Math.max(open!, close!, low!) && low! <= Math.min(open!, close!, high!);
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
