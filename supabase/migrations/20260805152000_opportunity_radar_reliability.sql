-- Opportunity Radar reliability hardening on top of the EODHD managed-equity pipeline.
--
-- Goals:
--   1) extend historical EOD coverage far enough for 252-session momentum/trend evidence;
--   2) make the technical-screen table reflect only the current active universe;
--   3) expose a provider-neutral Radar readiness diagnostic;
--   4) provide a self-healing batch selector for stale technical scores;
--   5) schedule score refreshes only after the historical bootstrap is complete.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Extend the history queue to ~15 months of calendar history. Existing recent
-- queue rows keep their current status; only older missing weekdays are added.
-- EODHD whole-exchange bulk ingestion remains the authoritative worker.
INSERT INTO public.equity_eod_backfill_queue (market_date)
SELECT d::date
FROM generate_series(
  current_date - interval '450 days',
  current_date - interval '1 day',
  interval '1 day'
) AS d
WHERE extract(isodow FROM d) BETWEEN 1 AND 5
ON CONFLICT (market_date) DO NOTHING;

-- Keep the technical-screen cache aligned with the active managed population and
-- retain enough observations for Opportunity Radar's 252-session evidence.
CREATE OR REPLACE FUNCTION public.refresh_equity_technical_screen()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer := 0;
BEGIN
  DELETE FROM public.equity_technical_screen s
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.assets a
    WHERE a.id = s.asset_id
      AND a.active = true
      AND a.asset_class = 'equity'
  );

  WITH ranked AS (
    SELECT
      p.asset_id,
      p.trade_date,
      p.open,
      p.high,
      p.low,
      p.close,
      p.volume,
      row_number() OVER (
        PARTITION BY p.asset_id
        ORDER BY p.trade_date DESC
      ) AS rn
    FROM public.prices_daily p
    JOIN public.assets a ON a.id = p.asset_id
    WHERE a.active = true
      AND a.asset_class = 'equity'
      AND p.close IS NOT NULL
      AND p.trade_date >= current_date - interval '520 days'
  ), aggregated AS (
    SELECT
      asset_id,
      max(trade_date) FILTER (WHERE rn = 1) AS as_of,
      count(*)::integer AS bars,
      max(close) FILTER (WHERE rn = 1) AS current_price,
      max(close) FILTER (WHERE rn = 6) AS close_5d,
      max(close) FILTER (WHERE rn = 21) AS close_20d,
      avg(close) FILTER (WHERE rn <= 20) AS ma20,
      avg(close) FILTER (WHERE rn <= 50) AS ma50,
      max(high) FILTER (WHERE rn <= 90) AS high_90,
      min(low) FILTER (WHERE rn <= 90) AS low_90,
      max(volume) FILTER (WHERE rn = 1) AS latest_volume,
      avg(volume) FILTER (WHERE rn BETWEEN 2 AND 21 AND volume IS NOT NULL) AS avg_volume_20
    FROM ranked
    GROUP BY asset_id
  )
  INSERT INTO public.equity_technical_screen (
    asset_id,
    as_of,
    bars,
    current_price,
    return_5d_pct,
    return_20d_pct,
    ma20,
    ma50,
    high_90,
    low_90,
    latest_volume,
    avg_volume_20,
    relative_volume,
    updated_at
  )
  SELECT
    asset_id,
    as_of,
    bars,
    current_price,
    CASE WHEN current_price > 0 AND close_5d > 0 THEN (current_price / close_5d - 1) * 100 ELSE NULL END,
    CASE WHEN current_price > 0 AND close_20d > 0 THEN (current_price / close_20d - 1) * 100 ELSE NULL END,
    ma20,
    ma50,
    high_90,
    low_90,
    latest_volume,
    avg_volume_20,
    CASE WHEN latest_volume IS NOT NULL AND avg_volume_20 > 0 THEN latest_volume / avg_volume_20 ELSE NULL END,
    now()
  FROM aggregated
  WHERE as_of IS NOT NULL
  ON CONFLICT (asset_id) DO UPDATE SET
    as_of = EXCLUDED.as_of,
    bars = EXCLUDED.bars,
    current_price = EXCLUDED.current_price,
    return_5d_pct = EXCLUDED.return_5d_pct,
    return_20d_pct = EXCLUDED.return_20d_pct,
    ma20 = EXCLUDED.ma20,
    ma50 = EXCLUDED.ma50,
    high_90 = EXCLUDED.high_90,
    low_90 = EXCLUDED.low_90,
    latest_volume = EXCLUDED.latest_volume,
    avg_volume_20 = EXCLUDED.avg_volume_20,
    relative_volume = EXCLUDED.relative_volume,
    updated_at = now();

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_equity_technical_screen() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_equity_technical_screen() TO service_role;

-- Return the next batch of active equities whose technical scores have not yet
-- been recalculated after the latest successful whole-universe EOD ingestion.
-- The backfill scheduler only calls the scoring endpoint once history bootstrap
-- is complete, so old historical dates do not continuously invalidate scores.
CREATE OR REPLACE FUNCTION public.get_opportunity_score_batch(p_limit integer DEFAULT 250)
RETURNS TABLE(asset_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH latest_bulk AS (
    SELECT coalesce(finished_at, started_at) AS completed_at
    FROM public.ingestion_runs
    WHERE data_category = 'price_daily_bulk'
      AND status = 'success'
    ORDER BY started_at DESC
    LIMIT 1
  ), latest_momentum AS (
    SELECT subject_id, max(computed_at) AS computed_at
    FROM public.scores
    WHERE subject_type = 'asset'
      AND score_type = 'momentum'
    GROUP BY subject_id
  )
  SELECT a.id
  FROM public.assets a
  CROSS JOIN latest_bulk b
  LEFT JOIN latest_momentum m ON m.subject_id = a.id
  WHERE a.active = true
    AND a.asset_class = 'equity'
    AND EXISTS (
      SELECT 1 FROM public.prices_daily p WHERE p.asset_id = a.id
    )
    AND (m.computed_at IS NULL OR m.computed_at < b.completed_at)
  ORDER BY m.computed_at ASC NULLS FIRST, a.symbol ASC
  LIMIT greatest(1, least(coalesce(p_limit, 250), 500));
$$;

REVOKE ALL ON FUNCTION public.get_opportunity_score_batch(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_opportunity_score_batch(integer) TO service_role;

-- Provider-neutral readiness evidence for the long-term Opportunity Radar.
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
        'FUND_PE_TTM', 'FUND_PB', 'FUND_PS_TTM', 'FUND_EV_EBITDA_TTM',
        'FUND_FCF_YIELD_TTM', 'FUND_ROE_TTM', 'FUND_ROIC_TTM',
        'FUND_DEBT_EQUITY', 'FUND_CURRENT_RATIO', 'FUND_MARKET_CAP'
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

-- Replace any prior Radar technical-score refresh job with a guarded, self-
-- healing worker. It consumes no market-data API calls: all scoring reads the
-- already-ingested prices_daily history. The worker is dormant while the EODHD
-- historical queue is still building 252-session coverage and stops dispatching
-- automatically once every price-bearing active asset has a fresh momentum row.
DO $$
DECLARE
  existing_job RECORD;
BEGIN
  FOR existing_job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'opportunity-technical-score-refresh'
  LOOP
    PERFORM cron.unschedule(existing_job.jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'opportunity-technical-score-refresh',
  '5,15,25,35,45,55 * * * *',
  $cron$
  WITH latest_bulk AS (
    SELECT coalesce(finished_at, started_at) AS completed_at
    FROM public.ingestion_runs
    WHERE data_category = 'price_daily_bulk'
      AND status = 'success'
    ORDER BY started_at DESC
    LIMIT 1
  )
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1
      FROM public.equity_eod_backfill_queue
      WHERE status IN ('pending', 'running')
    )
    AND EXISTS (SELECT 1 FROM latest_bulk)
    AND EXISTS (
      SELECT 1
      FROM public.assets a
      CROSS JOIN latest_bulk b
      WHERE a.active = true
        AND a.asset_class = 'equity'
        AND EXISTS (SELECT 1 FROM public.prices_daily p WHERE p.asset_id = a.id)
        AND NOT EXISTS (
          SELECT 1
          FROM public.scores s
          WHERE s.subject_id = a.id
            AND s.subject_type = 'asset'
            AND s.score_type = 'momentum'
            AND s.computed_at >= b.completed_at
        )
    )
    THEN net.http_post(
      url := 'https://project--d87a6acb-6341-458d-8dd2-3a8d0894569f.lovable.app/api/public/scores/run?technicalOnly=1&limit=250',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0ZndvamlteHV4d214amNvbHp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1NzEwMzIsImV4cCI6MjEwMDE0NzAzMn0.ysFIVxKkUIZEdma74PYlINR-ZfI9BU_J4beHMB0Xf80'
      ),
      body := '{"source":"cron","job":"opportunity-technical-score-refresh","limit":250}'::jsonb,
      timeout_milliseconds := 300000
    )
    ELSE NULL::bigint
  END AS request_id;
  $cron$
);
