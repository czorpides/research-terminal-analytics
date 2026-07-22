-- Stage 3: US Liquidity and Financial Conditions Engine.
-- FRED-only initial universe.  Scores are computed at read time from the
-- latest immutable vintages; no opaque PCA factor is activated in this stage.
INSERT INTO public.indicator_registry
  (region_id, engine, concept_code, series_code_native, source_id, unit, frequency, transform_default, direction, seasonal_adj, vintage_policy, description, is_active, min_history, allowed_transformations)
SELECT r.id, 'liquidity', v.concept, v.series, s.id, v.unit, v.frequency, 'level', v.direction, false, 'snapshot_on_ingest', v.description, true, v.min_history, ARRAY['level','mom','yoy','zscore']
FROM public.regions r
CROSS JOIN public.data_sources s
CROSS JOIN (VALUES
 ('fed_funds','FEDFUNDS','pct','monthly','higher_is_tighter','Effective federal funds rate',36),
 ('treasury_2y','DGS2','pct','daily','higher_is_tighter','Two-year Treasury yield',252),
 ('treasury_10y','DGS10','pct','daily','higher_is_tighter','Ten-year Treasury yield',252),
 ('yield_curve_10y2y','T10Y2Y','pct','daily','higher_is_easier','10-year minus 2-year Treasury spread',252),
 ('bbb_credit_spread','BAMLC0A4CBBB','pct','daily','higher_is_tighter','ICE BofA US corporate BBB option-adjusted spread',252),
 ('high_yield_spread','BAMLH0A0HYM2','pct','daily','higher_is_tighter','ICE BofA US high-yield option-adjusted spread',252),
 ('financial_stress','STLFSI4','index','weekly','higher_is_tighter','St. Louis Fed Financial Stress Index',104),
 ('broad_money_m2','M2SL','usd_bn','monthly','higher_is_easier','M2 money stock',36),
 ('bank_credit','TOTBKCR','usd_bn','weekly','higher_is_easier','Total bank credit',104),
 ('reserve_balances','WRESBAL','usd_mn','weekly','higher_is_easier','Reserve balances with Federal Reserve Banks',104)
) AS v(concept,series,unit,frequency,direction,description,min_history)
WHERE r.code='US' AND s.provider_code='fred'
ON CONFLICT (region_id, engine, concept_code) DO UPDATE SET
  series_code_native=EXCLUDED.series_code_native, unit=EXCLUDED.unit, frequency=EXCLUDED.frequency,
  direction=EXCLUDED.direction, description=EXCLUDED.description, is_active=true;