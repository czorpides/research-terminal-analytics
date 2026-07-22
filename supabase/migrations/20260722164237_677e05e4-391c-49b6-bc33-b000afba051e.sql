
UPDATE public.indicator_registry
SET series_code_native = 'FRBATLWGTUMHWGO',
    description = 'Atlanta Fed Wage Growth Tracker — unweighted median wage growth for all workers (NSA, percentage change from one year earlier)',
    updated_at = now()
WHERE engine = 'inflation' AND concept_code = 'wage_atlanta_tracker';
