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
      const body = await safeText(res);
      const detail = fredErrorDetail(body);
      lastErr = new FredError(
        `FRED transient ${res.status}${detail ? `: ${detail}` : ""}`,
        res.status,
        body,
      );
      await sleep(400 * (attempt + 1));
      continue;
    }
    if (!res.ok) {
      const body = await safeText(res);
      const detail = fredErrorDetail(body);
      throw new FredError(
        `FRED ${res.status}${detail ? `: ${detail}` : ""}`,
        res.status,
        body,
      );
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

function fredErrorDetail(body: string): string | null {
  const trimmed = body.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as {
      error_message?: unknown;
      message?: unknown;
    };
    const detail = parsed.error_message ?? parsed.message;
    if (detail !== null && detail !== undefined && String(detail).trim()) {
      return String(detail).replace(/\s+/g, " ").trim().slice(0, 320);
    }
  } catch {
    // FRED can return XML/plain text even when JSON was requested.
  }
  const xmlMessage = trimmed.match(/message=["']([^"']+)["']/i)?.[1];
  return (xmlMessage ?? trimmed).replace(/\s+/g, " ").trim().slice(0, 320) || null;
}

function isUnknownSeriesRelease(error: unknown): boolean {
  if (!(error instanceof FredError)) return false;
  if (error.status !== 400 && error.status !== 404) return false;
  const text = `${error.message} ${error.body ?? ""}`.toLowerCase();
  if (!text.includes("series_id")) return false;
  return [
    "invalid",
    "not found",
    "does not exist",
    "no series",
    "unknown",
  ].some((token) => text.includes(token));
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

/**
 * Official FRED release associated with a tracked series.
 *
 * The indicator registry can contain provider-native series that are not FRED
 * identifiers. A single such row should not abort the entire release calendar,
 * so only FRED's explicit "unknown/invalid series_id" response is treated as a
 * missing mapping. Authentication, quota, malformed-request and server errors
 * still propagate normally.
 */
export async function fetchSeriesRelease(
  seriesId: string,
  signal?: AbortSignal,
): Promise<FredRelease | null> {
  try {
    const raw = (await fredFetch("/series/release", { series_id: seriesId }, signal)) as {
      releases?: FredRelease[];
    };
    return raw.releases?.[0] ?? null;
  } catch (error) {
    if (isUnknownSeriesRelease(error)) return null;
    throw error;
  }
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
