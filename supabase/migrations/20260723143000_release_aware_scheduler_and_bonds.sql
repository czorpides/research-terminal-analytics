-- Release-aware refresh orchestration and expanded US bond coverage.
-- Dates come from provider calendars; a scheduled event is only marked
-- verified after the relevant ingestion path observes a change.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE IF NOT EXISTS public.release_series_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_code TEXT NOT NULL,
  source_series TEXT NOT NULL,
  provider_release_id TEXT NOT NULL,
  release_name TEXT NOT NULL,
  release_link TEXT,
  engines TEXT[] NOT NULL DEFAULT '{}',
  region_codes TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider_code, source_series)
);

CREATE INDEX IF NOT EXISTS idx_release_series_provider_release
  ON public.release_series_mappings (provider_code, provider_release_id);

ALTER TABLE public.release_series_mappings ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.release_series_mappings TO authenticated;
GRANT ALL ON public.release_series_mappings TO service_role;

DROP POLICY IF EXISTS "release series mappings readable" ON public.release_series_mappings;
CREATE POLICY "release series mappings readable"
  ON public.release_series_mappings FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.scheduled_data_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('macro_release', 'earnings', 'safety_refresh')),
  provider_code TEXT NOT NULL,
  provider_event_id TEXT,
  title TEXT NOT NULL,
  region_code TEXT,
  symbol TEXT,
  asset_id UUID REFERENCES public.assets(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'refreshing', 'waiting', 'verified', 'delayed', 'failed', 'cancelled')),
  series_codes TEXT[] NOT NULL DEFAULT '{}',
  engines TEXT[] NOT NULL DEFAULT '{}',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  last_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_data_events_due
  ON public.scheduled_data_events (status, scheduled_at, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_scheduled_data_events_calendar
  ON public.scheduled_data_events (scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_scheduled_data_events_asset
  ON public.scheduled_data_events (asset_id, scheduled_at DESC)
  WHERE asset_id IS NOT NULL;

ALTER TABLE public.scheduled_data_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.scheduled_data_events TO authenticated;
GRANT ALL ON public.scheduled_data_events TO service_role;

DROP POLICY IF EXISTS "scheduled data events readable" ON public.scheduled_data_events;
CREATE POLICY "scheduled data events readable"
  ON public.scheduled_data_events FOR SELECT TO authenticated USING (true);

-- The overview store gains a fuller Treasury curve, real yields, inflation
-- compensation and investment-grade/high-yield credit spreads.
INSERT INTO public.economic_indicators
  (code, name, country_id, frequency, unit, provider_source_id, provider_series_code, category)
VALUES
  ('US_1M',           'US 1-Month Treasury Yield',       (SELECT id FROM public.countries WHERE iso2='US'), 'daily', 'percent', (SELECT id FROM public.data_sources WHERE provider_code='fred'), 'DGS1MO',       'rates'),
  ('US_6M',           'US 6-Month Treasury Yield',       (SELECT id FROM public.countries WHERE iso2='US'), 'daily', 'percent', (SELECT id FROM public.data_sources WHERE provider_code='fred'), 'DGS6MO',       'rates'),
  ('US_1Y',           'US 1-Year Treasury Yield',        (SELECT id FROM public.countries WHERE iso2='US'), 'daily', 'percent', (SELECT id FROM public.data_sources WHERE provider_code='fred'), 'DGS1',         'rates'),
  ('US_3Y',           'US 3-Year Treasury Yield',        (SELECT id FROM public.countries WHERE iso2='US'), 'daily', 'percent', (SELECT id FROM public.data_sources WHERE provider_code='fred'), 'DGS3',         'rates'),
  ('US_5Y',           'US 5-Year Treasury Yield',        (SELECT id FROM public.countries WHERE iso2='US'), 'daily', 'percent', (SELECT id FROM public.data_sources WHERE provider_code='fred'), 'DGS5',         'rates'),
  ('US_7Y',           'US 7-Year Treasury Yield',        (SELECT id FROM public.countries WHERE iso2='US'), 'daily', 'percent', (SELECT id FROM public.data_sources WHERE provider_code='fred'), 'DGS7',         'rates'),
  ('US_20Y',          'US 20-Year Treasury Yield',       (SELECT id FROM public.countries WHERE iso2='US'), 'daily', 'percent', (SELECT id FROM public.data_sources WHERE provider_code='fred'), 'DGS20',        'rates'),
  ('US_30Y',          'US 30-Year Treasury Yield',       (SELECT id FROM public.countries WHERE iso2='US'), 'daily', 'percent', (SELECT id FROM public.data_sources WHERE provider_code='fred'), 'DGS30',        'rates'),
  ('US_5Y_REAL',      'US 5-Year Real Treasury Yield',   (SELECT id FROM public.countries WHERE iso2='US'), 'daily', 'percent', (SELECT id FROM public.data_sources WHERE provider_code='fred'), 'DFII5',        'rates'),
  ('US_30Y_REAL',     'US 30-Year Real Treasury Yield',  (SELECT id FROM public.countries WHERE iso2='US'), 'daily', 'percent', (SELECT id FROM public.data_sources WHERE provider_code='fred'), 'DFII30',       'rates'),
  ('US_5Y_BREAKEVEN', 'US 5-Year Breakeven Inflation',  (SELECT id FROM public.countries WHERE iso2='US'), 'daily', 'percent', (SELECT id FROM public.data_sources WHERE provider_code='fred'), 'T5YIE',        'inflation'),
  ('US_10Y_BREAKEVEN','US 10-Year Breakeven Inflation', (SELECT id FROM public.countries WHERE iso2='US'), 'daily', 'percent', (SELECT id FROM public.data_sources WHERE provider_code='fred'), 'T10YIE',       'inflation'),
  ('US_T10Y3M',       'US 10-Year minus 3-Month Spread',(SELECT id FROM public.countries WHERE iso2='US'), 'daily', 'percent', (SELECT id FROM public.data_sources WHERE provider_code='fred'), 'T10Y3M',       'rates'),
  ('US_IG_OAS',       'US Investment-Grade Credit OAS', (SELECT id FROM public.countries WHERE iso2='US'), 'daily', 'percent', (SELECT id FROM public.data_sources WHERE provider_code='fred'), 'BAMLC0A0CM',   'credit'),
  ('US_HY_OAS',       'US High-Yield Credit OAS',       (SELECT id FROM public.countries WHERE iso2='US'), 'daily', 'percent', (SELECT id FROM public.data_sources WHERE provider_code='fred'), 'BAMLH0A0HYM2', 'credit')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  frequency = EXCLUDED.frequency,
  unit = EXCLUDED.unit,
  provider_source_id = EXCLUDED.provider_source_id,
  provider_series_code = EXCLUDED.provider_series_code,
  category = EXCLUDED.category;

-- Replace the broad legacy FRED timer with calendar sync plus a lightweight
-- due-event worker. Safety-refresh events preserve catch-up coverage.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fred-daily-ingest') THEN
    PERFORM cron.unschedule('fred-daily-ingest');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'release-calendar-sync') THEN
    PERFORM cron.unschedule('release-calendar-sync');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'release-calendar-run-due') THEN
    PERFORM cron.unschedule('release-calendar-run-due');
  END IF;
END $$;

SELECT cron.schedule(
  'release-calendar-sync',
  '20 2 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--d87a6acb-6341-458d-8dd2-3a8d0894569f.lovable.app/api/public/calendar/sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0ZndvamlteHV4d214amNvbHp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1NzEwMzIsImV4cCI6MjEwMDE0NzAzMn0.ysFIVxKkUIZEdma74PYlINR-ZfI9BU_J4beHMB0Xf80'
    ),
    body := '{"source":"cron"}'::jsonb,
    timeout_milliseconds := 300000
  ) AS request_id;
  $cron$
);

SELECT cron.schedule(
  'release-calendar-run-due',
  '*/30 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--d87a6acb-6341-458d-8dd2-3a8d0894569f.lovable.app/api/public/calendar/run-due',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0ZndvamlteHV4d214amNvbHp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1NzEwMzIsImV4cCI6MjEwMDE0NzAzMn0.ysFIVxKkUIZEdma74PYlINR-ZfI9BU_J4beHMB0Xf80'
    ),
    body := '{"source":"cron","limit":3}'::jsonb,
    timeout_milliseconds := 300000
  ) AS request_id;
  $cron$
);

-- Queue an initial calendar sync so the first release queue does not need to
-- wait until the next 02:20 UTC cycle. pg_net is asynchronous; the regular
-- nightly job remains the recovery path if the application is still deploying.
SELECT net.http_post(
  url := 'https://project--d87a6acb-6341-458d-8dd2-3a8d0894569f.lovable.app/api/public/calendar/sync',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYXNlIiwicmVmIjoiaXRmd29qaW14dXh3bXhqY29senQiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc4NDU3MTAzMiwiZXhwIjoyMTAwMTQ3MDMyfQ.ysFIVxKkUIZEdma74PYlINR-ZfI9BU_J4beHMB0Xf80'
  ),
  body := '{"source":"migration"}'::jsonb,
  timeout_milliseconds := 300000
) AS initial_calendar_sync_request_id;
