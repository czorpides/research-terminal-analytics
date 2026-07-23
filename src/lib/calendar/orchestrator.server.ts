import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runUsGrowthPipeline } from "@/lib/analytics/growth-pipeline.server";
import { runUsInflationKalmanPipeline } from "@/lib/analytics/inflation-pipeline.server";
import { runUsLabourKalmanPipeline } from "@/lib/analytics/labour-pipeline.server";
import { runUsMarketRegimePipeline } from "@/lib/analytics/market-regime-pipeline.server";
import { runEquityIngest } from "@/lib/ingestion/equities/ingest.server";
import { runFredIngest } from "@/lib/ingestion/fred/ingest.server";
import { runUsInflationFredIngest } from "@/lib/ingestion/fred/inflation-ingest.server";
import { runUsLabourFredIngest } from "@/lib/ingestion/fred/labour-ingest.server";
import { runUsLiquidityFredIngest } from "@/lib/ingestion/fred/liquidity-ingest.server";
import { runUsMarketFredIngest } from "@/lib/ingestion/fred/market-ingest.server";
import { FRED_SERIES } from "@/lib/ingestion/fred/series";
import { runFundamentalsIngest } from "@/lib/ingestion/fundamentals/ingest.server";

import { fetchAlphaVantageReportedEarnings } from "./providers/earnings-calendar.server";
import type { CalendarRunResult, ScheduledDataEvent, ScheduledEventStatus } from "./types";

interface ExecutionOutcome {
  changed: number;
  revisions: number;
  failed: number;
  verified: boolean;
  detail: string;
  metadata: Record<string, unknown>;
}

interface CalendarRunSummary {
  startedAt: string;
  finishedAt: string;
  due: number;
  results: CalendarRunResult[];
}

const OVERVIEW_SERIES = new Set(FRED_SERIES.map((item) => item.seriesCode));

export async function runDueCalendarEvents(limit = 8): Promise<CalendarRunSummary> {
  const startedAt = new Date().toISOString();
  const now = new Date();
  await recoverStuckEvents(now);

  const { data, error } = await supabaseAdmin
    .from("scheduled_data_events")
    .select("*")
    .in("status", ["scheduled", "waiting"])
    .lte("scheduled_at", now.toISOString())
    .or(`next_retry_at.is.null,next_retry_at.lte.${now.toISOString()}`)
    .order("scheduled_at", { ascending: true })
    .limit(Math.max(1, Math.min(20, limit)));
  if (error) throw error;

  const events = (data ?? []).map(fromRow);
  const results: CalendarRunResult[] = [];
  for (const event of events) {
    const claimed = await claimEvent(event);
    if (!claimed) continue;
    results.push(await executeAndPersist(event));
  }

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    due: events.length,
    results,
  };
}

async function executeAndPersist(event: ScheduledDataEvent): Promise<CalendarRunResult> {
  const attemptedAt = new Date();
  const attempt = event.attemptCount + 1;
  let outcome: ExecutionOutcome;
  try {
    outcome =
      event.eventType === "earnings"
        ? await executeEarningsEvent(event)
        : await executeMacroEvent(event);
  } catch (error) {
    outcome = {
      changed: 0,
      revisions: 0,
      failed: 1,
      verified: false,
      detail: (error as Error).message,
      metadata: {},
    };
  }

  const resolution = resolveStatus(event, outcome, attempt, attemptedAt);
  const metadata = {
    ...event.metadata,
    ...outcome.metadata,
    latestAttempt: {
      at: attemptedAt.toISOString(),
      changed: outcome.changed,
      revisions: outcome.revisions,
      failed: outcome.failed,
      detail: outcome.detail,
    },
  };
  const { error } = await supabaseAdmin
    .from("scheduled_data_events")
    .update({
      status: resolution.status,
      attempt_count: attempt,
      last_attempt_at: attemptedAt.toISOString(),
      next_retry_at: resolution.nextRetryAt,
      verified_at: resolution.status === "verified" ? attemptedAt.toISOString() : null,
      last_error: resolution.lastError,
      metadata,
      updated_at: attemptedAt.toISOString(),
    })
    .eq("id", event.id);
  if (error) throw error;

  return {
    eventKey: event.eventKey,
    title: event.title,
    type: event.eventType,
    status: resolution.status,
    changed: outcome.changed,
    revisions: outcome.revisions,
    detail: outcome.detail,
  };
}

async function executeMacroEvent(event: ScheduledDataEvent): Promise<ExecutionOutcome> {
  const requested = new Set(event.engines);
  const isSafety = event.eventType === "safety_refresh";
  const series = event.seriesCodes;
  const concepts = isSafety ? new Map<string, string[]>() : await conceptsByEngine(series);
  const changedSeries = new Set<string>();
  let changed = 0;
  let revisions = 0;
  let failed = 0;
  const notes: string[] = [];

  if (requested.has("overview")) {
    const overviewSeries = (
      series.length ? series.filter((code) => OVERVIEW_SERIES.has(code)) : [...OVERVIEW_SERIES]
    ).sort();
    for (const seriesCode of overviewSeries) {
      const result = await runFredIngest(seriesCode);
      changed += result.rowsInserted;
      if (result.rowsInserted > 0) changedSeries.add(seriesCode);
      if (result.status === "failed") failed += 1;
    }
    notes.push(`overview ${overviewSeries.length} series`);
  }

  if (requested.has("growth")) {
    const result = await runUsGrowthPipeline({
      yearsBack: 30,
      conceptCodes: isSafety ? undefined : concepts.get("growth"),
    });
    changed += result.ingest.totalNewObservations;
    revisions += result.ingest.totalRevisions;
    failed += result.ingest.failed;
    addChangedSeries(changedSeries, result.ingest.results);
    notes.push(`growth ${result.ingest.results.length} indicators`);
  }

  if (requested.has("inflation")) {
    const result = await runUsInflationFredIngest({
      yearsBack: 30,
      conceptCodes: isSafety ? undefined : concepts.get("inflation"),
    });
    changed += result.totalNewObservations;
    revisions += result.totalRevisions;
    failed += result.failed;
    addChangedSeries(changedSeries, result.results);
    if (result.totalNewObservations + result.totalRevisions > 0) {
      await runUsInflationKalmanPipeline({ force: false });
    }
    notes.push(`inflation ${result.results.length} indicators`);
  }

  if (requested.has("liquidity")) {
    const result = await runUsLiquidityFredIngest({ yearsBack: 20 });
    changed += result.totalNewObservations;
    revisions += result.totalRevisions;
    failed += result.failed;
    addChangedSeries(changedSeries, result.results);
    notes.push(`liquidity ${result.results.length} indicators`);
  }

  if (requested.has("labour")) {
    const result = await runUsLabourFredIngest({
      yearsBack: 30,
      conceptCodes: isSafety ? undefined : concepts.get("labour"),
    });
    changed += result.totalNewObservations;
    revisions += result.totalRevisions;
    failed += result.failed;
    addChangedSeries(changedSeries, result.results);
    if (result.totalNewObservations + result.totalRevisions > 0) {
      await runUsLabourKalmanPipeline();
    }
    notes.push(`labour ${result.results.length} indicators`);
  }

  if (requested.has("market")) {
    const result = await runUsMarketFredIngest({
      yearsBack: 30,
      conceptCodes: isSafety ? undefined : concepts.get("market"),
    });
    changed += result.totalNewObservations;
    revisions += result.totalRevisions;
    failed += result.failed;
    addChangedSeries(changedSeries, result.results);
    if (result.totalNewObservations + result.totalRevisions > 0) {
      await runUsMarketRegimePipeline();
    }
    notes.push(`market ${result.results.length} indicators`);
  }

  const verified = isSafety ? failed === 0 : changed + revisions > 0;
  return {
    changed,
    revisions,
    failed,
    verified,
    detail: `${notes.join("; ")}. ${changed} new, ${revisions} revised, ${failed} failed.`,
    metadata: {
      changedSeries: [...changedSeries].sort(),
      checkedSeries: series,
      verification: isSafety
        ? "Safety pass completed without a failed ingestion."
        : "At least one tracked series produced a new or revised observation.",
    },
  };
}

async function executeEarningsEvent(event: ScheduledDataEvent): Promise<ExecutionOutcome> {
  if (!event.symbol || !event.assetId) throw new Error("Earnings event has no tracked asset");
  const fiscalDate =
    typeof event.metadata.fiscalDateEnding === "string" ? event.metadata.fiscalDateEnding : null;
  const history = await fetchAlphaVantageReportedEarnings(event.symbol);
  const reported = fiscalDate
    ? history.find((item) => item.fiscalDateEnding === fiscalDate)
    : history.find(
        (item) =>
          item.reportedDate >= event.scheduledAt.slice(0, 10) &&
          item.reportedDate <= new Date().toISOString().slice(0, 10),
      );
  if (!reported || reported.reportedEps === null) {
    return {
      changed: 0,
      revisions: 0,
      failed: 0,
      verified: false,
      detail: "The company is scheduled, but reported EPS is not yet available from the provider.",
      metadata: { reportedEarningsAvailable: false },
    };
  }

  const { data: source } = await supabaseAdmin
    .from("data_sources")
    .select("id")
    .eq("provider_code", "alphavantage")
    .maybeSingle();
  const { data: existing, error: readError } = await supabaseAdmin
    .from("earnings_events")
    .select("id,actual_eps")
    .eq("asset_id", event.assetId)
    .eq("period_end", reported.fiscalDateEnding)
    .order("scheduled_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (readError) throw readError;
  const changed =
    existing?.actual_eps === null ||
    existing?.actual_eps === undefined ||
    Math.abs(Number(existing.actual_eps) - reported.reportedEps) > 1e-9
      ? 1
      : 0;
  const row = {
    asset_id: event.assetId,
    period_end: reported.fiscalDateEnding,
    scheduled_at: `${reported.reportedDate}T22:15:00.000Z`,
    actual_eps: reported.reportedEps,
    estimate_eps: reported.estimatedEps,
    surprise_pct: reported.surprisePercent,
    source_id: source?.id ?? null,
  };
  const write = existing
    ? supabaseAdmin.from("earnings_events").update(row).eq("id", existing.id)
    : supabaseAdmin.from("earnings_events").insert(row);
  const { error: writeError } = await write;
  if (writeError) throw writeError;

  const [priceResult, fundamentalsResult] = await Promise.allSettled([
    runEquityIngest(event.symbol),
    runFundamentalsIngest(event.symbol),
  ]);
  const price =
    priceResult.status === "fulfilled"
      ? priceResult.value
      : {
          status: "failed" as const,
          rowsInserted: 0,
          error:
            priceResult.reason instanceof Error
              ? priceResult.reason.message
              : "price refresh failed",
        };
  const fundamentals =
    fundamentalsResult.status === "fulfilled"
      ? fundamentalsResult.value
      : {
          status: "failed" as const,
          rowsInserted: 0,
          error:
            fundamentalsResult.reason instanceof Error
              ? fundamentalsResult.reason.message
              : "fundamentals refresh failed",
        };
  const failed = (price.status === "failed" ? 1 : 0) + (fundamentals.status === "failed" ? 1 : 0);
  return {
    changed: changed + price.rowsInserted + fundamentals.rowsInserted,
    revisions: 0,
    failed,
    verified: true,
    detail: `Reported EPS is stored; price refresh ${price.status}; fundamentals refresh ${fundamentals.status}.`,
    metadata: {
      reportedEarningsAvailable: true,
      fiscalDateEnding: reported.fiscalDateEnding,
      reportedEps: reported.reportedEps,
      estimatedEps: reported.estimatedEps,
      surprisePercent: reported.surprisePercent,
      priceRefresh: price.status,
      fundamentalsRefresh: fundamentals.status,
    },
  };
}

async function conceptsByEngine(seriesCodes: string[]): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (!seriesCodes.length) return result;
  const { data, error } = await supabaseAdmin
    .from("indicator_registry")
    .select("engine,concept_code,series_code_native")
    .eq("is_active", true)
    .in("series_code_native", seriesCodes);
  if (error) throw error;
  for (const row of data ?? []) {
    const engine = String(row.engine);
    result.set(engine, [...(result.get(engine) ?? []), String(row.concept_code)]);
  }
  return result;
}

function addChangedSeries(
  target: Set<string>,
  rows: Array<{
    newObservations?: number;
    new_observations?: number;
    revisions?: number;
    new_revisions?: number;
    seriesCode?: string;
    series_code?: string;
  }>,
): void {
  for (const row of rows) {
    const additions = Number(row.newObservations ?? row.new_observations ?? 0);
    const revisions = Number(row.revisions ?? row.new_revisions ?? 0);
    const series = row.seriesCode ?? row.series_code;
    if (series && additions + revisions > 0) target.add(String(series));
  }
}

function resolveStatus(
  event: ScheduledDataEvent,
  outcome: ExecutionOutcome,
  attempt: number,
  now: Date,
): {
  status: ScheduledEventStatus;
  nextRetryAt: string | null;
  lastError: string | null;
} {
  if (outcome.verified) {
    return {
      status: "verified",
      nextRetryAt: null,
      lastError: outcome.failed ? `${outcome.failed} secondary refresh step(s) failed` : null,
    };
  }

  const windowHours = Number(event.metadata.verificationWindowHours ?? 36);
  const ageHours = (now.getTime() - new Date(event.scheduledAt).getTime()) / 3_600_000;
  const canRetry = ageHours <= windowHours && attempt < 18;
  if (canRetry) {
    const retryHours = event.eventType === "earnings" ? 4 : 2;
    return {
      status: "waiting",
      nextRetryAt: new Date(now.getTime() + retryHours * 3_600_000).toISOString(),
      lastError: outcome.failed ? outcome.detail : null,
    };
  }
  return {
    status: outcome.failed ? "failed" : "delayed",
    nextRetryAt: null,
    lastError: outcome.detail,
  };
}

async function claimEvent(event: ScheduledDataEvent): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("scheduled_data_events")
    .update({ status: "refreshing", updated_at: new Date().toISOString() })
    .eq("id", event.id)
    .in("status", ["scheduled", "waiting"])
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function recoverStuckEvents(now: Date): Promise<void> {
  const staleBefore = new Date(now.getTime() - 2 * 3_600_000).toISOString();
  const { error } = await supabaseAdmin
    .from("scheduled_data_events")
    .update({
      status: "waiting",
      next_retry_at: now.toISOString(),
      last_error: "Previous refresh did not complete; returned to the retry queue.",
      updated_at: now.toISOString(),
    })
    .eq("status", "refreshing")
    .lt("updated_at", staleBefore);
  if (error) throw error;
}

function fromRow(row: {
  id: string;
  event_key: string;
  event_type: string;
  provider_code: string;
  provider_event_id: string | null;
  title: string;
  region_code: string | null;
  symbol: string | null;
  asset_id: string | null;
  scheduled_at: string;
  status: string;
  series_codes: string[];
  engines: string[];
  attempt_count: number;
  last_attempt_at: string | null;
  next_retry_at: string | null;
  verified_at: string | null;
  last_error: string | null;
  metadata: unknown;
}): ScheduledDataEvent {
  return {
    id: row.id,
    eventKey: row.event_key,
    eventType: row.event_type as ScheduledDataEvent["eventType"],
    providerCode: row.provider_code,
    providerEventId: row.provider_event_id,
    title: row.title,
    regionCode: row.region_code,
    symbol: row.symbol,
    assetId: row.asset_id,
    scheduledAt: row.scheduled_at,
    status: row.status as ScheduledDataEvent["status"],
    seriesCodes: row.series_codes,
    engines: row.engines,
    attemptCount: row.attempt_count,
    lastAttemptAt: row.last_attempt_at,
    nextRetryAt: row.next_retry_at,
    verifiedAt: row.verified_at,
    lastError: row.last_error,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
  };
}
