INSERT INTO public.indicator_registry
  (region_id, engine, concept_code, series_code_native, source_id, unit, frequency, transform_default, direction, seasonal_adj, vintage_policy, description, is_active, min_history, allowed_transformations)
SELECT r.id, 'labour', v.concept, v.series, s.id, v.unit, v.frequency, v.transform, v.direction, v.seasonal, 'snapshot_on_ingest', v.description, true, v.min_history, v.transforms
FROM public.regions r
CROSS JOIN public.data_sources s
CROSS JOIN (VALUES
  ('unemployment_rate','UNRATE','pct','monthly','level','lower_is_better',true,'Civilian unemployment rate',36,ARRAY['level','mom','zscore']),
  ('underemployment_rate','U6RATE','pct','monthly','level','lower_is_better',true,'U-6 unemployment and underemployment rate',36,ARRAY['level','mom','zscore']),
  ('nonfarm_payrolls','PAYEMS','thousands','monthly','change','higher_is_better',true,'All employees, total nonfarm payrolls',24,ARRAY['level','mom','yoy','zscore']),
  ('private_payrolls','USPRIV','thousands','monthly','change','higher_is_better',true,'All employees, total private payrolls',24,ARRAY['level','mom','yoy','zscore']),
  ('initial_claims','ICSA','claims','weekly','mean4','lower_is_better',true,'Initial unemployment insurance claims',52,ARRAY['level','mom','zscore']),
  ('continued_claims','CCSA','claims','weekly','level','lower_is_better',true,'Continued unemployment insurance claims',52,ARRAY['level','mom','yoy','zscore']),
  ('job_openings','JTSJOL','thousands','monthly','level','higher_is_better',true,'Job openings, total nonfarm',36,ARRAY['level','mom','yoy','zscore']),
  ('quits_rate','JTSQUR','pct','monthly','level','higher_is_better',true,'Quits rate, total nonfarm',36,ARRAY['level','mom','zscore']),
  ('participation_rate','CIVPART','pct','monthly','level','higher_is_better',true,'Civilian labour force participation rate',36,ARRAY['level','mom','zscore']),
  ('wage_growth','CES0500000003','usd_per_hour','monthly','yoy','context',true,'Average hourly earnings of all private employees',36,ARRAY['level','mom','yoy','zscore'])
) AS v(concept,series,unit,frequency,transform,direction,seasonal,description,min_history,transforms)
WHERE r.code='US' AND s.provider_code='fred'
ON CONFLICT (region_id, engine, concept_code) DO UPDATE SET
  series_code_native=EXCLUDED.series_code_native, source_id=EXCLUDED.source_id,
  unit=EXCLUDED.unit, frequency=EXCLUDED.frequency, transform_default=EXCLUDED.transform_default,
  direction=EXCLUDED.direction, seasonal_adj=EXCLUDED.seasonal_adj,
  description=EXCLUDED.description, min_history=EXCLUDED.min_history,
  allowed_transformations=EXCLUDED.allowed_transformations, is_active=true;

INSERT INTO public.indicator_registry
  (region_id, engine, concept_code, series_code_native, source_id, unit, frequency, transform_default, direction, seasonal_adj, vintage_policy, description, is_active, min_history, allowed_transformations)
SELECT r.id, 'market', v.concept, v.series, s.id, v.unit, v.frequency, v.transform, v.direction, false, 'snapshot_on_ingest', v.description, true, v.min_history, v.transforms
FROM public.regions r
CROSS JOIN public.data_sources s
CROSS JOIN (VALUES
  ('sp500','SP500','index','daily','pct_change','higher_is_better','S&P 500 index',756,ARRAY['level','mom','yoy','zscore']),
  ('nasdaq','NASDAQCOM','index','daily','pct_change','higher_is_better','Nasdaq Composite index',756,ARRAY['level','mom','yoy','zscore']),
  ('equity_volatility','VIXCLS','index','daily','level','higher_is_worse','CBOE VIX index',756,ARRAY['level','mom','zscore']),
  ('high_yield_spread','BAMLH0A0HYM2','pct','daily','level','higher_is_worse','ICE BofA US high-yield option-adjusted spread',756,ARRAY['level','mom','zscore']),
  ('real_yield_10y','DFII10','pct','daily','level','higher_is_worse','10-year Treasury inflation-indexed security yield',756,ARRAY['level','mom','zscore']),
  ('broad_dollar','DTWEXBGS','index','daily','pct_change','context','Nominal broad US dollar index',756,ARRAY['level','mom','yoy','zscore']),
  ('crude_oil','DCOILWTICO','usd_per_barrel','daily','volatility21','context','West Texas Intermediate crude oil spot price',756,ARRAY['level','mom','yoy','zscore']),
  ('national_fci','NFCI','index','weekly','level','higher_is_worse','Chicago Fed National Financial Conditions Index',156,ARRAY['level','mom','zscore'])
) AS v(concept,series,unit,frequency,transform,direction,description,min_history,transforms)
WHERE r.code='US' AND s.provider_code='fred'
ON CONFLICT (region_id, engine, concept_code) DO UPDATE SET
  series_code_native=EXCLUDED.series_code_native, source_id=EXCLUDED.source_id,
  unit=EXCLUDED.unit, frequency=EXCLUDED.frequency, transform_default=EXCLUDED.transform_default,
  direction=EXCLUDED.direction, description=EXCLUDED.description,
  min_history=EXCLUDED.min_history, allowed_transformations=EXCLUDED.allowed_transformations, is_active=true;

COMMENT ON TABLE public.factor_models IS 'Versioned factor diagnostics. Phase 5 market PCA remains unapproved until formal stability review.';
COMMENT ON TABLE public.regime_states IS 'Versioned regime probabilities. Phase 5 HMM rows remain shadow until formal out-of-sample acceptance.';