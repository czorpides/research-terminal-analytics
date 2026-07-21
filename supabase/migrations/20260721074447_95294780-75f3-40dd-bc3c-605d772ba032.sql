
-- 1. provider_code on data_sources
ALTER TABLE public.data_sources ADD COLUMN IF NOT EXISTS provider_code text UNIQUE;
UPDATE public.data_sources SET provider_code = 'fred' WHERE name = 'FRED (Federal Reserve)' AND provider_code IS NULL;
UPDATE public.data_sources SET provider_code = 'sec_edgar' WHERE name = 'SEC EDGAR' AND provider_code IS NULL;
UPDATE public.data_sources SET provider_code = 'ecb_sdw' WHERE name = 'ECB Statistical Data Warehouse' AND provider_code IS NULL;
UPDATE public.data_sources SET provider_code = 'bls' WHERE name = 'Bureau of Labor Statistics' AND provider_code IS NULL;

-- 2. economic_indicators enrichment
ALTER TABLE public.economic_indicators ADD COLUMN IF NOT EXISTS provider_source_id uuid REFERENCES public.data_sources(id);
ALTER TABLE public.economic_indicators ADD COLUMN IF NOT EXISTS provider_series_code text;
ALTER TABLE public.economic_indicators ADD COLUMN IF NOT EXISTS category text;
CREATE UNIQUE INDEX IF NOT EXISTS economic_indicators_provider_series_uidx
  ON public.economic_indicators(provider_source_id, provider_series_code)
  WHERE provider_series_code IS NOT NULL;

-- 3. US country
INSERT INTO public.countries (iso2, name, region)
VALUES ('US', 'United States', 'North America')
ON CONFLICT (iso2) DO NOTHING;

-- 4. Seed FRED indicators
WITH fred AS (SELECT id FROM public.data_sources WHERE provider_code = 'fred'),
     us   AS (SELECT id FROM public.countries WHERE iso2 = 'US')
INSERT INTO public.economic_indicators (code, name, country_id, frequency, unit, provider_source_id, provider_series_code, category)
VALUES
  ('US_10Y',        'US 10Y Treasury constant maturity', (SELECT id FROM us), 'daily',   'percent', (SELECT id FROM fred), 'DGS10',    'rates'),
  ('US_2Y',         'US 2Y Treasury constant maturity',  (SELECT id FROM us), 'daily',   'percent', (SELECT id FROM fred), 'DGS2',     'rates'),
  ('US_3M',         'US 3-Month Treasury bill',          (SELECT id FROM us), 'daily',   'percent', (SELECT id FROM fred), 'DGS3MO',   'rates'),
  ('US_10Y_REAL',   'US 10Y TIPS real yield',            (SELECT id FROM us), 'daily',   'percent', (SELECT id FROM fred), 'DFII10',   'rates'),
  ('US_T10Y2Y',     'US 10Y minus 2Y Treasury spread',   (SELECT id FROM us), 'daily',   'percent', (SELECT id FROM fred), 'T10Y2Y',   'rates'),
  ('US_DFF',        'US Effective Federal Funds Rate',   (SELECT id FROM us), 'daily',   'percent', (SELECT id FROM fred), 'DFF',      'rates'),
  ('US_CPI',        'US CPI (All Urban Consumers)',      (SELECT id FROM us), 'monthly', 'index',   (SELECT id FROM fred), 'CPIAUCSL', 'inflation'),
  ('US_CORE_CPI',   'US Core CPI (ex food & energy)',    (SELECT id FROM us), 'monthly', 'index',   (SELECT id FROM fred), 'CPILFESL', 'inflation'),
  ('US_UNRATE',     'US Unemployment Rate',              (SELECT id FROM us), 'monthly', 'percent', (SELECT id FROM fred), 'UNRATE',   'labor'),
  ('US_PAYEMS',     'US Nonfarm Payrolls',               (SELECT id FROM us), 'monthly', 'thousands',(SELECT id FROM fred),'PAYEMS',  'labor'),
  ('US_INDPRO',     'US Industrial Production Index',    (SELECT id FROM us), 'monthly', 'index',   (SELECT id FROM fred), 'INDPRO',   'growth'),
  ('US_UMCSENT',    'US Consumer Sentiment (UMich)',     (SELECT id FROM us), 'monthly', 'index',   (SELECT id FROM fred), 'UMCSENT',  'sentiment')
ON CONFLICT (code) DO UPDATE
SET provider_source_id = EXCLUDED.provider_source_id,
    provider_series_code = EXCLUDED.provider_series_code,
    category = EXCLUDED.category,
    name = EXCLUDED.name;

-- 5. Extra freshness policies for daily/monthly/intraday macro
INSERT INTO public.source_freshness_policies (data_category, max_age_seconds, warn_age_seconds, notes)
VALUES
  ('macro_release', 60 * 60 * 24 * 7, 60 * 60 * 24 * 2, 'Default macro release freshness (monthly cadence)')
ON CONFLICT DO NOTHING;
