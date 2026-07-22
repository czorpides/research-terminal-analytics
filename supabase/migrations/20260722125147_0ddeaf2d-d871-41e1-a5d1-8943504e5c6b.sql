
-- Phase: US Growth Engine — real-data vertical slice
-- 1) Configurable min-history + allowed transformations on the registry
ALTER TABLE public.indicator_registry
  ADD COLUMN IF NOT EXISTS min_history integer,
  ADD COLUMN IF NOT EXISTS allowed_transformations text[] DEFAULT ARRAY[]::text[];

COMMENT ON COLUMN public.indicator_registry.min_history IS
  'Frequency-specific minimum observation count required before the model may emit an output. NULL = use frequency default (monthly=24, quarterly=16, weekly=52, daily=252).';
COMMENT ON COLUMN public.indicator_registry.allowed_transformations IS
  'Transforms the analytics service is allowed to compute for this indicator. Members: level, mom, qoq, wow, yoy, momentum_3m, acceleration, percentile, zscore.';

-- 2) Prevent duplicate vintage rows (allow multiple vintages per observation_date)
CREATE UNIQUE INDEX IF NOT EXISTS raw_observations_ind_obs_vintage_uniq
  ON public.raw_observations (indicator_id, observation_date, COALESCE(vintage_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- 3) Growth Engine — activate the five spec-required series, deactivate the rest.
--    Note: HOUST/ICSA/PAYEMS are added if missing; IP/RS already exist and stay active.
WITH us AS (SELECT id FROM public.regions WHERE code='US'),
     fred AS (SELECT id FROM public.data_sources WHERE provider_code='fred')
INSERT INTO public.indicator_registry
  (region_id, engine, concept_code, series_code_native, source_id, unit, frequency, transform_default, direction, seasonal_adj, description, is_active, min_history, allowed_transformations)
SELECT us.id, 'growth', v.concept_code, v.series_code, fred.id, v.unit, v.frequency, v.transform_default, v.direction, v.sa, v.description, true, v.min_history, v.transforms
FROM us, fred, (VALUES
  ('housing_starts',       'HOUST',  'Thousands', 'monthly', 'yoy', 'higher_is_better', true, 'US Housing Starts (SAAR)',                    24, ARRAY['level','mom','yoy','momentum_3m','acceleration','percentile','zscore']),
  ('initial_jobless_claims','ICSA',  'Thousands', 'weekly',  'level','lower_is_better',  true, 'US Initial Jobless Claims',                   52, ARRAY['level','wow','yoy','momentum_3m','acceleration','percentile','zscore']),
  ('nonfarm_payrolls',     'PAYEMS', 'Thousands', 'monthly', 'mom',  'higher_is_better', true, 'US Total Nonfarm Payrolls',                   24, ARRAY['level','mom','yoy','momentum_3m','acceleration','percentile','zscore'])
) AS v(concept_code, series_code, unit, frequency, transform_default, direction, sa, description, min_history, transforms)
ON CONFLICT DO NOTHING;

-- Set min_history + allowed_transformations for the already-registered IP + Retail Sales
UPDATE public.indicator_registry ir
   SET min_history = 24,
       allowed_transformations = ARRAY['level','mom','yoy','momentum_3m','acceleration','percentile','zscore']
  FROM public.regions r
 WHERE ir.region_id = r.id AND r.code='US' AND ir.engine='growth'
   AND ir.concept_code IN ('industrial_production','retail_sales');

-- Deactivate the older US Growth registrations that are outside the Stage-1 spec
UPDATE public.indicator_registry ir
   SET is_active = false
  FROM public.regions r
 WHERE ir.region_id = r.id AND r.code='US' AND ir.engine='growth'
   AND ir.concept_code IN ('real_gdp','business_survey','new_orders');
