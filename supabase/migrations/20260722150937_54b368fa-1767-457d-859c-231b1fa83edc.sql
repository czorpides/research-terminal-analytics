
ALTER TABLE public.indicator_registry
  ADD COLUMN IF NOT EXISTS target_range jsonb,
  ADD COLUMN IF NOT EXISTS vintage_quality text DEFAULT 'snapshot'
    CHECK (vintage_quality IN ('snapshot','revision_tracked','real_time_verified'));

CREATE TABLE IF NOT EXISTS public.transform_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_id uuid NOT NULL REFERENCES public.indicator_registry(id) ON DELETE CASCADE,
  transform_name text NOT NULL,
  as_of_date date NOT NULL,
  value numeric,
  calc_version text NOT NULL,
  inputs_hash text NOT NULL,
  model_run_id uuid REFERENCES public.model_runs(id) ON DELETE SET NULL,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (indicator_id, transform_name, as_of_date, calc_version)
);
GRANT SELECT ON public.transform_outputs TO authenticated;
GRANT ALL ON public.transform_outputs TO service_role;
ALTER TABLE public.transform_outputs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth read transform_outputs" ON public.transform_outputs;
CREATE POLICY "auth read transform_outputs" ON public.transform_outputs
  FOR SELECT TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_transform_outputs_ind_name_date
  ON public.transform_outputs (indicator_id, transform_name, as_of_date DESC);

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS inflation_sensitivity numeric,
  ADD COLUMN IF NOT EXISTS wage_cost_sensitivity numeric,
  ADD COLUMN IF NOT EXISTS commodity_input_sensitivity numeric,
  ADD COLUMN IF NOT EXISTS pricing_power numeric,
  ADD COLUMN IF NOT EXISTS interest_rate_sensitivity numeric,
  ADD COLUMN IF NOT EXISTS duration_sensitivity numeric,
  ADD COLUMN IF NOT EXISTS geographic_inflation_exposure jsonb;

-- Seed inflation indicators only if not present (matched by engine + series code)
INSERT INTO public.indicator_registry
  (engine, concept_code, series_code_native, source_id, region_id, unit, frequency,
   transform_default, direction, seasonal_adj, allowed_transformations,
   target_range, vintage_quality, is_active, description, min_history)
SELECT v.engine, v.concept_code, v.series_code_native,
       (SELECT id FROM public.data_sources WHERE provider_code='fred' LIMIT 1),
       (SELECT id FROM public.regions WHERE code='US' LIMIT 1),
       v.unit, v.frequency, v.transform_default, v.direction, v.seasonal_adj,
       v.allowed_transformations, v.target_range::jsonb, v.vintage_quality,
       true, v.description, v.min_history
FROM (VALUES
  ('inflation','cpi_headline','CPIAUCSL','index_1982_84_100','monthly','yoy','context',true,
    ARRAY['level','mom','yoy','chg3mAnn','chg6mAnn','momentum','acceleration','zscoreHistorical','percentileHistorical','kalmanLevel','kalmanSlope','kalmanCI'],
    '{"value":2.0,"band":[1.5,2.5],"unit":"yoy_pct"}','snapshot','US CPI-U all items, SA (BLS via FRED)',36),
  ('inflation','cpi_core','CPILFESL','index_1982_84_100','monthly','yoy','context',true,
    ARRAY['level','mom','yoy','chg3mAnn','chg6mAnn','momentum','acceleration','zscoreHistorical','percentileHistorical','kalmanLevel','kalmanSlope','kalmanCI'],
    '{"value":2.0,"band":[1.5,2.5],"unit":"yoy_pct"}','snapshot','US Core CPI ex food & energy, SA',36),
  ('inflation','pce_headline','PCEPI','index_2017_100','monthly','yoy','context',true,
    ARRAY['level','mom','yoy','chg3mAnn','chg6mAnn','momentum','acceleration','zscoreHistorical','percentileHistorical','kalmanLevel','kalmanSlope','kalmanCI'],
    '{"value":2.0,"band":[1.5,2.5],"unit":"yoy_pct"}','snapshot','US PCE headline (Fed target basis)',36),
  ('inflation','pce_core','PCEPILFE','index_2017_100','monthly','yoy','context',true,
    ARRAY['level','mom','yoy','chg3mAnn','chg6mAnn','momentum','acceleration','zscoreHistorical','percentileHistorical','kalmanLevel','kalmanSlope','kalmanCI'],
    '{"value":2.0,"band":[1.5,2.5],"unit":"yoy_pct"}','snapshot','US Core PCE — Fed preferred inflation gauge',36),
  ('inflation','ppi_final_demand','PPIFIS','index_2009_100','monthly','yoy','context',true,
    ARRAY['level','mom','yoy','chg3mAnn','chg6mAnn','momentum','acceleration','zscoreHistorical','percentileHistorical','kalmanLevel','kalmanSlope','kalmanCI'],
    '{"value":2.0,"band":[0.0,3.0],"unit":"yoy_pct"}','snapshot','US PPI final demand',36),
  ('inflation','wage_ahe','CES0500000003','usd_per_hour','monthly','yoy','context',true,
    ARRAY['level','mom','yoy','chg3mAnn','chg6mAnn','momentum','acceleration','zscoreHistorical','percentileHistorical','kalmanLevel','kalmanSlope','kalmanCI'],
    '{"value":3.5,"band":[3.0,4.0],"unit":"yoy_pct"}','snapshot','Average hourly earnings, private (BLS)',36),
  ('inflation','wage_atlanta_tracker','FRBATLWGT12MMUMHWGO','yoy_pct','monthly','level','context',true,
    ARRAY['level','mom','momentum','acceleration','zscoreHistorical','percentileHistorical','kalmanLevel','kalmanSlope','kalmanCI'],
    '{"value":3.5,"band":[3.0,4.0],"unit":"yoy_pct"}','snapshot','Atlanta Fed Wage Growth Tracker, 12m ma',36),
  ('inflation','cpi_shelter','CUSR0000SAH1','index_1982_84_100','monthly','yoy','context',true,
    ARRAY['level','mom','yoy','chg3mAnn','chg6mAnn','momentum','acceleration','zscoreHistorical','percentileHistorical','kalmanLevel','kalmanSlope','kalmanCI'],
    '{"value":2.5,"band":[2.0,3.5],"unit":"yoy_pct"}','snapshot','CPI Shelter — sticky services proxy',36),
  ('inflation','import_prices','IR','index_2000_100','monthly','yoy','context',true,
    ARRAY['level','mom','yoy','momentum','acceleration','zscoreHistorical','percentileHistorical','kalmanLevel','kalmanSlope','kalmanCI'],
    '{"value":0.0,"band":[-2.0,2.0],"unit":"yoy_pct"}','snapshot','US import price index (all commodities)',36),
  ('inflation','breakeven_5y5y','T5YIFR','pct','daily','level','context',false,
    ARRAY['level','mom','wow','momentum','acceleration','ewma','zscoreHistorical','percentileHistorical','kalmanLevel','kalmanSlope','kalmanCI'],
    '{"value":2.0,"band":[1.75,2.5],"unit":"pct"}','snapshot','5y5y forward inflation expectations',252),
  ('inflation','breakeven_10y','T10YIE','pct','daily','level','context',false,
    ARRAY['level','mom','wow','momentum','acceleration','ewma','zscoreHistorical','percentileHistorical','kalmanLevel','kalmanSlope','kalmanCI'],
    '{"value":2.0,"band":[1.75,2.5],"unit":"pct"}','snapshot','10y breakeven inflation (TIPS-implied)',252),
  ('inflation','umich_1y_expectations','MICH','pct','monthly','level','context',false,
    ARRAY['level','mom','momentum','acceleration','zscoreHistorical','percentileHistorical','kalmanLevel','kalmanSlope','kalmanCI'],
    '{"value":2.5,"band":[2.0,3.5],"unit":"pct"}','snapshot','U. Michigan 1y ahead inflation expectations',36),
  ('inflation','freight_truck_tonnage','TRUCKD11','index_2015_100','monthly','yoy','context',true,
    ARRAY['level','mom','yoy','momentum','acceleration','zscoreHistorical','percentileHistorical','kalmanLevel','kalmanSlope','kalmanCI'],
    '{"value":0.0,"band":[-3.0,5.0],"unit":"yoy_pct"}','snapshot','ATA truck tonnage index — freight pressure proxy',36)
) AS v(engine,concept_code,series_code_native,unit,frequency,transform_default,direction,seasonal_adj,
       allowed_transformations,target_range,vintage_quality,description,min_history)
WHERE NOT EXISTS (
  SELECT 1 FROM public.indicator_registry r
  WHERE r.engine = v.engine AND r.series_code_native = v.series_code_native
);
