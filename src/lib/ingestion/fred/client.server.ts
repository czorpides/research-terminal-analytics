/**
 * Minimal typed FRED client. Runs server-side only.
 * Docs: https://fred.stlouisfed.org/docs/api/fred/series_observations.html
 */

export interface FredObservation {
  date: string;        // YYYY-MM-DD
  value: number | null;
  realtime_start: string;
  realtime_end: string;
}

export interface FetchOptions {
  observationStart?: string; // YYYY-MM-DD, inclusive
  observationEnd?: string;
  limit?: number;
  signal?: AbortSignal;
}

const BASE = "https://api.stlouisfed.org/fred";

export class FredError extends Error {
  constructor(message: string, readonly status?: number, readonly body?: string) {
    super(message);
    this.name = "FredError";
  }
}

function apiKey(): string {
  const k = process.env.INGEST_FRED_API_KEY;
  if (!k) throw new FredError("Missing INGEST_FRED_API_KEY server secret");
  return k;
}

async function fredFetch(path: string, params: Record<string, string | undefined>, signal?: AbortSignal): Promise<unknown> {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set("api_key", apiKey());
  url.searchParams.set("file_type", "json");
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, v);
  }

  let lastErr: FredError | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url.toString(), { signal });
    if (res.status === 429 || res.status >= 500) {
      lastErr = new FredError(`FRED transient ${res.status}`, res.status, await safeText(res));
      await sleep(400 * (attempt + 1));
      continue;
    }
    if (!res.ok) {
      throw new FredError(`FRED ${res.status}`, res.status, await safeText(res));
    }
    return await res.json();
  }
  throw lastErr ?? new FredError("FRED request failed after retries");
}

async function safeText(res: Response): Promise<string> {
  try { return await res.text(); } catch { return ""; }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchSeriesObservations(
  seriesId: string,
  opts: FetchOptions = {},
): Promise<FredObservation[]> {
  const raw = (await fredFetch("/series/observations", {
    series_id: seriesId,
    observation_start: opts.observationStart,
    observation_end: opts.observationEnd,
    limit: opts.limit ? String(opts.limit) : undefined,
    sort_order: "asc",
  }, opts.signal)) as { observations?: Array<{ date: string; value: string; realtime_start: string; realtime_end: string }> };

  const obs = raw.observations ?? [];
  return obs.map((o) => ({
    date: o.date,
    value: o.value === "." || o.value === "" ? null : Number(o.value),
    realtime_start: o.realtime_start,
    realtime_end: o.realtime_end,
  }));
}

export interface FredSeriesMeta {
  id: string;
  title: string;
  units: string;
  frequency: string;
  last_updated: string;
}

export async function fetchSeriesMeta(seriesId: string, signal?: AbortSignal): Promise<FredSeriesMeta | null> {
  const raw = (await fredFetch("/series", { series_id: seriesId }, signal)) as { seriess?: FredSeriesMeta[] };
  return raw.seriess?.[0] ?? null;
}