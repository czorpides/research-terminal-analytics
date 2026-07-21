
INSERT INTO public.data_sources (provider_code, name, tier, api_docs_url)
VALUES
  ('tiingo', 'Tiingo', 'tier2_regulated', 'https://www.tiingo.com/documentation/end-of-day'),
  ('twelvedata', 'Twelve Data', 'tier3_reputable', 'https://twelvedata.com/docs'),
  ('fmp', 'Financial Modeling Prep', 'tier2_regulated', 'https://site.financialmodelingprep.com/developer/docs'),
  ('alphavantage', 'Alpha Vantage', 'tier3_reputable', 'https://www.alphavantage.co/documentation/')
ON CONFLICT (provider_code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.provider_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_code TEXT NOT NULL,
  quota_date DATE NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  calls_made INTEGER NOT NULL DEFAULT 0,
  daily_limit INTEGER NOT NULL,
  last_call_at TIMESTAMPTZ,
  last_status TEXT,
  last_error TEXT,
  disabled_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider_code, quota_date)
);

GRANT SELECT ON public.provider_quotas TO authenticated;
GRANT ALL ON public.provider_quotas TO service_role;

ALTER TABLE public.provider_quotas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can view quotas"
  ON public.provider_quotas FOR SELECT TO authenticated USING (true);

CREATE TRIGGER provider_quotas_set_updated_at
  BEFORE UPDATE ON public.provider_quotas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS provider_quotas_provider_date_idx
  ON public.provider_quotas (provider_code, quota_date DESC);
