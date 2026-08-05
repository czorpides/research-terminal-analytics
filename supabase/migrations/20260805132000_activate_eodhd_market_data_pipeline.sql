-- Activate the EODHD-backed managed-equity pipeline after the live capability
-- probe confirmed a paid 100,000-unit/day account, full target-market symbol
-- coverage, 90+ bar history access, and extended bulk screening fields.
--
-- Rollout order is deliberately fail-closed:
--   1) immediately request the 3,000-name universe sync;
--   2) bulk/backfill cron jobs refuse to call the app until >= 2,950 equities
--      are active in the database;
--   3) the historical worker consumes one date per run to keep each serverless
--      request bounded while still completing the 90-bar bootstrap in roughly
--      a day;
--   4) the existing Runtime Trust Gate remains authoritative and will not claim
--      Operational until all coverage/freshness checks genuinely pass.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Ensure the bootstrap reaches the latest completed weekday. The original queue
-- stopped at current_date - 2 because the daily bulk job was expected to fill
-- the newest session; market-data jobs were intentionally paused during the
-- provider transition, so include current_date - 1 before restarting.
INSERT INTO public.equity_eod_backfill_queue (market_date)
SELECT d::date
FROM generate_series(
  current_date - interval '190 days',
  current_date - interval '1 day',
  interval '1 day'
) AS d
WHERE extract(isodow FROM d) BETWEEN 1 AND 5
ON CONFLICT (market_date) DO NOTHING;

-- Re-run the entire bootstrap with the now-authoritative EODHD path. Existing
-- price rows are protected by the application upsert key, while resetting the
-- queue clears any stale FMP-era failures/running states.
UPDATE public.equity_eod_backfill_queue
SET
  status = 'pending',
  attempts = 0,
  last_error = NULL,
  completed_at = NULL,
  updated_at = now();

DO $$
DECLARE
  existing_job RECORD;
BEGIN
  FOR existing_job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN (
      'equity-universe-refresh',
      'equity-universe-monday-recovery',
      'equity-eod-bulk-refresh',
      'equity-eod-bulk-backfill'
    )
  LOOP
    PERFORM cron.unschedule(existing_job.jobid);
  END LOOP;
END $$;

-- Rebalance the managed population weekly. Monday 03:15 UTC uses settled Friday
-- data and avoids needless day-to-day constituent churn around the eligibility
-- thresholds.
SELECT cron.schedule(
  'equity-universe-refresh',
  '15 3 * * 1',
  $cron$
  SELECT net.http_post(
    url := 'https://project--d87a6acb-6341-458d-8dd2-3a8d0894569f.lovable.app/api/public/ingest/stooq?syncUniverse=1&limit=3000',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0ZndvamlteHV4d214amNvbHp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1NzEwMzIsImV4cCI6MjEwMDE0NzAzMn0.ysFIVxKkUIZEdma74PYlINR-ZfI9BU_J4beHMB0Xf80'
    ),
    body := '{"source":"cron","job":"equity-universe-refresh","provider":"eodhd"}'::jsonb,
    timeout_milliseconds := 300000
  ) AS request_id;
  $cron$
);

-- Refresh the latest completed session once per weekday after all five managed
-- markets have had ample time to settle. The database guard prevents a partial
-- 59-name universe from ever being treated as the full-universe EOD population.
SELECT cron.schedule(
  'equity-eod-bulk-refresh',
  '30 4 * * 2-6',
  $cron$
  SELECT CASE
    WHEN (
      SELECT count(*)
      FROM public.assets
      WHERE active = true
        AND asset_class = 'equity'
    ) >= 2950
    THEN net.http_post(
      url := 'https://project--d87a6acb-6341-458d-8dd2-3a8d0894569f.lovable.app/api/public/ingest/stooq?bulkEod=1',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0ZndvamlteHV4d214amNvbHp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1NzEwMzIsImV4cCI6MjEwMDE0NzAzMn0.ysFIVxKkUIZEdma74PYlINR-ZfI9BU_J4beHMB0Xf80'
      ),
      body := '{"source":"cron","job":"equity-eod-bulk-refresh","provider":"eodhd"}'::jsonb,
      timeout_milliseconds := 300000
    )
    ELSE NULL::bigint
  END AS request_id;
  $cron$
);

-- One historical date every ten minutes = at most 500 EODHD units per worker
-- run (five whole-exchange requests). The full ~136-date rebuild is ~68k units,
-- comfortably inside the verified 100k-unit daily entitlement. Once the queue
-- is empty this becomes a cheap retry worker and consumes no provider units.
SELECT cron.schedule(
  'equity-eod-bulk-backfill',
  '3,13,23,33,43,53 * * * *',
  $cron$
  SELECT CASE
    WHEN (
      SELECT count(*)
      FROM public.assets
      WHERE active = true
        AND asset_class = 'equity'
    ) >= 2950
    THEN net.http_post(
      url := 'https://project--d87a6acb-6341-458d-8dd2-3a8d0894569f.lovable.app/api/public/ingest/stooq?bulkBackfill=1&limitDates=1',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0ZndvamlteHV4d214amNvbHp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1NzEwMzIsImV4cCI6MjEwMDE0NzAzMn0.ysFIVxKkUIZEdma74PYlINR-ZfI9BU_J4beHMB0Xf80'
      ),
      body := '{"source":"cron","job":"equity-eod-bulk-backfill","provider":"eodhd","limitDates":1}'::jsonb,
      timeout_milliseconds := 300000
    )
    ELSE NULL::bigint
  END AS request_id;
  $cron$
);

-- Start only the universe sync immediately. Backfill is intentionally left to
-- the guarded cron worker so it cannot race the population rebuild.
SELECT net.http_post(
  url := 'https://project--d87a6acb-6341-458d-8dd2-3a8d0894569f.lovable.app/api/public/ingest/stooq?syncUniverse=1&limit=3000',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0ZndvamlteHV4d214amNvbHp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1NzEwMzIsImV4cCI6MjEwMDE0NzAzMn0.ysFIVxKkUIZEdma74PYlINR-ZfI9BU_J4beHMB0Xf80'
  ),
  body := '{"source":"migration","job":"equity-universe-refresh","provider":"eodhd"}'::jsonb,
  timeout_milliseconds := 300000
) AS initial_eodhd_universe_sync_request_id;
