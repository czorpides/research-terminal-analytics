-- Phase 2: read-only, provider-truthful fundamentals and earnings pipeline health.
-- Does not backfill, estimate, score, or alter any observation.
CREATE OR REPLACE VIEW public.fundamentals_pipeline_health
WITH (security_invoker=true)
AS SELECT
 (SELECT count(*) FROM public.assets WHERE active=true AND asset_class='equity')::bigint AS active_equities,
 (SELECT count(DISTINCT subject_id) FROM public.latest_asset_fundamentals)::bigint AS assets_with_current_metrics,
 (SELECT count(*) FROM public.latest_asset_fundamentals)::bigint AS current_metric_rows,
 (SELECT max(as_of) FROM public.latest_asset_fundamentals) AS latest_metric_asof,
 (SELECT count(DISTINCT asset_id) FROM public.fundamental_filings)::bigint AS assets_with_filings,
 (SELECT count(*) FROM public.fundamental_filings)::bigint AS filing_count,
 (SELECT max(ingested_at) FROM public.fundamental_filings) AS latest_filing_ingested,
 (SELECT count(*) FROM public.earnings_events)::bigint AS earnings_event_count,
 (SELECT count(*) FROM public.earnings_events WHERE scheduled_at >= now())::bigint AS upcoming_earnings_events,
 (SELECT count(*) FROM public.ingestion_runs
   WHERE data_category::text='fundamentals' AND status::text='running'
   AND started_at < now()-interval '6 hours')::bigint AS stale_fundamentals_runs,
 (SELECT max(finished_at) FROM public.ingestion_runs
   WHERE data_category::text='fundamentals' AND status::text='success') AS last_completed_fundamentals_run,
 (SELECT max(started_at) FROM public.ingestion_runs
   WHERE data_category::text='fundamentals') AS last_attempted_fundamentals_run,
 (SELECT count(*) FROM public.ingestion_runs
   WHERE data_category::text='fundamentals' AND status::text='success'
   AND started_at>=now()-interval '7 days')::bigint AS successful_fundamentals_runs_7d,
 (SELECT count(*) FROM public.ingestion_runs
   WHERE data_category::text='fundamentals' AND status::text='failed'
   AND started_at>=now()-interval '7 days')::bigint AS failed_fundamentals_runs_7d,
 (SELECT last_status FROM public.provider_quotas WHERE provider_code='fmp'
   ORDER BY quota_date DESC, updated_at DESC LIMIT 1) AS fmp_last_status,
 (SELECT left(last_error,200) FROM public.provider_quotas WHERE provider_code='fmp'
   ORDER BY quota_date DESC, updated_at DESC LIMIT 1) AS fmp_last_error,
 (SELECT last_call_at FROM public.provider_quotas WHERE provider_code='fmp'
   ORDER BY quota_date DESC, updated_at DESC LIMIT 1) AS fmp_last_call_at;
REVOKE ALL ON public.fundamentals_pipeline_health FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.fundamentals_pipeline_health TO service_role;
COMMENT ON VIEW public.fundamentals_pipeline_health IS
'Read-only measured coverage, freshness and provider-entitlement health. A queued cron HTTP call does not imply data ingestion.';
