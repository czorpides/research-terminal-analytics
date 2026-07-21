
INSERT INTO public.data_sources (name, tier, provider_code, active, base_url, api_docs_url, notes)
VALUES ('Wikipedia Pageviews', 'tier4_alternative', 'wikipedia_pv', true,
        'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article',
        'https://wikimedia.org/api/rest_v1/#/Pageviews%20data',
        'Free, no-key Wikimedia REST API. Daily pageviews per article, used as a retail-attention proxy.')
ON CONFLICT DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS alt_data_signals_uniq
  ON public.alt_data_signals (signal_code, subject_type, subject_id, ts);
CREATE INDEX IF NOT EXISTS alt_data_signals_recent
  ON public.alt_data_signals (signal_code, ts DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='altdata-wikipedia-daily') THEN
    PERFORM cron.unschedule('altdata-wikipedia-daily');
  END IF;
END $$;

SELECT cron.schedule(
  'altdata-wikipedia-daily', '15 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--d87a6acb-6341-458d-8dd2-3a8d0894569f.lovable.app/api/public/ingest/altdata',
    headers := jsonb_build_object('Content-Type','application/json',
      'apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0ZndvamlteHV4d214amNvbHp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1NzEwMzIsImV4cCI6MjEwMDE0NzAzMn0.ysFIVxKkUIZEdma74PYlINR-ZfI9BU_J4beHMB0Xf80'),
    body := '{"source":"cron"}'::jsonb
  );
  $$
);
