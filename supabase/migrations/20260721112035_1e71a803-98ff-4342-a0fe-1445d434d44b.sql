
DO $$
DECLARE
  base_url text := 'https://project--d87a6acb-6341-458d-8dd2-3a8d0894569f.lovable.app';
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0ZndvamlteHV4d214amNvbHp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1NzEwMzIsImV4cCI6MjEwMDE0NzAzMn0.ysFIVxKkUIZEdma74PYlINR-ZfI9BU_J4beHMB0Xf80';
BEGIN
  PERFORM cron.unschedule('history-narrative-verify-weekly') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'history-narrative-verify-weekly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'history-narrative-verify-weekly',
  '0 6 * * 1',
  format($job$
    SELECT net.http_post(
      url := '%s/api/public/history/verify-narratives',
      headers := jsonb_build_object('Content-Type','application/json','apikey','%s'),
      body := '{}'::jsonb
    );
  $job$,
  'https://project--d87a6acb-6341-458d-8dd2-3a8d0894569f.lovable.app',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0ZndvamlteHV4d214amNvbHp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1NzEwMzIsImV4cCI6MjEwMDE0NzAzMn0.ysFIVxKkUIZEdma74PYlINR-ZfI9BU_J4beHMB0Xf80')
);
