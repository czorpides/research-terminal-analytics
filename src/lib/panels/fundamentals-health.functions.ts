import { createServerFn } from "@tanstack/react-start";

export interface FundamentalsPipelineHealth {
  activeEquities: number;
  assetsWithCurrentMetrics: number;
  currentMetricRows: number;
  latestMetricAsOf: string | null;
  assetsWithFilings: number;
  filingCount: number;
  latestFilingIngested: string | null;
  earningsEventCount: number;
  upcomingEarningsEvents: number;
  staleFundamentalsRuns: number;
  lastCompletedFundamentalsRun: string | null;
  lastAttemptedFundamentalsRun: string | null;
  successfulRuns7d: number;
  failedRuns7d: number;
  fmpLastStatus: string | null;
  fmpLastError: string | null;
  fmpLastCallAt: string | null;
  warnings: string[];
}

interface HealthRow {
  active_equities: number;
  assets_with_current_metrics: number;
  current_metric_rows: number;
  latest_metric_asof: string | null;
  assets_with_filings: number;
  filing_count: number;
  latest_filing_ingested: string | null;
  earnings_event_count: number;
  upcoming_earnings_events: number;
  stale_fundamentals_runs: number;
  last_completed_fundamentals_run: string | null;
  last_attempted_fundamentals_run: string | null;
  successful_fundamentals_runs_7d: number;
  failed_fundamentals_runs_7d: number;
  fmp_last_status: string | null;
  fmp_last_error: string | null;
  fmp_last_call_at: string | null;
}

/** Dedicated source-of-truth health; never infer success from cron enqueue. */
export const getFundamentalsPipelineHealth = createServerFn({ method: "GET" })
  .handler(async (): Promise<FundamentalsPipelineHealth> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // View is installed additively; generated API types intentionally lag SQL migrations.
    const { data, error } = await supabaseAdmin
      .from("fundamentals_pipeline_health" as "assets")
      .select("*")
      .single();
    if (error) throw new Error("Fundamentals pipeline health unavailable: " + error.message);
    const r = data as unknown as HealthRow;
    const number = (v: unknown) => Number(v ?? 0);
    const coverage = number(r.active_equities) > 0
      ? number(r.assets_with_filings) / number(r.active_equities) : 0;
    const warnings: string[] = [];
    if (r.fmp_last_status === "entitlement")
      warnings.push("FMP account entitlement blocks the current fundamentals endpoint; no historical observations can be assumed refreshed.");
    if (number(r.stale_fundamentals_runs) > 0)
      warnings.push("Interrupted/stuck fundamentals ingestion runs require reconciliation.");
    if (number(r.earnings_event_count) === 0)
      warnings.push("No earnings-event calendar or actual-versus-consensus records have been ingested.");
    if (coverage < 0.5)
      warnings.push("Auditable statement filing coverage remains below 50% of the monitored equity universe.");
    if (number(r.successful_fundamentals_runs_7d) === 0)
      warnings.push("No completed successful fundamentals ingestion runs in the past seven days.");
    return {
      activeEquities: number(r.active_equities),
      assetsWithCurrentMetrics: number(r.assets_with_current_metrics),
      currentMetricRows: number(r.current_metric_rows),
      latestMetricAsOf: r.latest_metric_asof,
      assetsWithFilings: number(r.assets_with_filings),
      filingCount: number(r.filing_count),
      latestFilingIngested: r.latest_filing_ingested,
      earningsEventCount: number(r.earnings_event_count),
      upcomingEarningsEvents: number(r.upcoming_earnings_events),
      staleFundamentalsRuns: number(r.stale_fundamentals_runs),
      lastCompletedFundamentalsRun: r.last_completed_fundamentals_run,
      lastAttemptedFundamentalsRun: r.last_attempted_fundamentals_run,
      successfulRuns7d: number(r.successful_fundamentals_runs_7d),
      failedRuns7d: number(r.failed_fundamentals_runs_7d),
      fmpLastStatus: r.fmp_last_status,
      fmpLastError: r.fmp_last_error,
      fmpLastCallAt: r.fmp_last_call_at,
      warnings,
    };
  });
