/**
 * Minimal Stooq daily-OHLCV CSV client. No API key. Server-side only.
 */

export interface StooqBar {
  date: string; // YYYY-MM-DD
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

export class StooqError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "StooqError";
  }
}

const BASE = "https://stooq.com/q/d/l/";

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

function parseCsv(text: string): StooqBar[] {
  // Stooq returns "No data" when a ticker is unknown or empty.
  if (!text || text.trim().toLowerCase().startsWith("no data")) return [];
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const iDate = idx("date"), iOpen = idx("open"), iHigh = idx("high"),
        iLow = idx("low"), iClose = idx("close"), iVol = idx("volume");
  if (iDate < 0 || iClose < 0) return [];
  const rows: StooqBar[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < header.length) continue;
    const num = (s: string | undefined) => (s === undefined || s === "" || s === "N/D" ? null : Number(s));
    rows.push({
      date: cols[iDate],
      open: num(cols[iOpen]),
      high: num(cols[iHigh]),
      low: num(cols[iLow]),
      close: num(cols[iClose]),
      volume: iVol >= 0 ? num(cols[iVol]) : null,
    });
  }
  return rows;
}

/**
 * Fetch daily OHLCV for a Stooq symbol (e.g. "aapl.us"), inclusive of dates.
 * Retries up to 3× on 429/5xx.
 */
export async function fetchStooqDaily(stooqSymbol: string, opts: { from?: string; to?: string; signal?: AbortSignal } = {}): Promise<StooqBar[]> {
  const url = new URL(BASE);
  url.searchParams.set("s", stooqSymbol);
  url.searchParams.set("i", "d");
  if (opts.from) url.searchParams.set("d1", opts.from.replace(/-/g, ""));
  if (opts.to) url.searchParams.set("d2", opts.to.replace(/-/g, ""));

  let last: StooqError | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url.toString(), {
      signal: opts.signal,
      headers: { "User-Agent": "Lovable-Research-Terminal/1.0 (+contact via app)" },
    });
    if (res.status === 429 || res.status >= 500) {
      last = new StooqError(`Stooq transient ${res.status}`, res.status);
      await sleep(500 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new StooqError(`Stooq ${res.status}`, res.status);
    const text = await res.text();
    return parseCsv(text);
  }
  throw last ?? new StooqError("Stooq request failed after retries");
}