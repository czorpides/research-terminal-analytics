INSERT INTO public.data_sources (provider_code, name, tier, base_url, api_docs_url, notes)
VALUES
  ('ons',  'Office for National Statistics', 'tier1_official', 'https://api.beta.ons.gov.uk/v1', 'https://developer.ons.gov.uk/',        'Native UK statistics API (no key required).'),
  ('boe',  'Bank of England (IADB)',         'tier1_official', 'https://www.bankofengland.co.uk/boeapps/iadb', 'https://www.bankofengland.co.uk/statistics', 'BoE Interactive Statistical Database CSV endpoint.'),
  ('hmrc', 'HMRC Tax & Duty Bulletins',      'tier1_official', 'https://www.gov.uk/government/statistics',    'https://www.gov.uk/government/collections/hm-revenue-and-customs-receipts', 'Monthly UK tax receipts (VAT, PAYE, self-assessment).')
ON CONFLICT (provider_code) DO NOTHING;

INSERT INTO public.countries (iso2, name, region)
VALUES ('GB','United Kingdom','Europe'), ('EU','Euro area','Europe')
ON CONFLICT (iso2) DO NOTHING;

INSERT INTO public.economic_indicators (code, name, category, frequency, unit, provider_source_id, provider_series_code, country_id)
VALUES
  ('EZ_DFR_NATIVE',     'ECB Deposit Facility Rate (ECB SDW)',    'rates',     'daily',   'percent', (SELECT id FROM public.data_sources WHERE provider_code='ecb_sdw'), 'FM.D.U2.EUR.4F.KR.DFR.LEV',              (SELECT id FROM public.countries WHERE iso2='EU')),
  ('EZ_10Y_NATIVE',     'EA 10Y Government Bond Yield (ECB SDW)', 'rates',     'monthly', 'percent', (SELECT id FROM public.data_sources WHERE provider_code='ecb_sdw'), 'FM.M.U2.EUR.4F.BB.U2_10Y.YLD',           (SELECT id FROM public.countries WHERE iso2='EU')),
  ('EZ_CPI_NATIVE',     'EA HICP YoY (ECB SDW)',                  'inflation', 'monthly', 'percent', (SELECT id FROM public.data_sources WHERE provider_code='ecb_sdw'), 'ICP.M.U2.N.000000.4.ANR',                (SELECT id FROM public.countries WHERE iso2='EU')),
  ('EZ_UNRATE_NATIVE',  'EA Unemployment Rate (ECB SDW)',         'labor',     'monthly', 'percent', (SELECT id FROM public.data_sources WHERE provider_code='ecb_sdw'), 'STS.M.I8.S.UNEH.RTT000.4.000',           (SELECT id FROM public.countries WHERE iso2='EU')),
  ('UK_BANK_RATE_NATIVE','UK Bank Rate (BoE IADB)',               'rates',     'daily',   'percent', (SELECT id FROM public.data_sources WHERE provider_code='boe'),     'IUDBEDR',                                (SELECT id FROM public.countries WHERE iso2='GB')),
  ('UK_10Y_NATIVE',     'UK 10Y Gilt Yield (BoE IADB)',           'rates',     'daily',   'percent', (SELECT id FROM public.data_sources WHERE provider_code='boe'),     'IUDMNZC',                                (SELECT id FROM public.countries WHERE iso2='GB')),
  ('UK_SONIA_NATIVE',   'UK SONIA (BoE IADB)',                    'rates',     'daily',   'percent', (SELECT id FROM public.data_sources WHERE provider_code='boe'),     'IUDSOIA',                                (SELECT id FROM public.countries WHERE iso2='GB')),
  ('UK_CPI_NATIVE',     'UK CPIH YoY (ONS)',                      'inflation', 'monthly', 'percent', (SELECT id FROM public.data_sources WHERE provider_code='ons'),     'cpih01/l55o',                            (SELECT id FROM public.countries WHERE iso2='GB')),
  ('UK_UNRATE_NATIVE',  'UK Unemployment Rate (ONS)',             'labor',     'monthly', 'percent', (SELECT id FROM public.data_sources WHERE provider_code='ons'),     'lms/mgsx',                               (SELECT id FROM public.countries WHERE iso2='GB')),
  ('UK_VAT_RECEIPTS',   'UK VAT Receipts (HMRC)',                 'business',  'monthly', 'gbp_m',   (SELECT id FROM public.data_sources WHERE provider_code='hmrc'),    'hmrc-tax-and-nics-receipts/vat',         (SELECT id FROM public.countries WHERE iso2='GB')),
  ('UK_PAYE_RECEIPTS',  'UK PAYE Income Tax Receipts (HMRC)',     'business',  'monthly', 'gbp_m',   (SELECT id FROM public.data_sources WHERE provider_code='hmrc'),    'hmrc-tax-and-nics-receipts/paye_it',     (SELECT id FROM public.countries WHERE iso2='GB')),
  ('UK_SA_RECEIPTS',    'UK Self-Assessment Receipts (HMRC)',     'business',  'monthly', 'gbp_m',   (SELECT id FROM public.data_sources WHERE provider_code='hmrc'),    'hmrc-tax-and-nics-receipts/sa_it',       (SELECT id FROM public.countries WHERE iso2='GB'))
ON CONFLICT (code) DO NOTHING;
