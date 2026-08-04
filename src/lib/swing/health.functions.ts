import { createServerFn } from "@tanstack/react-start";

export type SwingOperationalState = "operational" | "degraded" | "offline";
export type SwingCheckState = "pass" | "warn" | "fail";

export interface SwingHealthCheck {
  key: string;
  label: string;
  state: SwingCheckState;
  value: string;
  detail: string;
  required: boolean;
}

export interface SwingOperationalHealth {
  asOf: string;
  state: SwingOperationalState;
  trusted: boolean;
  headline: string;
  checks: SwingHealthCheck[];
  universe: {
    target: number;
    active: number;
    readyWith90Bars: number;
    readyCoveragePct: number;
    latestRequiredDate: string;
  };
  tracker: {
    schemaAvailable: boolean;
    tracked: number;
    active: number;
    latestQuoteAt: string | null;
    latestQuoteAgeMinutes: number | null;
  };
  monitor: {
    lastStatus: string | null;
    lastStartedAt: string | null;
    lastSuccessAt: string | null;
    lastSuccessAgeMinutes: number | null;
    source: string | null;
    screened: number;
    deepScanned: number;
    surfaced: number;
    quotesUpdated: number;
    lastError: string | null;
  };
  eod: {
    lastStatus: string | null;
    lastStartedAt: string | null;
    lastRowsIngested: number;
    lastError: string | null;
    pendingBackfillDates: number;
    failedBackfillDates: number;
  };
  providers: Array<{
    code: string;
    callsMade: number;
    dailyLimit: number;
    lastStatus: string | null;
    lastCallAt: string | null;
    lastError: string | null;
    disabledUntil: string | null;
  }>;
}

const TARGET_EQUITIES = 3_000;
const MIN_ACTIVE_EQUITIES = 2_950;
const MIN_READY_COVERAGE = 0.95;
const MIN_HISTORY_BARS = 90;

export const getSwingOperationalHealth = createServerFn({ method: "GET" }).handler(
  async (): Promise<SwingOperationalHealth> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // New runtime tables are intentionally accessed loosely until generated
    // Supabase types refresh after deployment.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const now = new Date();
    const nowIso = now.toISOString();
    const latestRequiredDate = previousUtcBusinessDate(now);

    const { count: activeCount, error: activeError } = await supabaseAdmin
      .from("assets")
      .select("id", { count: "exact", head: true })
      .eq("active", true)
      .eq("asset_class", "equity");
    const active = activeError ? 0 : activeCount ?? 0;

    let readyWith90Bars = 0;
    let screenError: string | null = null;
    try {
      const { count, error } = await db
        .from("equity_technical_screen")
        .select("asset_id", { count: "exact", head: true })
        .gte("bars", MIN_HISTORY_BARS)
        .gte("as_of", latestRequiredDate);
      if (error) throw error;
      readyWith90Bars = count ?? 0;
    } catch (error) {
      screenError = error instanceof Error ? error.message : String(error);
    }

    let trackerSchemaAvailable = false;
    let tracked = 0;
    let activeTracked = 0;
    let latestQuoteAt: string | null = null;
    let trackerError: string | null = null;
    try {
      const [trackedResult, activeResult, quoteResult] = await Promise.all([
        db.from("swing_trade_setups").select("id", { count: "exact", head: true }),
        db
          .from("swing_trade_setups")
          .select("id", { count: "exact", head: true })
          .eq("outcome_status", "active"),
        db
          .from("swing_trade_price_snapshots")
          .select("observed_at")
          .order("observed_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (trackedResult.error) throw trackedResult.error;
      if (activeResult.error) throw activeResult.error;
      if (quoteResult.error) throw quoteResult.error;
      trackerSchemaAvailable = true;
      tracked = trackedResult.count ?? 0;
      activeTracked = activeResult.count ?? 0;
      latestQuoteAt = quoteResult.data?.observed_at ? String(quoteResult.data.observed_at) : null;
    } catch (error) {
      trackerError = error instanceof Error ? error.message : String(error);
    }

    let lastMonitor: MonitorRunRow | null = null;
    let lastSuccess: MonitorRunRow | null = null;
    let monitorTableError: string | null = null;
    try {
      const [lastResult, successResult] = await Promise.all([
        db
          .from("swing_monitor_runs")
          .select("source,status,started_at,finished_at,screened,deep_scanned,surfaced,quotes_updated,error")
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        db
          .from("swing_monitor_runs")
          .select("source,status,started_at,finished_at,screened,deep_scanned,surfaced,quotes_updated,error")
          .eq("status", "success")
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (lastResult.error) throw lastResult.error;
      if (successResult.error) throw successResult.error;
      lastMonitor = lastResult.data as MonitorRunRow | null;
      lastSuccess = successResult.data as MonitorRunRow | null;
    } catch (error) {
      monitorTableError = error instanceof Error ? error.message : String(error);
    }

    let lastEod: IngestionRunRow | null = null;
    try {
      const { data, error } = await db
        .from("ingestion_runs")
        .select("status,started_at,finished_at,rows_ingested,error")
        .eq("data_category", "price_daily_bulk")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      lastEod = data as IngestionRunRow | null;
    } catch {
      lastEod = null;
    }

    let pendingBackfillDates = 0;
    let failedBackfillDates = 0;
    try {
      const [pendingResult, failedResult] = await Promise.all([
        db
          .from("equity_eod_backfill_queue")
          .select("market_date", { count: "exact", head: true })
          .in("status", ["pending", "running"]),
        db
          .from("equity_eod_backfill_queue")
          .select("market_date", { count: "exact", head: true })
          .eq("status", "failed"),
      ]);
      pendingBackfillDates = pendingResult.count ?? 0;
      failedBackfillDates = failedResult.count ?? 0;
    } catch {
      pendingBackfillDates = 0;
      failedBackfillDates = 0;
    }

    const providers = await loadProviderHealth(db, nowIso.slice(0, 10));
    const readyCoveragePct = active > 0 ? readyWith90Bars / active * 100 : 0;
    const latestQuoteAgeMinutes = ageMinutes(latestQuoteAt, now);
    const lastSuccessAt = lastSuccess?.finished_at ?? lastSuccess?.started_at ?? null;
    const lastSuccessAgeMinutes = ageMinutes(lastSuccessAt, now);
    const lastEodAt = lastEod?.finished_at ?? lastEod?.started_at ?? null;
    const lastEodAgeMinutes = ageMinutes(lastEodAt, now);
    const monitorLimit = monitorFreshnessLimitMinutes(now);
    const eodLimit = eodFreshnessLimitMinutes(now);
    const insideMonitorWindow = isInsideMonitorWindow(now);

    const checks: SwingHealthCheck[] = [
      {
        key: "universe",
        label: "Managed universe",
        state: active >= MIN_ACTIVE_EQUITIES ? "pass" : active > 0 ? "fail" : "fail",
        value: `${active.toLocaleString()} / ${TARGET_EQUITIES.toLocaleString()}`,
        detail: active >= MIN_ACTIVE_EQUITIES
          ? "The deployed database contains the intended managed population."
          : "The engine is not allowed to claim full-universe operation while the active population is materially below target.",
        required: true,
      },
      {
        key: "technical_coverage",
        label: "Fresh 90-bar technical coverage",
        state:
          active >= MIN_ACTIVE_EQUITIES && readyCoveragePct >= MIN_READY_COVERAGE * 100
            ? "pass"
            : readyWith90Bars > 0
              ? "fail"
              : "fail",
        value: `${readyWith90Bars.toLocaleString()} (${readyCoveragePct.toFixed(1)}%)`,
        detail: screenError
          ? `Technical-screen table unavailable: ${screenError}`
          : `Operational requires at least ${(MIN_READY_COVERAGE * 100).toFixed(0)}% of the active universe to have ${MIN_HISTORY_BARS}+ completed bars through ${latestRequiredDate}.`,
        required: true,
      },
      {
        key: "tracker_schema",
        label: "Outcome tracker database",
        state: trackerSchemaAvailable ? "pass" : "fail",
        value: trackerSchemaAvailable ? `${tracked} tracked setups` : "unavailable",
        detail: trackerSchemaAvailable
          ? "Tracker setup and price-snapshot tables are queryable."
          : `Tracker schema/query failed${trackerError ? `: ${trackerError}` : "."}`,
        required: true,
      },
      {
        key: "monitor_heartbeat",
        label: "Swing monitor heartbeat",
        state:
          lastSuccessAgeMinutes !== null && lastSuccessAgeMinutes <= monitorLimit
            ? "pass"
            : lastSuccessAgeMinutes !== null
              ? "fail"
              : "fail",
        value: lastSuccessAt ? formatAge(lastSuccessAgeMinutes) : "never succeeded",
        detail: monitorTableError
          ? `Runtime heartbeat table unavailable: ${monitorTableError}`
          : `A successful monitor must be observed within the expected schedule window (${formatMinutes(monitorLimit)} maximum age right now).`,
        required: true,
      },
      {
        key: "intraday_quotes",
        label: "Tracked intraday quotes",
        state:
          activeTracked === 0
            ? "pass"
            : !insideMonitorWindow
              ? "warn"
              : latestQuoteAgeMinutes !== null && latestQuoteAgeMinutes <= 120
                ? "pass"
                : "fail",
        value:
          activeTracked === 0
            ? "not required — no active tracked setups"
            : latestQuoteAt
              ? formatAge(latestQuoteAgeMinutes)
              : "no quote observed",
        detail:
          activeTracked === 0
            ? "No active frozen setup currently requires an intraday quote."
            : insideMonitorWindow
              ? "While the monitor window is open, active setups require a successful quote within two hours."
              : "Markets/monitor window are closed, so stale intraday quotes do not by themselves make the engine untrusted.",
        required: insideMonitorWindow && activeTracked > 0,
      },
      {
        key: "bulk_eod",
        label: "Full-universe EOD pipeline",
        state:
          lastEod?.status === "success" && lastEodAgeMinutes !== null && lastEodAgeMinutes <= eodLimit
            ? "pass"
            : lastEod
              ? "fail"
              : "fail",
        value: lastEodAt ? `${lastEod.status} · ${formatAge(lastEodAgeMinutes)}` : "no successful bulk run yet",
        detail: lastEod?.error
          ? `Latest bulk EOD error: ${lastEod.error}`
          : "Bulk EOD is the scalable daily OHLCV path for keeping thousands of equities current without thousands of per-symbol API calls.",
        required: true,
      },
      {
        key: "backfill",
        label: "Historical bootstrap",
        state: pendingBackfillDates === 0 && failedBackfillDates === 0 ? "pass" : failedBackfillDates > 0 ? "warn" : "warn",
        value: `${pendingBackfillDates} pending · ${failedBackfillDates} failed`,
        detail: "Backfill progress is informational once the fresh 90-bar coverage gate has passed; until then it explains why coverage is still building.",
        required: false,
      },
    ];

    const requiredFailures = checks.filter((check) => check.required && check.state !== "pass");
    const offline = active === 0 || (readyWith90Bars === 0 && !trackerSchemaAvailable);
    const state: SwingOperationalState = offline
      ? "offline"
      : requiredFailures.length === 0
        ? "operational"
        : "degraded";

    return {
      asOf: nowIso,
      state,
      trusted: state === "operational",
      headline:
        state === "operational"
          ? "Operational: every required runtime and data-freshness gate is passing."
          : state === "offline"
            ? "Offline: the core data/runtime prerequisites are not available."
            : `${requiredFailures.length} required operational gate${requiredFailures.length === 1 ? " is" : "s are"} failing. Signals remain visible for diagnosis but should not be treated as fully live.`,
      checks,
      universe: {
        target: TARGET_EQUITIES,
        active,
        readyWith90Bars,
        readyCoveragePct,
        latestRequiredDate,
      },
      tracker: {
        schemaAvailable: trackerSchemaAvailable,
        tracked,
        active: activeTracked,
        latestQuoteAt,
        latestQuoteAgeMinutes,
      },
      monitor: {
        lastStatus: lastMonitor?.status ?? null,
        lastStartedAt: lastMonitor?.started_at ?? null,
        lastSuccessAt,
        lastSuccessAgeMinutes,
        source: lastMonitor?.source ?? null,
        screened: Number(lastMonitor?.screened ?? 0),
        deepScanned: Number(lastMonitor?.deep_scanned ?? 0),
        surfaced: Number(lastMonitor?.surfaced ?? 0),
        quotesUpdated: Number(lastMonitor?.quotes_updated ?? 0),
        lastError: lastMonitor?.error ?? null,
      },
      eod: {
        lastStatus: lastEod?.status ?? null,
        lastStartedAt: lastEod?.started_at ?? null,
        lastRowsIngested: Number(lastEod?.rows_ingested ?? 0),
        lastError: lastEod?.error ?? null,
        pendingBackfillDates,
        failedBackfillDates,
      },
      providers,
    };
  },
);

interface MonitorRunRow {
  source: string | null;
  status: string;
  started_at: string;
  finished_at: string | null;
  screened: number | null;
  deep_scanned: number | null;
  surfaced: number | null;
  quotes_updated: number | null;
  error: string | null;
}

interface IngestionRunRow {
  status: string;
  started_at: string;
  finished_at: string | null;
  rows_ingested: number | null;
  error: string | null;
}

async function loadProviderHealth(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  quotaDate: string,
): Promise<SwingOperationalHealth["providers"]> {
  try {
    const { data, error } = await db
      .from("provider_quotas")
      .select("provider_code,calls_made,daily_limit,last_status,last_call_at,last_error,disabled_until")
      .eq("quota_date", quotaDate)
      .in("provider_code", ["fmp", "tiingo", "twelvedata", "alphavantage"]);
    if (error) throw error;
    return (data ?? []).map((row: Record<string, unknown>) => ({
      code: String(row.provider_code ?? "unknown"),
      callsMade: Number(row.calls_made ?? 0),
      dailyLimit: Number(row.daily_limit ?? 0),
      lastStatus: row.last_status ? String(row.last_status) : null,
      lastCallAt: row.last_call_at ? String(row.last_call_at) : null,
      lastError: row.last_error ? String(row.last_error) : null,
      disabledUntil: row.disabled_until ? String(row.disabled_until) : null,
    }));
  } catch {
    return [];
  }
}

function ageMinutes(value: string | null, now: Date): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, (now.getTime() - time) / 60_000);
}

function previousUtcBusinessDate(now: Date): string {
  const value = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 12));
  while (value.getUTCDay() === 0 || value.getUTCDay() === 6) value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

function isInsideMonitorWindow(now: Date): boolean {
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  return day >= 1 && day <= 5 && hour >= 7 && hour <= 20;
}

function monitorFreshnessLimitMinutes(now: Date): number {
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  if (day === 0 || day === 6 || (day === 1 && hour < 7)) return 72 * 60;
  if (day >= 1 && day <= 5 && hour >= 7 && hour <= 20) return 120;
  return 18 * 60;
}

function eodFreshnessLimitMinutes(now: Date): number {
  const day = now.getUTCDay();
  if (day === 0 || day === 1) return 80 * 60;
  return 38 * 60;
}

function formatAge(minutes: number | null): string {
  if (minutes === null) return "unknown";
  if (minutes < 60) return `${Math.round(minutes)}m ago`;
  const hours = minutes / 60;
  if (hours < 48) return `${hours.toFixed(hours < 10 ? 1 : 0)}h ago`;
  return `${(hours / 24).toFixed(1)}d ago`;
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  return `${(minutes / 60).toFixed(minutes % 60 === 0 ? 0 : 1)}h`;
}
