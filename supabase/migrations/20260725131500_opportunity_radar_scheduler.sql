-- Automatic Opportunity Radar population and evidence refresh.
--
-- The application endpoints remain the single source of ingestion logic. pg_cron
-- only triggers them, so provider validation, quotas, audit runs and scoring stay
-- inside the same server-side code paths used by manual/admin refreshes.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove older equity/fundamentals endpoint schedules before installing the
-- managed cadence. Match the command as well as the job name so renamed legacy
-- jobs cannot create duplicate provider calls.
DO $$
DECLARE
  existing_job RECORD;
BEGIN
  FOR existing_job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN (
      'stooq-daily-ingest',
      'equity-price-refresh',
      'equity-universe-refresh',
      'equity-fundamentals-refresh'
    )
    OR command ILIKE '%/api/public/ingest/stooq%'
    OR command ILIKE '%/api/public/ingest/fundamentals%'
  LOOP
    PERFORM cron.unschedule(existing_job.jobid);
  END LOOP;
END $$;

-- Refresh the managed 500-stock selection weekly. The sync retains historical
-- records for removed names but marks them inactive, then activates the current
-- liquid US common-stock population.
SELECT cron.schedule(
  'equity-universe-refresh',
  '10 4 * * 0',
  $cron$
  SELECT net.http_post(
    url := 'https://project--d87a6acb-6341-458d-8dd2-3a8d0894569f.lovable.app/api/public/ingest/stooq?syncUniverse=1',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0ZndvamlteHV4d214amNvbHp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1NzEwMzIsImV4cCI6MjEwMDE0NzAzMn0.ysFIVxKkUIZEdma74PYlINR-ZfI9BU_J4beHMB0Xf80'
    ),
    body := '{"source":"cron","job":"equity-universe-refresh"}'::jsonb,
    timeout_milliseconds := 300000
  ) AS request_id;
  $cron$
);

-- Refresh 200 prices after each US trading day. The endpoint automatically
-- bootstraps the wider universe whenever fewer than 400 active equities exist,
-- so no manual first-run request is required.
SELECT cron.schedule(
  'equity-price-refresh',
  '20 1 * * 2-6',
  $cron$
  SELECT net.http_post(
    url := 'https://project--d87a6acb-6341-458d-8dd2-3a8d0894569f.lovable.app/api/public/ingest/stooq?limit=200',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYXNlIiwicmVmIjoiaXRmd29qaW14dXh3bXhqY29senQiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc4NDU3MTAzMiwiZXhwIjoyMTAwMTQ3MDMyfQ.ysFIVxKkUIZEdma74PYlINR-ZfI9BU_J4beHMB0Xf80'
    ),
    body := '{"source":"cron","job":"equity-price-refresh"}'::jsonb,
    timeout_milliseconds := 300000
  ) AS request_id;
  $cron$
);

-- Rotate through 25 companies per day for current ratios and annual statement
-- history. The endpoint recalculates peer valuation, quality, Piotroski and
-- Magic Formula scores after each batch, progressively widening the visible
-- candidate funnel without exhausting the FMP allowance in one run.
SELECT cron.schedule(
  'equity-fundamentals-refresh',
  '15 3 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--d87a6acb-6341-458d-8dd2-3a8d0894569f.lovable.app/api/public/ingest/fundamentals?limit=25',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYXNlIiwicmVmIjoiaXRmd29qaW14dXh3bXhqY29senQiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc4NDU3MTAzMiwiZXhwIjoyMTAwMTQ3MDMyfQ.ysFIVxKkUIZEdma74PYlINR-ZfI9BU_J4beHMB0Xf80'
    ),
    body := '{"source":"cron","job":"equity-fundamentals-refresh"}'::jsonb,
    timeout_milliseconds := 300000
  ) AS request_id;
  $cron$
);

-- Queue an immediate bootstrap attempt when the migration is applied. pg_net is
-- asynchronous; if the app snapshot is still deploying, the scheduled price
-- job is the automatic recovery path and will retry on the next cadence.
SELECT net.http_post(
  url := 'https://project--d87a6acb-6341-458d-8dd2-3a8d0894569f.lovable.app/api/public/ingest/stooq?limit=200',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0ZndvamlteHV4d214amNvbHp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1NzEwMzIsImV4cCI6MjEwMDE0NzAzMn0.ysFIVxKkUIZEdma74PYlINR-ZfI9BU_J4beHMB0Xf80'
  ),
  body := '{"source":"migration","job":"opportunity-radar-bootstrap"}'::jsonb,
  timeout_milliseconds := 300000
) AS initial_opportunity_radar_request_id;
