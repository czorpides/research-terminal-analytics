
SELECT net.http_post(
  url := 'https://project--d87a6acb-6341-458d-8dd2-3a8d0894569f-dev.lovable.app/api/public/ingest/fred?series=DGS10',
  headers := jsonb_build_object('Content-Type','application/json','apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0ZndvamlteHV4d214amNvbHp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1NzEwMzIsImV4cCI6MjEwMDE0NzAzMn0.ysFIVxKkUIZEdma74PYlINR-ZfI9BU_J4beHMB0Xf80'),
  body := '{}'::jsonb,
  timeout_milliseconds := 60000
) AS request_id;
