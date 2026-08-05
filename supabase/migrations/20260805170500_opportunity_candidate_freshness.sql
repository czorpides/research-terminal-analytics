-- Candidate-level evidence timestamps for Opportunity Radar integrity checks.
-- The returned rows are deliberately compact: all scoring remains in the app,
-- while Postgres supplies authoritative as-of timestamps and bulk-run lineage.

CREATE OR REPLACE FUNCTION public.get_opportunity_candidate_freshness()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bulk_finished timestamptz := NULL;
  v_payload jsonb := '[]'::jsonb;
BEGIN
  SELECT coalesce(finished_at, started_at)
  INTO v_bulk_finished
  FROM public.ingestion_runs
  WHERE data_category = 'price_daily_bulk'
    AND status = 'success'
  ORDER BY started_at DESC
  LIMIT 1;

  WITH active_assets AS (
    SELECT id
    FROM public.assets
    WHERE active = true AND asset_class = 'equity'
  ), technical AS (
    SELECT
      s.subject_id AS asset_id,
      max(s.computed_at) FILTER (WHERE s.score_type = 'momentum') AS momentum_at,
      max(s.computed_at) FILTER (WHERE s.score_type = 'trend') AS trend_at,
      max(s.computed_at) FILTER (WHERE s.score_type = 'volatility') AS volatility_at
    FROM public.scores s
    JOIN active_assets a ON a.id = s.subject_id
    WHERE s.subject_type = 'asset'
      AND s.score_type IN ('momentum', 'trend', 'volatility')
    GROUP BY s.subject_id
  ), fundamentals AS (
    SELECT
      f.subject_id AS asset_id,
      min(f.as_of) AS oldest_current_as_of,
      max(f.as_of) AS newest_current_as_of,
      count(DISTINCT f.metric_code)::integer AS metric_count
    FROM public.latest_asset_fundamentals f
    JOIN active_assets a ON a.id = f.subject_id
    WHERE f.metric_code IN (
      'fund_pe_ttm', 'fund_pb', 'fund_ps_ttm', 'fund_ev_ebitda_ttm',
      'fund_fcf_yield_ttm', 'fund_roe_ttm', 'fund_roic_ttm',
      'fund_debt_equity', 'fund_current_ratio', 'fund_market_cap'
    )
    GROUP BY f.subject_id
  )
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'assetId', a.id,
        'momentumAt', t.momentum_at,
        'trendAt', t.trend_at,
        'volatilityAt', t.volatility_at,
        'fundamentalAsOf', CASE WHEN coalesce(f.metric_count, 0) >= 3 THEN f.oldest_current_as_of ELSE NULL END,
        'fundamentalNewestAsOf', f.newest_current_as_of,
        'fundamentalMetricCount', coalesce(f.metric_count, 0)
      )
      ORDER BY a.id
    ),
    '[]'::jsonb
  ) INTO v_payload
  FROM active_assets a
  LEFT JOIN technical t ON t.asset_id = a.id
  LEFT JOIN fundamentals f ON f.asset_id = a.id;

  RETURN jsonb_build_object(
    'asOf', now(),
    'latestBulkFinishedAt', v_bulk_finished,
    'assets', v_payload
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_opportunity_candidate_freshness()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_opportunity_candidate_freshness() TO service_role;
