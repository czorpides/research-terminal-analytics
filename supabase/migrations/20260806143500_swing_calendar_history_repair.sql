-- Repair two live-state gaps discovered after Swing v2.1 reached the full 3,000-name universe:
--   1) the release-aware calendar tables/credential were absent in production;
--   2) the date-keyed EOD backfill queue had already been marked complete when the
--      managed universe was much smaller, so newly added equities never received
--      the older history required for 200/252-day evidence.
--
-- This migration is intentionally idempotent. It recreates only the missing
-- calendar scheduler surface and requeues only the older 450-to-190-day history
-- window when current 252-bar coverage is below 90% of active equities.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Release-aware calendar schema
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.scheduler_credentials (
  name TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.scheduler_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scheduler_credentials FROM anon, authenticated;
GRANT SELECT ON public.scheduler_credentials TO service_role;

INSERT INTO public.scheduler_credentials (name, token)
VALUES ('release-calendar', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (name) DO NOTHING;

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

-- Restore the two calendar workers if the earlier release-aware migration was
-- skipped in the deployed database. Unschedule by job id so reruns are safe.
DO $$
DECLARE
  existing_job RECORD;
BEGIN
  FOR existing_job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN ('release-calendar-sync', 'release-calendar-run-due')
  LOOP
    PERFORM cron.unschedule(existing_job.jobid);
  END LOOP;
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
    ) || jsonb_build_object(
      'X-Scheduler-Secret',
      (SELECT token FROM public.scheduler_credentials WHERE name = 'release-calendar')
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
    ) || jsonb_build_object(
      'X-Scheduler-Secret',
      (SELECT token FROM public.scheduler_credentials WHERE name = 'release-calendar')
    ),
    body := '{"source":"cron","limit":3}'::jsonb,
    timeout_milliseconds := 300000
  ) AS request_id;
  $cron$
);

-- Prime the calendar now instead of waiting for the overnight sync.
SELECT net.http_post(
  url := 'https://project--d87a6acb-6341-458d-8dd2-3a8d0894569f.lovable.app/api/public/calendar/sync',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYXNlIiwicmVmIjoiaXRmd29qaW14dXh3bXhqY29senQiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc4NDU3MTAzMiwiZXhwIjoyMTAwMTQ3MDMyfQ.ysFIVxKkUIZEdma74PYlINR-ZfI9BU_J4beHMB0Xf80'
  ) || jsonb_build_object(
    'X-Scheduler-Secret',
    (SELECT token FROM public.scheduler_credentials WHERE name = 'release-calendar')
  ),
  body := '{"source":"migration-repair"}'::jsonb,
  timeout_milliseconds := 300000
) AS initial_calendar_repair_request_id;

-- ---------------------------------------------------------------------------
-- Expanded-universe history repair
-- ---------------------------------------------------------------------------
--
-- Most of the current 3,000-name universe already has ~126 bars. Requeue only
-- the older segment required to lift those assets above 200/252 observations.
-- At five EODHD exchange-bulk calls per market date this is materially cheaper
-- than replaying the recent six months that are already present.

DO $$
DECLARE
  v_active_equities INTEGER := 0;
  v_history_252 INTEGER := 0;
  v_requeued INTEGER := 0;
BEGIN
  SELECT count(*)::integer
  INTO v_active_equities
  FROM public.assets
  WHERE active = true
    AND asset_class = 'equity';

  SELECT count(*)::integer
  INTO v_history_252
  FROM public.assets a
  JOIN public.equity_technical_screen s ON s.asset_id = a.id
  WHERE a.active = true
    AND a.asset_class = 'equity'
    AND s.bars >= 252;

  IF v_active_equities > 0 AND v_history_252 < floor(v_active_equities * 0.90) THEN
    INSERT INTO public.equity_eod_backfill_queue AS q (
      market_date,
      status,
      attempts,
      last_error,
      completed_at,
      updated_at
    )
    SELECT
      d::date,
      'pending',
      0,
      NULL,
      NULL,
      now()
    FROM generate_series(
      current_date - interval '450 days',
      current_date - interval '190 days',
      interval '1 day'
    ) AS d
    WHERE extract(isodow FROM d) BETWEEN 1 AND 5
    ON CONFLICT (market_date) DO UPDATE SET
      status = 'pending',
      attempts = 0,
      last_error = NULL,
      completed_at = NULL,
      updated_at = now()
    WHERE q.status <> 'running';

    GET DIAGNOSTICS v_requeued = ROW_COUNT;
    RAISE NOTICE 'Requeued % older equity EOD dates because only %/% active equities had >=252 bars.',
      v_requeued, v_history_252, v_active_equities;
  ELSE
    RAISE NOTICE 'No old-history requeue required: %/% active equities already have >=252 bars.',
      v_history_252, v_active_equities;
  END IF;
END $$;

-- Kick one bounded batch immediately. The existing recurring backfill cron then
-- drains the remaining queue under the EODHD quota guard across quota resets.
SELECT net.http_post(
  url := 'https://project--d87a6acb-6341-458d-8dd2-3a8d0894569f.lovable.app/api/public/ingest/stooq?bulkBackfill=1&limitDates=4',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYXNlIiwicmVmIjoiaXRmd29qaW14dXh3bXhqY29senQiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc4NDU3MTAzMiwiZXhwIjoyMTAwMTQ3MDMyfQ.ysFIVxKkUIZEdma74PYlINR-ZfI9BU_J4beHMB0Xf80'
  ),
  body := '{"source":"migration-repair","job":"equity-eod-old-history-repair","limitDates":4}'::jsonb,
  timeout_milliseconds := 300000
) AS initial_old_history_repair_request_id;
