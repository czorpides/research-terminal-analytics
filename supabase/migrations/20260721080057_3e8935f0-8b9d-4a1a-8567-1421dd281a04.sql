
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Unschedule if it exists so this migration is idempotent
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fred-daily-ingest') THEN
    PERFORM cron.unschedule('fred-daily-ingest');
  END IF;
END $$;

SELECT cron.schedule(
  'fred-daily-ingest',
  '15 7 * * *', -- daily at 07:15 UTC (after US market close for daily rates)
  $cron$
  SELECT net.http_post(
    url := 'https://project--d87a6acb-6341-458d-8dd2-3a8d0894569f-dev.lovable.app/api/public/ingest/fred',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0ZndvamlteHV4d214amNvbHp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1NzEwMzIsImV4cCI6MjEwMDE0NzAzMn0.ysFIVxKkUIZEdma74PYlINR-ZfI9BU_J4beHMB0Xf80'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $cron$
);
