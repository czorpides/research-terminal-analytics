
CREATE TABLE public.verify_check_definitions (
  id text PRIMARY KEY,
  panel_id text NOT NULL,
  label text NOT NULL,
  verifier_chain text[] NOT NULL DEFAULT ARRAY['algo','ai']::text[],
  runner_key text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  required_series text[] NOT NULL DEFAULT ARRAY[]::text[],
  min_confidence numeric NOT NULL DEFAULT 0.6,
  max_age_seconds integer NOT NULL DEFAULT 172800,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.verify_check_definitions TO service_role;
ALTER TABLE public.verify_check_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "no direct client access" ON public.verify_check_definitions FOR SELECT TO authenticated USING (false);

CREATE TRIGGER trg_vcd_updated BEFORE UPDATE ON public.verify_check_definitions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.verify_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id text NOT NULL REFERENCES public.verify_check_definitions(id) ON DELETE CASCADE,
  panel_id text NOT NULL,
  verifier text NOT NULL CHECK (verifier IN ('algo','api','ai','manual')),
  status text NOT NULL CHECK (status IN ('pending','pass','fail','stale','unavailable')),
  detail text,
  inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence numeric,
  calc_version text,
  runner_key text,
  trigger_source text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  error text
);
CREATE INDEX verify_runs_check_started_idx ON public.verify_runs (check_id, started_at DESC);
CREATE INDEX verify_runs_panel_started_idx ON public.verify_runs (panel_id, started_at DESC);
GRANT ALL ON public.verify_runs TO service_role;
ALTER TABLE public.verify_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "no direct client access" ON public.verify_runs FOR SELECT TO authenticated USING (false);

-- Seed macro panel definitions
INSERT INTO public.verify_check_definitions (id, panel_id, label, verifier_chain, runner_key, config, required_series, max_age_seconds) VALUES
  ('macro-curve.v-10y-ma',    'macro-curve',     '10Y above 60-day moving average',            ARRAY['algo','ai'],       'above_ma',          '{"series":"DGS10","window":60}'::jsonb,                     ARRAY['DGS10'], 86400),
  ('macro-curve.v-curve-sign','macro-curve',     'Yield curve non-inverted',                   ARRAY['algo','ai'],       'spread_sign',       '{"series":"T10Y2Y","expected":"positive"}'::jsonb,          ARRAY['T10Y2Y'], 86400),
  ('macro-curve.v-10y-fresh', 'macro-curve',     '10Y freshness within policy',                ARRAY['algo'],            'freshness',         '{"series":"DGS10","maxAgeSeconds":86400}'::jsonb,           ARRAY['DGS10'], 86400),
  ('macro-curve.v-10y-ai',    'macro-curve',     'Explain 10Y move in context of Fed speak',   ARRAY['ai'],              'ai_narrative',      '{"series":["DGS10","DFF"],"question":"Is the latest 10Y level consistent with recent Fed policy stance?"}'::jsonb, ARRAY['DGS10','DFF'], 172800),
  ('macro-inflation.v-core-ma','macro-inflation','Core CPI below 12-month MA',                 ARRAY['algo','ai'],       'below_ma',          '{"series":"CPILFESL","window":12}'::jsonb,                  ARRAY['CPILFESL'], 3456000),
  ('macro-inflation.v-cpi-fresh','macro-inflation','CPI print within policy window',           ARRAY['algo'],            'freshness',         '{"series":"CPIAUCSL","maxAgeSeconds":3456000}'::jsonb,      ARRAY['CPIAUCSL'], 3456000),
  ('macro-inflation.v-cpi-ai','macro-inflation', 'Decompose CPI drivers (shelter, services, goods)', ARRAY['ai'],        'ai_narrative',      '{"series":["CPIAUCSL","CPILFESL"],"question":"Is core inflation trending toward the 2% target?"}'::jsonb, ARRAY['CPIAUCSL','CPILFESL'], 3456000),
  ('macro-labor.v-un-fresh',  'macro-labor',     'Unemployment print fresh',                   ARRAY['algo'],            'freshness',         '{"series":"UNRATE","maxAgeSeconds":3456000}'::jsonb,        ARRAY['UNRATE'], 3456000),
  ('macro-labor.v-pay-fresh', 'macro-labor',     'Payrolls print fresh',                       ARRAY['algo'],            'freshness',         '{"series":"PAYEMS","maxAgeSeconds":3456000}'::jsonb,        ARRAY['PAYEMS'], 3456000),
  ('macro-labor.v-labor-ai',  'macro-labor',     'Cross-check payrolls with household survey', ARRAY['ai'],              'ai_narrative',      '{"series":["UNRATE","PAYEMS"],"question":"Do the unemployment rate and payrolls prints tell a consistent story about labor tightness?"}'::jsonb, ARRAY['UNRATE','PAYEMS'], 3456000);

-- Cron: run verifier every 30 minutes
SELECT cron.schedule(
  'verify-runner-every-30m',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--d87a6acb-6341-458d-8dd2-3a8d0894569f.lovable.app/api/public/verify/run',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0ZndvamlteHV4d214amNvbHp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1NzEwMzIsImV4cCI6MjEwMDE0NzAzMn0.ysFIVxKkUIZEdma74PYlINR-ZfI9BU_J4beHMB0Xf80'
    ),
    body := jsonb_build_object('trigger','cron')
  );
  $$
);
