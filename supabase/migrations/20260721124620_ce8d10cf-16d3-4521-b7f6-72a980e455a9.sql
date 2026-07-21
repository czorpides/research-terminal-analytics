
-- New countries
INSERT INTO public.countries (iso2, name, region) VALUES
  ('EU', 'Euro area', 'Europe'),
  ('GB', 'United Kingdom', 'Europe')
ON CONFLICT DO NOTHING;

-- Grab source id for FRED (already present)
WITH fred AS (
  SELECT id FROM public.data_sources WHERE provider_code = 'fred' LIMIT 1
),
c_us AS (SELECT id FROM public.countries WHERE iso2 = 'US' LIMIT 1),
c_eu AS (SELECT id FROM public.countries WHERE iso2 = 'EU' LIMIT 1),
c_gb AS (SELECT id FROM public.countries WHERE iso2 = 'GB' LIMIT 1)

INSERT INTO public.economic_indicators (code, name, country_id, frequency, unit, category, provider_series_code, provider_source_id)
SELECT * FROM (VALUES
  -- US new
  ('US_MORTGAGE30', 'US 30Y Mortgage Rate',       (SELECT id FROM c_us), 'weekly',    'percent',  'housing',  'MORTGAGE30US', (SELECT id FROM fred)),
  ('US_HOUST',      'US Housing Starts',           (SELECT id FROM c_us), 'monthly',   'thousands','housing',  'HOUST',        (SELECT id FROM fred)),
  ('US_CC_DELINQ',  'US Credit Card Delinquency',  (SELECT id FROM c_us), 'quarterly', 'percent',  'credit',   'DRCCLACBS',    (SELECT id FROM fred)),
  ('US_MTG_DELINQ', 'US Single-family Mortgage Delinquency', (SELECT id FROM c_us), 'quarterly', 'percent', 'credit', 'DRSFRMACBS', (SELECT id FROM fred)),
  ('US_CONS_CREDIT','US Consumer Credit Outstanding',(SELECT id FROM c_us), 'monthly',  'usd_bn',   'credit',   'TOTALSL',      (SELECT id FROM fred)),
  ('US_BUSLOANS',   'US Commercial & Industrial Loans',(SELECT id FROM c_us), 'weekly',  'usd_bn',   'business', 'BUSLOANS',     (SELECT id FROM fred)),
  ('US_ICSA',       'US Initial Jobless Claims',   (SELECT id FROM c_us), 'weekly',    'thousands','labor',    'ICSA',         (SELECT id FROM fred)),

  -- Euro area
  ('EZ_DFR',        'ECB Deposit Facility Rate',   (SELECT id FROM c_eu), 'daily',     'percent',  'rates',    'ECBDFR',           (SELECT id FROM fred)),
  ('EZ_10Y',        'Euro area 10Y Yield',         (SELECT id FROM c_eu), 'monthly',   'percent',  'rates',    'IRLTLT01EZM156N',  (SELECT id FROM fred)),
  ('EZ_CPI',        'Euro area HICP',              (SELECT id FROM c_eu), 'monthly',   'index',    'inflation','CP0000EZ19M086NEST',(SELECT id FROM fred)),
  ('EZ_UNRATE',     'Euro area Unemployment',      (SELECT id FROM c_eu), 'monthly',   'percent',  'labor',    'LRHUTTTTEZM156S',  (SELECT id FROM fred)),

  -- United Kingdom
  ('UK_BANK_RATE',  'BoE Bank Rate',               (SELECT id FROM c_gb), 'daily',     'percent',  'rates',    'IUDBEDR',          (SELECT id FROM fred)),
  ('UK_10Y',        'UK 10Y Gilt Yield',           (SELECT id FROM c_gb), 'monthly',   'percent',  'rates',    'IRLTLT01GBM156N',  (SELECT id FROM fred)),
  ('UK_CPI',        'UK CPI YoY',                  (SELECT id FROM c_gb), 'monthly',   'percent',  'inflation','CPALTT01GBM657N',  (SELECT id FROM fred)),
  ('UK_UNRATE',     'UK Unemployment',             (SELECT id FROM c_gb), 'monthly',   'percent',  'labor',    'LRHUTTTTGBM156S',  (SELECT id FROM fred))
) AS v(code, name, country_id, frequency, unit, category, provider_series_code, provider_source_id)
ON CONFLICT (code) DO UPDATE SET
  provider_series_code = EXCLUDED.provider_series_code,
  provider_source_id   = EXCLUDED.provider_source_id,
  category             = EXCLUDED.category,
  frequency            = EXCLUDED.frequency,
  unit                 = EXCLUDED.unit,
  name                 = EXCLUDED.name,
  country_id           = EXCLUDED.country_id;
