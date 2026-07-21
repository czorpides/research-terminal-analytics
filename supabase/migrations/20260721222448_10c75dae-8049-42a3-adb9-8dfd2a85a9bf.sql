
-- Freshness watchdog + cron heartbeat

CREATE TABLE IF NOT EXISTS public.cron_heartbeat (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  beat_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cron_heartbeat TO authenticated;
GRANT ALL ON public.cron_heartbeat TO service_role;
ALTER TABLE public.cron_heartbeat ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cron_heartbeat readable by authenticated"
  ON public.cron_heartbeat FOR SELECT TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS cron_heartbeat_beat_at_idx ON public.cron_heartbeat (beat_at DESC);

CREATE TABLE IF NOT EXISTS public.source_freshness_expectations (
  source_code TEXT PRIMARY KEY,
  cadence     TEXT NOT NULL,             -- 'intraday'|'hourly'|'daily'|'weekly'|'monthly'|'quarterly'
  max_lag_minutes INT NOT NULL,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.source_freshness_expectations TO authenticated;
GRANT ALL  ON public.source_freshness_expectations TO service_role;
ALTER TABLE public.source_freshness_expectations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "freshness expectations readable"
  ON public.source_freshness_expectations FOR SELECT TO authenticated USING (true);

INSERT INTO public.source_freshness_expectations (source_code, cadence, max_lag_minutes, notes) VALUES
  ('stooq',     'daily',    26*60, 'End-of-day equity prices'),
  ('fmp',       'intraday', 60,    'Intraday equity + spot commodity via FMP'),
  ('tiingo',    'intraday', 60,    'Intraday equity via Tiingo'),
  ('fred',      'daily',    36*60, 'FRED daily macro series (weekend lag OK)'),
  ('ecb',       'daily',    36*60, 'ECB SDW daily rates'),
  ('boe',       'daily',    36*60, 'Bank of England daily'),
  ('ons',       'daily',    36*60, 'UK ONS releases'),
  ('hmrc',      'monthly',  40*24*60, 'HMRC receipts monthly'),
  ('wikipedia', 'daily',    36*60, 'Retail attention pageviews')
ON CONFLICT (source_code) DO UPDATE
  SET cadence = EXCLUDED.cadence,
      max_lag_minutes = EXCLUDED.max_lag_minutes,
      notes = EXCLUDED.notes,
      updated_at = now();
