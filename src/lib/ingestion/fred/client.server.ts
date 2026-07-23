/**
 * Minimal typed FRED client. Runs server-side only.
 * Docs: https://fred.stlouisfed.org/docs/api/fred/series_observations.html
 */

export interface FredObservation {
  date: string; // YYYY-MM-DD
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
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = "FredError";
  }
}

function apiKey(): string {
  const k = process.env.INGEST_FRED_API_KEY;
  if (!k) throw new FredError("Missing INGEST_FRED_API_KEY server secret");
  return k;
}

async function fredFetch(
  path: string,
  params: Record<string, string | undefined>,
  signal?: AbortSignal,
): Promise<unknown> {
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
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchSeriesObservations(
  seriesId: string,
  opts: FetchOptions = {},
): Promise<FredObservation[]> {
  const raw = (await fredFetch(
    "/series/observations",
    {
      series_id: seriesId,
      observation_start: opts.observationStart,
      observation_end: opts.observationEnd,
      limit: opts.limit ? String(opts.limit) : undefined,
      sort_order: "asc",
    },
    opts.signal,
  )) as {
    observations?: Array<{
      date: string;
      value: string;
      realtime_start: string;
      realtime_end: string;
    }>;
  };

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

export async function fetchSeriesMeta(
  seriesId: string,
  signal?: AbortSignal,
): Promise<FredSeriesMeta | null> {
  const raw = (await fredFetch("/series", { series_id: seriesId }, signal)) as {
    seriess?: FredSeriesMeta[];
  };
  return raw.seriess?.[0] ?? null;
}

export interface FredRelease {
  id: number;
  name: string;
  press_release: boolean;
  link?: string;
  notes?: string;
}

export interface FredReleaseDate {
  releaseId: number;
  releaseName: string;
  date: string;
}

/** Official FRED release associated with a tracked series. */
export async function fetchSeriesRelease(
  seriesId: string,
  signal?: AbortSignal,
): Promise<FredRelease | null> {
  const raw = (await fredFetch("/series/release", { series_id: seriesId }, signal)) as {
    releases?: FredRelease[];
  };
  return raw.releases?.[0] ?? null;
}

/**
 * Official release dates across a bounded window. FRED publishes dates rather
 * than dependable release times, so the orchestrator treats the date as a
 * polling window and verifies that a new observation actually arrived.
 */
export async function fetchReleaseDates(options: {
  start: string;
  end: string;
  includeDatesWithoutData?: boolean;
  signal?: AbortSignal;
}): Promise<FredReleaseDate[]> {
  const output: FredReleaseDate[] = [];
  const limit = 1_000;
  for (let offset = 0; ; offset += limit) {
    const raw = (await fredFetch(
      "/releases/dates",
      {
        realtime_start: options.start,
        realtime_end: options.end,
        include_release_dates_with_no_data:
          options.includeDatesWithoutData === false ? "false" : "true",
        order_by: "release_date",
        sort_order: "asc",
        limit: String(limit),
        offset: String(offset),
      },
      options.signal,
    )) as {
      count?: number;
      release_dates?: Array<{
        release_id: number;
        release_name: string;
        date: string;
      }>;
    };
    const page = raw.release_dates ?? [];
    output.push(
      ...page.map((item) => ({
        releaseId: Number(item.release_id),
        releaseName: item.release_name,
        date: item.date,
      })),
    );
    if (page.length < limit || output.length >= Number(raw.count ?? 0)) break;
  }
  return output;
}
