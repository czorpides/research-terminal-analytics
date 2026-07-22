
CREATE OR REPLACE VIEW public.data_health_alerts AS
WITH latest_obs AS (
  SELECT ir.id AS indicator_id, ir.concept_code, ir.frequency,
         MAX(ro.observation_date) AS latest_obs_date
  FROM public.indicator_registry ir
  LEFT JOIN public.raw_observations ro ON ro.indicator_id = ir.id
  WHERE ir.engine = 'growth'
    AND ir.region_id = (SELECT id FROM public.regions WHERE code = 'US')
  GROUP BY ir.id, ir.concept_code, ir.frequency
),
staleness AS (
  SELECT indicator_id, concept_code, frequency, latest_obs_date,
         CASE
           WHEN latest_obs_date IS NULL THEN true
           WHEN frequency = 'weekly'  AND latest_obs_date < (CURRENT_DATE - INTERVAL '14 days') THEN true
           WHEN frequency = 'monthly' AND latest_obs_date < (CURRENT_DATE - INTERVAL '60 days') THEN true
           ELSE false
         END AS is_stale
  FROM latest_obs
),
last_run AS (
  SELECT id AS run_id, status, finished_at, output_summary, diagnostics, error
  FROM public.model_runs
  WHERE model_key = 'growth_engine.us.kalman_llt'
  ORDER BY started_at DESC NULLS LAST
  LIMIT 1
),
recent_failures AS (
  SELECT COUNT(*)::int AS n
  FROM public.model_runs
  WHERE model_key = 'growth_engine.us.kalman_llt'
    AND status = 'failed'
    AND started_at > now() - INTERVAL '24 hours'
)
SELECT
  jsonb_build_object(
    'stale_indicators',
      COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'concept_code', concept_code,
        'frequency', frequency,
        'latest_observation_date', latest_obs_date
      )) FROM staleness WHERE is_stale), '[]'::jsonb),
    'last_run', COALESCE(
      (SELECT jsonb_build_object(
        'run_id', run_id,
        'status', status,
        'finished_at', finished_at,
        'error', error,
        'diagnostics', diagnostics,
        'indicators_processed', (output_summary->>'indicators_processed')::int,
        'indicators_reused', (output_summary->>'indicators_reused')::int,
        'indicators_skipped', (output_summary->>'indicators_skipped')::int,
        'scope', output_summary->'scope'
      ) FROM last_run), 'null'::jsonb),
    'silent_cron',
      COALESCE((SELECT (finished_at IS NULL OR finished_at < now() - INTERVAL '26 hours') FROM last_run), true),
    'failures_last_24h', COALESCE((SELECT n FROM recent_failures), 0),
    'computed_at', now()
  ) AS payload;

GRANT SELECT ON public.data_health_alerts TO authenticated;
GRANT SELECT ON public.data_health_alerts TO anon;
GRANT ALL   ON public.data_health_alerts TO service_role;
