-- Repair the EODHD bootstrap after production proved that ingestion_runs.data_category
-- did not yet allow the dedicated full-universe bulk run category used by the
-- application. The missing enum value caused beginRun() to fail before any EODHD
-- market-data request was made, leaving queue dates stuck in `running`.
--
-- This migration is deliberately narrow:
--   1) add the missing ingestion category used by the existing application;
--   2) release only currently-running backfill claims so they can retry cleanly;
--   3) reinstall the backfill scheduler with a single-flight guard and automatic
--      recovery for genuinely stale claims;
--   4) leave all Swing scoring, Runtime Trust Gate thresholds and EODHD universe
--      selection unchanged.

ALTER TYPE public.data_category ADD VALUE IF NOT EXISTS 'price_daily_bulk';

-- The only running rows at the time this defect was discovered failed before
-- provider ingestion began, because ingestion_runs rejected price_daily_bulk.
-- Return them to the pending queue without deleting observations or history.
UPDATE public.equity_eod_backfill_queue
SET
  status = 'pending',
  last_error = 'Recovered after adding missing price_daily_bulk ingestion category',
  completed_at = NULL,
  updated_at = now()
WHERE status = 'running';

-- Replace only the historical worker. Daily EOD and weekly universe schedules
-- remain untouched. The worker now enforces single-flight execution: while one
-- date is running, another cron tick cannot claim a second date. A running claim
-- older than 30 minutes is treated as abandoned and returned to pending before
-- the next request is dispatched.
DO $$
DECLARE
  existing_job RECORD;
BEGIN
  FOR existing_job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'equity-eod-bulk-backfill'
  LOOP
    PERFORM cron.unschedule(existing_job.jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'equity-eod-bulk-backfill',
  '3,13,23,33,43,53 * * * *',
  $cron$
  DO $worker$
  BEGIN
    UPDATE public.equity_eod_backfill_queue
    SET
      status = 'pending',
      last_error = 'Automatically recovered stale running claim after 30 minutes',
      completed_at = NULL,
      updated_at = now()
    WHERE status = 'running'
      AND updated_at < now() - interval '30 minutes';

    IF (
      SELECT count(*)
      FROM public.assets
      WHERE active = true
        AND asset_class = 'equity'
    ) >= 2950
      AND NOT EXISTS (
        SELECT 1
        FROM public.equity_eod_backfill_queue
        WHERE status = 'running'
      )
      AND EXISTS (
        SELECT 1
        FROM public.equity_eod_backfill_queue
        WHERE status = 'pending'
      )
    THEN
      PERFORM net.http_post(
        url := 'https://project--d87a6acb-6341-458d-8dd2-3a8d0894569f.lovable.app/api/public/ingest/stooq?bulkBackfill=1&limitDates=1',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0ZndvamlteHV4d214amNvbHp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1NzEwMzIsImV4cCI6MjEwMDE0NzAzMn0.ysFIVxKkUIZEdma74PYlINR-ZfI9BU_J4beHMB0Xf80'
        ),
        body := '{"source":"cron","job":"equity-eod-bulk-backfill","provider":"eodhd","limitDates":1,"singleFlight":true}'::jsonb,
        timeout_milliseconds := 300000
      );
    END IF;
  END
  $worker$;
  $cron$
);
