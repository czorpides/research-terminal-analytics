-- Correct the fundamental metric identifiers used by the Opportunity Radar
-- readiness RPC. The canonical fundamentals pipeline stores lower-case metric
-- codes (for example fund_pe_ttm), so readiness must use the same vocabulary.

CREATE OR REPLACE FUNCTION public.get_opportunity_radar_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active integer := 0;
  v_price_ready integer := 0;
  v_history_252 integer := 0;
  v_technical_scores integer := 0;
  v_fundamentals integer := 0;
  v_two_period_statements integer := 0;
  v_pending_backfill integer := 0;
  v_failed_backfill integer := 0;
  v_bulk_date date := NULL;
  v_bulk_finished timestamptz := NULL;
  v_bulk_rows integer := 0;
  v_bulk_status text := NULL;
BEGIN
  SELECT count(*)::integer INTO v_active
  FROM public.assets
  WHERE active = true AND asset_class = 'equity';

  SELECT
    nullif(details->>'date', '')::date,
    coalesce(finished_at, started_at),
    rows_ingested,
    status::text
  INTO v_bulk_date, v_bulk_finished, v_bulk_rows, v_bulk_status
  FROM public.ingestion_runs
  WHERE data_category = 'price_daily_bulk'
    AND status = 'success'
  ORDER BY started_at DESC
  LIMIT 1;

  SELECT count(*)::integer INTO v_price_ready
  FROM public.assets a
  JOIN public.equity_technical_screen s ON s.asset_id = a.id
  WHERE a.active = true
    AND a.asset_class = 'equity'
    AND (v_bulk_date IS NULL OR s.as_of >= v_bulk_date);

  SELECT count(*)::integer INTO v_history_252
  FROM public.assets a
  JOIN public.equity_technical_screen s ON s.asset_id = a.id
  WHERE a.active = true
    AND a.asset_class = 'equity'
    AND s.bars >= 252;

  IF v_bulk_finished IS NOT NULL THEN
    SELECT count(*)::integer INTO v_technical_scores
    FROM (
      SELECT s.subject_id
      FROM public.scores s
      JOIN public.assets a ON a.id = s.subject_id
      WHERE s.subject_type = 'asset'
        AND s.score_type IN ('momentum', 'trend', 'volatility')
        AND s.computed_at >= v_bulk_finished
        AND a.active = true
        AND a.asset_class = 'equity'
      GROUP BY s.subject_id
      HAVING count(DISTINCT s.score_type) = 3
    ) q;
  END IF;

  SELECT count(*)::integer INTO v_fundamentals
  FROM (
    SELECT f.subject_id
    FROM public.latest_asset_fundamentals f
    JOIN public.assets a ON a.id = f.subject_id
    WHERE a.active = true
      AND a.asset_class = 'equity'
      AND f.metric_code IN (
        'fund_pe_ttm', 'fund_pb', 'fund_ps_ttm', 'fund_ev_ebitda_ttm',
        'fund_fcf_yield_ttm', 'fund_roe_ttm', 'fund_roic_ttm',
        'fund_debt_equity', 'fund_current_ratio', 'fund_market_cap'
      )
    GROUP BY f.subject_id
    HAVING count(DISTINCT f.metric_code) >= 5
  ) q;

  SELECT count(*)::integer INTO v_two_period_statements
  FROM (
    SELECT ff.asset_id
    FROM public.fundamental_filings ff
    JOIN public.assets a ON a.id = ff.asset_id
    WHERE a.active = true
      AND a.asset_class = 'equity'
      AND ff.fiscal_period = 'FY'
    GROUP BY ff.asset_id
    HAVING count(DISTINCT ff.period_end) >= 2
  ) q;

  SELECT count(*)::integer INTO v_pending_backfill
  FROM public.equity_eod_backfill_queue
  WHERE status IN ('pending', 'running');

  SELECT count(*)::integer INTO v_failed_backfill
  FROM public.equity_eod_backfill_queue
  WHERE status = 'failed';

  RETURN jsonb_build_object(
    'asOf', now(),
    'activeEquities', v_active,
    'latestBulkDate', v_bulk_date,
    'latestBulkFinishedAt', v_bulk_finished,
    'latestBulkRows', v_bulk_rows,
    'latestBulkStatus', v_bulk_status,
    'freshPriceAssets', v_price_ready,
    'history252Assets', v_history_252,
    'freshTechnicalScoreAssets', v_technical_scores,
    'fundamentalAssets', v_fundamentals,
    'twoPeriodStatementAssets', v_two_period_statements,
    'pendingBackfillDates', v_pending_backfill,
    'failedBackfillDates', v_failed_backfill
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_opportunity_radar_health() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_opportunity_radar_health() TO service_role;
