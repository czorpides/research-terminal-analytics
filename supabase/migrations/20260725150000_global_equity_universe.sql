-- Expand the managed equity research population to a balanced US, UK and EU
-- universe of up to 3,000 liquid common stocks. The application endpoints own
-- provider validation, quota handling, audit records and score calculation;
-- pg_cron only provides the durable execution cadence.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  existing_job RECORD;
BEGIN
  FOR existing_job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN (
      'equity-universe-refresh',
      'equity-price-refresh',
      'equity-fundamentals-refresh'
    )
    OR command ILIKE '%/api/public/ingest/stooq%'
    OR command ILIKE '%/api/public/ingest/fundamentals%'
  LOOP
    PERFORM cron.unschedule(existing_job.jobid);
  END LOOP;
END $$;

-- Rebuild the balanced population every Sunday. The sync targets roughly 50%
-- US, 15% UK and 35% EU, then fills unused regional capacity by market cap.
SELECT cron.schedule(
  'equity-universe-refresh',
  '10 4 * * 0',
  $cron$
  SELECT net.http_post(
    url := 'https://project--d87a6acb-6341-458d-8dd2-3a8d0894569f.lovable.app/api/public/ingest/stooq?syncUniverse=1&limit=3000&markets=US,UK,EU',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0ZndvamlteHV4d214amNvbHp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1NzEwMzIsImV4cCI6MjEwMDE0NzAzMn0.ysFIVxKkUIZEdma74PYlINR-ZfI9BU_J4beHMB0Xf80'
    ),
    body := '{"source":"cron","job":"equity-universe-refresh","target":3000,"markets":["US","UK","EU"]}'::jsonb,
    timeout_milliseconds := 300000
  ) AS request_id;
  $cron$
);

-- Process 250 names after each US trading day. Price refresh normally uses one
-- primary request and may use a second call for verification, so the conservative
-- batch leaves room for global-symbol failover and other daily platform work.
-- The rotating offset covers the full population over twelve successful runs.
SELECT cron.schedule(
  'equity-price-refresh',
  '20 1 * * 2-6',
  $cron$
  SELECT net.http_post(
    url := 'https://project--d87a6acb-6341-458d-8dd2-3a8d0894569f.lovable.app/api/public/ingest/stooq?limit=250',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0ZndvamlteHV4d214amNvbHp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1NzEwMzIsImV4cCI6MjEwMDE0NzAzMn0.ysFIVxKkUIZEdma74PYlINR-ZfI9BU_J4beHMB0Xf80'
    ),
    body := '{"source":"cron","job":"equity-price-refresh","limit":250}'::jsonb,
    timeout_milliseconds := 300000
  ) AS request_id;
  $cron$
);

-- Fundamentals are materially more quota-intensive than prices. Forty names a
-- day keeps the normal three-call current snapshot inside a 250-call allowance
-- while leaving room for selected annual-history backfills. A complete first
-- pass over 3,000 names therefore takes about 75 successful daily batches.
SELECT cron.schedule(
  'equity-fundamentals-refresh',
  '15 3 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--d87a6acb-6341-458d-8dd2-3a8d0894569f.lovable.app/api/public/ingest/fundamentals?limit=40',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0ZndvamlteHV4d214amNvbHp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1NzEwMzIsImV4cCI6MjEwMDE0NzAzMn0.ysFIVxKkUIZEdma74PYlINR-ZfI9BU_J4beHMB0Xf80'
    ),
    body := '{"source":"cron","job":"equity-fundamentals-refresh","limit":40}'::jsonb,
    timeout_milliseconds := 300000
  ) AS request_id;
  $cron$
);

-- Queue the population rebuild immediately when the migration is applied. If
-- the application snapshot is still publishing, the Sunday job and the normal
-- price bootstrap remain automatic recovery paths.
SELECT net.http_post(
  url := 'https://project--d87a6acb-6341-458d-8dd2-3a8d0894569f.lovable.app/api/public/ingest/stooq?syncUniverse=1&limit=3000&markets=US,UK,EU',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0ZndvamlteHV4d214amNvbHp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1NzEwMzIsImV4cCI6MjEwMDE0NzAzMn0.ysFIVxKkUIZEdma74PYlINR-ZfI9BU_J4beHMB0Xf80'
  ),
  body := '{"source":"migration","job":"global-equity-universe-bootstrap","target":3000}'::jsonb,
  timeout_milliseconds := 300000
) AS initial_global_equity_request_id;
