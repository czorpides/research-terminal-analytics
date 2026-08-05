-- Repair the EODHD bootstrap after production proved that ingestion_runs.data_category
-- did not yet allow the dedicated full-universe bulk run category used by the
-- application.

ALTER TYPE public.data_category ADD VALUE IF NOT EXISTS 'price_daily_bulk';

UPDATE public.equity_eod_backfill_queue
SET
  status = 'pending',
  last_error = 'Recovered after adding missing price_daily_bulk ingestion category',
  completed_at = NULL,
  updated_at = now()
WHERE status = 'running';

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