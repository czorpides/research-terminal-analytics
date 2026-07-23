import { createServerFn } from "@tanstack/react-start";

export interface ReleaseCalendarEventView {
  id: string;
  type: "macro_release" | "earnings" | "safety_refresh";
  title: string;
  provider: string;
  scheduledAt: string;
  status: "scheduled" | "refreshing" | "waiting" | "verified" | "delayed" | "failed" | "cancelled";
  region: string | null;
  symbol: string | null;
  engines: string[];
  seriesCount: number;
  attemptCount: number;
  verifiedAt: string | null;
  nextRetryAt: string | null;
  explanation: string;
  sourceLink: string | null;
}

export interface ReleaseCalendarDashboard {
  generatedAt: string;
  calendarUpdatedAt: string | null;
  lastWorkerAttemptAt: string | null;
  upcoming: ReleaseCalendarEventView[];
  recent: ReleaseCalendarEventView[];
  counts: {
    nextSevenDays: number;
    macro: number;
    earnings: number;
    waiting: number;
    delayed: number;
    failed: number;
  };
}

export const getReleaseCalendarDashboard = createServerFn({ method: "GET" }).handler(
  async (): Promise<ReleaseCalendarDashboard> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date();
    const start = new Date(now.getTime() - 14 * 86_400_000).toISOString();
    const end = new Date(now.getTime() + 120 * 86_400_000).toISOString();
    const { data, error } = await supabaseAdmin
      .from("scheduled_data_events")
      .select(
        "id,event_type,title,provider_code,scheduled_at,status,region_code,symbol,engines,series_codes,attempt_count,verified_at,next_retry_at,metadata,updated_at,last_attempt_at",
      )
      .gte("scheduled_at", start)
      .lte("scheduled_at", end)
      .order("scheduled_at", { ascending: true })
      .limit(600);
    if (error) throw error;

    const events = (data ?? []).map((row) => {
      const metadata = (row.metadata ?? {}) as Record<string, unknown>;
      return {
        id: String(row.id),
        type: row.event_type as ReleaseCalendarEventView["type"],
        title: String(row.title),
        provider: String(row.provider_code),
        scheduledAt: String(row.scheduled_at),
        status: row.status as ReleaseCalendarEventView["status"],
        region: row.region_code ? String(row.region_code) : null,
        symbol: row.symbol ? String(row.symbol) : null,
        engines: (row.engines ?? []).map(String),
        seriesCount: (row.series_codes ?? []).length,
        attemptCount: Number(row.attempt_count ?? 0),
        verifiedAt: row.verified_at ? String(row.verified_at) : null,
        nextRetryAt: row.next_retry_at ? String(row.next_retry_at) : null,
        explanation:
          typeof metadata.explanation === "string"
            ? metadata.explanation
            : defaultExplanation(String(row.event_type)),
        sourceLink: typeof metadata.sourceLink === "string" ? metadata.sourceLink : null,
        updatedAt: String(row.updated_at),
        lastAttemptAt: row.last_attempt_at ? String(row.last_attempt_at) : null,
      };
    });
    const nowMs = now.getTime();
    const sevenDays = nowMs + 7 * 86_400_000;
    const upcoming = events
      .filter(
        (event) =>
          event.status !== "cancelled" &&
          new Date(event.scheduledAt).getTime() >= nowMs - 60 * 60 * 1000,
      )
      .slice(0, 100);
    const recent = events
      .filter((event) => new Date(event.scheduledAt).getTime() < nowMs)
      .reverse()
      .slice(0, 30);

    return {
      generatedAt: now.toISOString(),
      calendarUpdatedAt: maxDate(events.map((event) => event.updatedAt)),
      lastWorkerAttemptAt: maxDate(events.map((event) => event.lastAttemptAt)),
      upcoming: upcoming.map(stripInternalDates),
      recent: recent.map(stripInternalDates),
      counts: {
        nextSevenDays: upcoming.filter(
          (event) => new Date(event.scheduledAt).getTime() <= sevenDays,
        ).length,
        macro: upcoming.filter((event) => event.type === "macro_release").length,
        earnings: upcoming.filter((event) => event.type === "earnings").length,
        waiting: events.filter((event) => event.status === "waiting").length,
        delayed: events.filter((event) => event.status === "delayed").length,
        failed: events.filter((event) => event.status === "failed").length,
      },
    };
  },
);

function stripInternalDates(
  event: ReleaseCalendarEventView & { updatedAt: string; lastAttemptAt: string | null },
): ReleaseCalendarEventView {
  const { updatedAt: _updatedAt, lastAttemptAt: _lastAttemptAt, ...view } = event;
  return view;
}

function maxDate(values: Array<string | null>): string | null {
  return (
    values
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null
  );
}

function defaultExplanation(type: string): string {
  if (type === "earnings")
    return "The terminal checks for reported EPS, then refreshes price and fundamental evidence.";
  if (type === "safety_refresh")
    return "A catch-up pass checks for late releases, revisions and provider-calendar mismatches.";
  return "The terminal refreshes the mapped series and verifies that a new or revised observation arrived.";
}
