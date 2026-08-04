-- Make the Swing engine operationally testable rather than merely renderable.
-- This migration adds:
--   1) a bulk-EOD history queue for the 3,000-name managed equity population,
--   2) a lightweight Postgres technical screen refreshed from completed OHLCV,
--   3) durable Swing monitor run heartbeats,
--   4) schedules for daily bulk EOD refresh and controlled historical bootstrap.
--
-- The application still fails safely if the configured FMP plan does not expose
-- the EOD Bulk endpoint: health remains DEGRADED and the existing per-symbol
-- provider path remains available for manual/fallback ingestion.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE IF NOT EXISTS public.equity_eod_backfill_queue (
  market_date date PRIMARY KEY,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT equity_eod_backfill_status_valid CHECK (
    status IN ('pending', 'running', 'complete', 'no_data', 'failed')
  ),
  CONSTRAINT equity_eod_backfill_attempts_valid CHECK (attempts >= 0)
);

CREATE INDEX IF NOT EXISTS equity_eod_backfill_pending_idx
  ON public.equity_eod_backfill_queue(status, market_date DESC);

ALTER TABLE public.equity_eod_backfill_queue ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.equity_technical_screen (
  asset_id uuid PRIMARY KEY REFERENCES public.assets(id) ON DELETE CASCADE,
  as_of date NOT NULL,
  bars integer NOT NULL,
  current_price numeric,
  return_5d_pct numeric,
  return_20d_pct numeric,
  ma20 numeric,
  ma50 numeric,
  high_90 numeric,
  low_90 numeric,
  latest_volume numeric,
  avg_volume_20 numeric,
  relative_volume numeric,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT equity_technical_screen_bars_valid CHECK (bars >= 0)
);

CREATE INDEX IF NOT EXISTS equity_technical_screen_asof_idx
  ON public.equity_technical_screen(as_of DESC, bars DESC);
CREATE INDEX IF NOT EXISTS equity_technical_screen_return20_idx
  ON public.equity_technical_screen(return_20d_pct DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS equity_technical_screen_relvol_idx
  ON public.equity_technical_screen(relative_volume DESC NULLS LAST);

ALTER TABLE public.equity_technical_screen ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.swing_monitor_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'scheduled',
  status text NOT NULL DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  workspace_as_of date,
  screened integer NOT NULL DEFAULT 0,
  deep_scanned integer NOT NULL DEFAULT 0,
  surfaced integer NOT NULL DEFAULT 0,
  captured integer NOT NULL DEFAULT 0,
  evaluated integer NOT NULL DEFAULT 0,
  quotes_updated integer NOT NULL DEFAULT 0,
  failures jsonb NOT NULL DEFAULT '[]'::jsonb,
  providers jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  CONSTRAINT swing_monitor_run_status_valid CHECK (status IN ('running', 'success', 'failed'))
);

CREATE INDEX IF NOT EXISTS swing_monitor_runs_started_idx
  ON public.swing_monitor_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS swing_monitor_runs_status_idx
  ON public.swing_monitor_runs(status, started_at DESC);

ALTER TABLE public.swing_monitor_runs ENABLE ROW LEVEL SECURITY;

-- Rebuild a cheap first-pass technical screen for every active equity directly
-- in Postgres. This avoids thousands of per-symbol API/DB calls simply to decide
-- which names deserve the expensive 90-session Swing analysis.
CREATE OR REPLACE FUNCTION public.refresh_equity_technical_screen()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer := 0;
BEGIN
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
      AND p.trade_date >= current_date - interval '430 days'
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
    CASE
      WHEN current_price > 0 AND close_5d > 0
        THEN (current_price / close_5d - 1) * 100
      ELSE NULL
    END,
    CASE
      WHEN current_price > 0 AND close_20d > 0
        THEN (current_price / close_20d - 1) * 100
      ELSE NULL
    END,
    ma20,
    ma50,
    high_90,
    low_90,
    latest_volume,
    avg_volume_20,
    CASE
      WHEN latest_volume IS NOT NULL AND avg_volume_20 > 0
        THEN latest_volume / avg_volume_20
      ELSE NULL
    END,
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

REVOKE ALL ON FUNCTION public.refresh_equity_technical_screen() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_equity_technical_screen() TO service_role;

-- Seed roughly six months of weekday dates. Processing is intentionally queued
-- in small batches, keeping each serverless request bounded while accumulating
-- enough history for the 90-session Swing analysis. Exchange holidays are safe:
-- dates with no provider rows are recorded as no_data.
INSERT INTO public.equity_eod_backfill_queue (market_date)
SELECT d::date
FROM generate_series(
  current_date - interval '190 days',
  current_date - interval '2 days',
  interval '1 day'
) AS d
WHERE extract(isodow FROM d) BETWEEN 1 AND 5
ON CONFLICT (market_date) DO NOTHING;

DO $$
DECLARE
  existing_job RECORD;
BEGIN
  FOR existing_job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN (
      'equity-price-refresh',
      'equity-eod-bulk-refresh',
      'equity-eod-bulk-backfill'
    )
  LOOP
    PERFORM cron.unschedule(existing_job.jobid);
  END LOOP;
END $$;

-- FMP documents the stable EOD Bulk feed as a bulk OHLCV endpoint with a 4-6h
-- publication cycle. Running at 04:30 UTC Tue-Sat gives the prior US session
-- ample time to settle and also covers the earlier UK/EU closes.
SELECT cron.schedule(
  'equity-eod-bulk-refresh',
  '30 4 * * 2-6',
  $cron$
  SELECT net.http_post(
    url := 'https://project--d87a6acb-6341-458d-8dd2-3a8d0894569f.lovable.app/api/public/ingest/stooq?bulkEod=1',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6Iml0ZndvamlteHV4d214amNvbHp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1NzEwMzIsImV4cCI6MjEwMDE0NzAzMn0.ysFIVxKkUIZEdma74PYlINR-ZfI9BU_J4beHMB0Xf80'
    ),
    body := '{"source":"cron","job":"equity-eod-bulk-refresh"}'::jsonb,
    timeout_milliseconds := 300000
  ) AS request_id;
  $cron$
);

-- Bootstrap old OHLCV in controlled chunks. Four bulk dates every 20 minutes is
-- at most 12 provider calls/hour while the queue is populated, then becomes a
-- no-op once complete. The application keeps quota headroom for analyst data.
SELECT cron.schedule(
  'equity-eod-bulk-backfill',
  '7,27,47 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--d87a6acb-6341-458d-8dd2-3a8d0894569f.lovable.app/api/public/ingest/stooq?bulkBackfill=1&limitDates=4',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6Iml0ZndvamlteHV4d214amNvbHp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1NzEwMzIsImV4cCI6MjEwMDE0NzAzMn0.ysFIVxKkUIZEdma74PYlINR-ZfI9BU_J4beHMB0Xf80'
    ),
    body := '{"source":"cron","job":"equity-eod-bulk-backfill","limitDates":4}'::jsonb,
    timeout_milliseconds := 300000
  ) AS request_id;
  $cron$
);

-- Prime the technical screen from whatever price history already exists.
SELECT public.refresh_equity_technical_screen();

-- Start the backfill immediately on deployment instead of waiting for the next
-- twenty-minute slot.
SELECT net.http_post(
  url := 'https://project--d87a6acb-6341-458d-8dd2-3a8d0894569f.lovable.app/api/public/ingest/stooq?bulkBackfill=1&limitDates=4',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6Iml0ZndvamlteHV4d214amNvbHp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1NzEwMzIsImV4cCI6MjEwMDE0NzAzMn0.ysFIVxKkUIZEdma74PYlINR-ZfI9BU_J4beHMB0Xf80'
  ),
  body := '{"source":"migration","job":"equity-eod-bulk-backfill"}'::jsonb,
  timeout_milliseconds := 300000
) AS initial_equity_eod_backfill_request_id;
