import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { fetchReleaseDates, fetchSeriesRelease } from "@/lib/ingestion/fred/client.server";
import { FRED_SERIES } from "@/lib/ingestion/fred/series";

import { fetchAlphaVantageEarningsCalendar } from "./providers/earnings-calendar.server";
import type { CalendarSyncSummary } from "./types";

interface TrackedSeries {
  seriesCode: string;
  engines: string[];
  regions: string[];
}

interface ReleaseMapping {
  source_series: string;
  provider_release_id: string;
  release_name: string;
  release_link: string | null;
  engines: string[];
  region_codes: string[];
}

export async function syncReleaseCalendar(): Promise<CalendarSyncSummary> {
  const startedAt = new Date().toISOString();
  const summary: CalendarSyncSummary = {
    startedAt,
    finishedAt: startedAt,
    fred: { status: "success", mappings: 0, eventsUpserted: 0 },
    earnings: {
      status: "success",
      providerRows: 0,
      trackedEventsUpserted: 0,
    },
    safetyEventsUpserted: 0,
  };

  try {
    const tracked = await getTrackedFredSeries();
    const mappings = await resolveFredMappings(tracked);
    summary.fred.mappings = mappings.length;
    summary.fred.eventsUpserted = await syncFredEvents(mappings);
  } catch (error) {
    summary.fred = {
      ...summary.fred,
      status: "failed",
      error: (error as Error).message,
    };
  }

  try {
    if (!process.env.ALPHAVANTAGE_API_KEY) {
      summary.earnings.status = "skipped";
      summary.earnings.error =
        "ALPHAVANTAGE_API_KEY is not configured; macro scheduling remains active.";
    } else {
      const result = await syncEarningsEvents();
      summary.earnings.providerRows = result.providerRows;
      summary.earnings.trackedEventsUpserted = result.trackedEventsUpserted;
    }
  } catch (error) {
    summary.earnings.status = "failed";
    summary.earnings.error = (error as Error).message;
  }

  summary.safetyEventsUpserted = await syncSafetyEvents();
  summary.finishedAt = new Date().toISOString();
  return summary;
}

async function getTrackedFredSeries(): Promise<TrackedSeries[]> {
  const { data: registry, error } = await supabaseAdmin
    .from("indicator_registry")
    .select("series_code_native,engine,regions!inner(code)")
    .eq("is_active", true);
  if (error) throw error;

  const tracked = new Map<string, { engines: Set<string>; regions: Set<string> }>();
  const add = (seriesCode: string, engine: string, region: string) => {
    const current = tracked.get(seriesCode) ?? { engines: new Set(), regions: new Set() };
    current.engines.add(engine);
    current.regions.add(region);
    tracked.set(seriesCode, current);
  };

  for (const row of registry ?? []) {
    const relation = row.regions as unknown as { code?: string } | Array<{ code?: string }> | null;
    const region = Array.isArray(relation) ? relation[0]?.code : relation?.code;
    add(String(row.series_code_native), String(row.engine), region ? String(region) : "US");
  }
  for (const spec of FRED_SERIES) add(spec.seriesCode, "overview", spec.region);

  return [...tracked.entries()]
    .map(([seriesCode, value]) => ({
      seriesCode,
      engines: [...value.engines].sort(),
      regions: [...value.regions].sort(),
    }))
    .sort((first, second) => first.seriesCode.localeCompare(second.seriesCode));
}

async function resolveFredMappings(tracked: TrackedSeries[]): Promise<ReleaseMapping[]> {
  const seriesCodes = tracked.map((item) => item.seriesCode);
  const { data: existing, error } = await supabaseAdmin
    .from("release_series_mappings")
    .select("source_series,provider_release_id,release_name,release_link,engines,region_codes")
    .eq("provider_code", "fred")
    .in("source_series", seriesCodes);
  if (error) throw error;

  const bySeries = new Map(
    ((existing ?? []) as ReleaseMapping[]).map((item) => [item.source_series, item]),
  );

  for (const item of tracked) {
    const current = bySeries.get(item.seriesCode);
    if (current) {
      const engines = unique([...current.engines, ...item.engines]);
      const regions = unique([...current.region_codes, ...item.regions]);
      if (
        engines.join("|") !== current.engines.join("|") ||
        regions.join("|") !== current.region_codes.join("|")
      ) {
        await supabaseAdmin
          .from("release_series_mappings")
          .update({ engines, region_codes: regions, updated_at: new Date().toISOString() })
          .eq("provider_code", "fred")
          .eq("source_series", item.seriesCode);
        current.engines = engines;
        current.region_codes = regions;
      }
      continue;
    }

    const release = await fetchSeriesRelease(item.seriesCode);
    if (!release) continue;
    const mapping: ReleaseMapping = {
      source_series: item.seriesCode,
      provider_release_id: String(release.id),
      release_name: release.name,
      release_link: release.link ?? null,
      engines: item.engines,
      region_codes: item.regions,
    };
    const { error: insertError } = await supabaseAdmin.from("release_series_mappings").upsert(
      {
        provider_code: "fred",
        ...mapping,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider_code,source_series" },
    );
    if (insertError) throw insertError;
    bySeries.set(item.seriesCode, mapping);
  }

  return tracked
    .map((item) => bySeries.get(item.seriesCode))
    .filter((item): item is ReleaseMapping => Boolean(item));
}

async function syncFredEvents(mappings: ReleaseMapping[]): Promise<number> {
  const start = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
  const end = new Date(Date.now() + 120 * 86_400_000).toISOString().slice(0, 10);
  const dates = await fetchReleaseDates({ start, end, includeDatesWithoutData: true });
  const byRelease = new Map<string, ReleaseMapping[]>();
  for (const mapping of mappings) {
    const rows = byRelease.get(mapping.provider_release_id) ?? [];
    rows.push(mapping);
    byRelease.set(mapping.provider_release_id, rows);
  }

  const events = dates.flatMap((releaseDate) => {
    const rows = byRelease.get(String(releaseDate.releaseId));
    if (!rows?.length) return [];
    const seriesCodes = unique(rows.map((row) => row.source_series));
    const engines = unique(rows.flatMap((row) => row.engines));
    const regions = unique(rows.flatMap((row) => row.region_codes));
    const link = rows.find((row) => row.release_link)?.release_link ?? null;
    return [
      {
        event_key: `fred:${releaseDate.releaseId}:${releaseDate.date}`,
        event_type: "macro_release" as const,
        provider_code: "fred",
        provider_event_id: String(releaseDate.releaseId),
        title: releaseDate.releaseName,
        region_code: regions.length === 1 ? regions[0] : null,
        scheduled_at: `${releaseDate.date}T12:00:00.000Z`,
        series_codes: seriesCodes,
        engines,
        metadata: {
          officialDateOnly: true,
          sourceLink: link,
          verificationWindowHours: 36,
          explanation:
            "FRED publishes the official release date, not a dependable availability time. The terminal polls after midday UTC and verifies that a newer observation actually arrived.",
        },
        updated_at: new Date().toISOString(),
      },
    ];
  });
  if (dates.length) {
    await cancelRemovedFutureEvents({
      providerCode: "fred",
      eventType: "macro_release",
      activeKeys: events.map((event) => event.event_key),
      end: `${end}T23:59:59.999Z`,
    });
  }
  if (!events.length) return 0;
  const { error } = await supabaseAdmin
    .from("scheduled_data_events")
    .upsert(events, { onConflict: "event_key" });
  if (error) throw error;
  return events.length;
}

async function syncEarningsEvents(): Promise<{
  providerRows: number;
  trackedEventsUpserted: number;
}> {
  const [providerEvents, assetsResult, sourceResult] = await Promise.all([
    fetchAlphaVantageEarningsCalendar("3month"),
    supabaseAdmin.from("assets").select("id,symbol,name").eq("active", true),
    supabaseAdmin
      .from("data_sources")
      .select("id")
      .eq("provider_code", "alphavantage")
      .maybeSingle(),
  ]);
  if (assetsResult.error) throw assetsResult.error;
  if (sourceResult.error) throw sourceResult.error;
  const assets = new Map(
    (assetsResult.data ?? []).map((asset) => [
      String(asset.symbol).toUpperCase(),
      { id: String(asset.id), name: String(asset.name) },
    ]),
  );

  const tracked = providerEvents.flatMap((event) => {
    const asset = assets.get(event.symbol);
    if (!asset) return [];
    const fiscalKey = event.fiscalDateEnding ?? "unknown-period";
    return [
      {
        event_key: `alphavantage:earnings:${event.symbol}:${event.reportDate}:${fiscalKey}`,
        event_type: "earnings" as const,
        provider_code: "alphavantage",
        provider_event_id: `${event.symbol}:${fiscalKey}`,
        title: `${event.symbol} earnings`,
        symbol: event.symbol,
        asset_id: asset.id,
        scheduled_at: `${event.reportDate}T22:15:00.000Z`,
        series_codes: [] as string[],
        engines: ["prices", "fundamentals"],
        metadata: {
          companyName: event.name || asset.name,
          fiscalDateEnding: event.fiscalDateEnding,
          estimateEps: event.estimate,
          currency: event.currency,
          timing: "date supplied; refresh begins after the US close and retries next morning",
        },
        updated_at: new Date().toISOString(),
      },
    ];
  });
  await cancelRemovedFutureEvents({
    providerCode: "alphavantage",
    eventType: "earnings",
    activeKeys: tracked.map((event) => event.event_key),
    end: new Date(Date.now() + 100 * 86_400_000).toISOString(),
  });
  if (tracked.length) {
    const { error } = await supabaseAdmin
      .from("scheduled_data_events")
      .upsert(tracked, { onConflict: "event_key" });
    if (error) throw error;
  }

  for (const event of providerEvents) {
    const asset = assets.get(event.symbol);
    if (!asset || !event.fiscalDateEnding) continue;
    const { data: existing, error: readError } = await supabaseAdmin
      .from("earnings_events")
      .select("id")
      .eq("asset_id", asset.id)
      .eq("period_end", event.fiscalDateEnding)
      .order("scheduled_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (readError) throw readError;
    const row = {
      asset_id: asset.id,
      period_end: event.fiscalDateEnding,
      scheduled_at: `${event.reportDate}T22:15:00.000Z`,
      estimate_eps: event.estimate,
      source_id: sourceResult.data?.id ?? null,
    };
    const write = existing
      ? supabaseAdmin.from("earnings_events").update(row).eq("id", existing.id)
      : supabaseAdmin.from("earnings_events").insert(row);
    const { error: writeError } = await write;
    if (writeError) throw writeError;
  }
  return { providerRows: providerEvents.length, trackedEventsUpserted: tracked.length };
}

async function syncSafetyEvents(): Promise<number> {
  const now = new Date();
  const events: Array<Database["public"]["Tables"]["scheduled_data_events"]["Insert"]> = [];
  const dailyOverviewSeries = FRED_SERIES.filter((series) => series.cadence === "daily").map(
    (series) => series.seriesCode,
  );
  for (let dayOffset = 0; dayOffset < 21; dayOffset += 1) {
    const date = new Date(now.getTime() + dayOffset * 86_400_000);
    const dateText = date.toISOString().slice(0, 10);
    const weekday = date.getUTCDay();
    if (weekday >= 1 && weekday <= 5) {
      events.push(
        safetyEvent({
          key: `safety:overview-daily:${dateText}`,
          date: dateText,
          time: "07:15",
          title: "Daily rates and markets catch-up",
          engines: ["overview"],
          seriesCodes: dailyOverviewSeries,
          scope: "daily overview",
        }),
        safetyEvent({
          key: `safety:liquidity:${dateText}`,
          date: dateText,
          time: "07:25",
          title: "Daily liquidity catch-up",
          engines: ["liquidity"],
          scope: "daily liquidity",
        }),
        safetyEvent({
          key: `safety:market-engine:${dateText}`,
          date: dateText,
          time: "07:35",
          title: "Daily market-engine catch-up",
          engines: ["market"],
          scope: "daily market engine",
        }),
      );
    }
    if (weekday === 0) {
      const weekly = [
        ["overview", "08:15"],
        ["growth", "08:25"],
        ["inflation", "08:35"],
        ["liquidity", "08:45"],
        ["labour", "08:55"],
        ["market", "09:05"],
      ] as const;
      for (const [engine, time] of weekly) {
        events.push(
          safetyEvent({
            key: `safety:weekly-${engine}:${dateText}`,
            date: dateText,
            time,
            title: `Weekly ${engine} revision check`,
            engines: [engine],
            scope: `weekly ${engine}`,
          }),
        );
      }
    }
  }
  const { error } = await supabaseAdmin
    .from("scheduled_data_events")
    .upsert(events, { onConflict: "event_key" });
  if (error) throw error;
  return events.length;
}

function safetyEvent({
  key,
  date,
  time,
  title,
  engines,
  seriesCodes = [],
  scope,
}: {
  key: string;
  date: string;
  time: string;
  title: string;
  engines: string[];
  seriesCodes?: string[];
  scope: string;
}): Database["public"]["Tables"]["scheduled_data_events"]["Insert"] {
  return {
    event_key: key,
    event_type: "safety_refresh",
    provider_code: "internal",
    title,
    scheduled_at: `${date}T${time}:00.000Z`,
    series_codes: seriesCodes,
    engines,
    metadata: {
      scope,
      explanation:
        "A bounded safety pass catches revisions, late postings, holidays and provider-calendar mismatches.",
    },
    updated_at: new Date().toISOString(),
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

async function cancelRemovedFutureEvents({
  providerCode,
  eventType,
  activeKeys,
  end,
}: {
  providerCode: string;
  eventType: "macro_release" | "earnings";
  activeKeys: string[];
  end: string;
}): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("scheduled_data_events")
    .select("id,event_key")
    .eq("provider_code", providerCode)
    .eq("event_type", eventType)
    .in("status", ["scheduled", "waiting"])
    .gte("scheduled_at", new Date().toISOString())
    .lte("scheduled_at", end);
  if (error) throw error;
  const active = new Set(activeKeys);
  const cancelledIds = (data ?? [])
    .filter((event) => !active.has(String(event.event_key)))
    .map((event) => String(event.id));
  if (!cancelledIds.length) return;
  const { error: updateError } = await supabaseAdmin
    .from("scheduled_data_events")
    .update({
      status: "cancelled",
      next_retry_at: null,
      last_error: "The provider calendar no longer lists this future date.",
      updated_at: new Date().toISOString(),
    })
    .in("id", cancelledIds);
  if (updateError) throw updateError;
}
