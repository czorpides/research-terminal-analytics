-- Independently checked against each company's original SEC 10-K.
-- USD millions converted to absolute USD. NO SEC feed rewrites or score updates.
CREATE TEMP TABLE sec_operating_pilot_seed ON COMMIT DROP AS
SELECT * FROM (VALUES
('MSFT','2025-06-30','0000950170-25-100235','operating_income_gaap',128528000000,'[{"line":"Reported consolidated operating income","amount_usd":"128528000000"}]'::jsonb,'Consolidated income statements and balance sheets; Note 10 Debt','Consolidated operating income is issuer GAAP operating income, not universally equivalent to EBIT; non-operating income and other interest classification unreviewed.'),
('MSFT','2025-06-30','0000950170-25-100235','borrowings_excluding_leases',43151000000,'[{"line":"Short-term debt (commercial paper)","amount_usd":"0000000"},{"line":"Current portion of long-term debt","amount_usd":"2999000000"},{"line":"Long-term debt (noncurrent)","amount_usd":"40152000000"}]'::jsonb,'Consolidated income statements and balance sheets; Note 10 Debt','Issuer balance-sheet interest-bearing notes, current debt and commercial paper only; both finance and operating lease obligations excluded pending a separate EV capitalisation policy.'),
('GOOGL','2025-12-31','0001652044-26-000018','operating_income_gaap',129039000000,'[{"line":"Reported consolidated operating income","amount_usd":"129039000000"}]'::jsonb,'Consolidated statements of income and balance sheets; Note 6 Debt','Consolidated operating income is issuer GAAP operating income, not universally equivalent to EBIT; non-operating income and other interest classification unreviewed.'),
('GOOGL','2025-12-31','0001652044-26-000018','borrowings_excluding_leases',48543000000,'[{"line":"Current portion of long-term notes","amount_usd":"1996000000"},{"line":"Long-term debt, net of discount and issuance costs","amount_usd":"46547000000"}]'::jsonb,'Consolidated statements of income and balance sheets; Note 6 Debt','Issuer balance-sheet interest-bearing notes, current debt and commercial paper only; both finance and operating lease obligations excluded pending a separate EV capitalisation policy.'),
('NVDA','2026-01-25','0001045810-26-000021','operating_income_gaap',130387000000,'[{"line":"Reported consolidated operating income","amount_usd":"130387000000"}]'::jsonb,'Consolidated statements of income and balance sheets; Note 11 Debt','Consolidated operating income is issuer GAAP operating income, not universally equivalent to EBIT; non-operating income and other interest classification unreviewed.'),
('NVDA','2026-01-25','0001045810-26-000021','borrowings_excluding_leases',8468000000,'[{"line":"Short-term portion of outstanding debt","amount_usd":"999000000"},{"line":"Long-term debt (noncurrent)","amount_usd":"7469000000"}]'::jsonb,'Consolidated statements of income and balance sheets; Note 11 Debt','Issuer balance-sheet interest-bearing notes, current debt and commercial paper only; both finance and operating lease obligations excluded pending a separate EV capitalisation policy.')
) s(symbol,period_end,accession,metric_basis,amount,components,source_section,accounting_caveat);

DO $pre$
DECLARE n int;
BEGIN
 SELECT count(*) INTO n FROM sec_operating_pilot_seed;
 IF n<>6 THEN RAISE EXCEPTION 'Expected six original source lines';END IF;
 SELECT count(*) INTO n FROM sec_operating_pilot_seed s
 JOIN public.assets a ON a.symbol=s.symbol AND a.active AND a.asset_class='equity' AND a.currency='USD'
 JOIN public.fundamental_filings f ON f.asset_id=a.id
   AND f.source_filing_id=s.accession AND f.period_end=s.period_end::date
 JOIN public.data_sources d ON d.id=f.source_id AND d.provider_code='sec_edgar';
 IF n<>6 THEN RAISE EXCEPTION 'Missing exact original SEC pilot issuer/accession';END IF;
END $pre$;

INSERT INTO public.sec_operating_model_pilot(
 asset_id,original_filing_id,period_end,observed_basis,reported_usd,
 components,source_section,accounting_caveat)
SELECT a.id,f.id,s.period_end::date,s.metric_basis,s.amount::numeric,
 s.components,s.source_section,s.accounting_caveat
FROM sec_operating_pilot_seed s
JOIN public.assets a ON a.symbol=s.symbol AND a.active
JOIN public.fundamental_filings f ON f.asset_id=a.id AND
 f.period_end=s.period_end::date AND f.source_filing_id=s.accession
JOIN public.data_sources d ON d.id=f.source_id AND d.provider_code='sec_edgar'
ON CONFLICT(asset_id,period_end,observed_basis) DO NOTHING;

DO $post$
DECLARE n int;
BEGIN
 SELECT count(*) INTO n FROM public.sec_operating_pilot_review;
 IF n<>6 THEN RAISE EXCEPTION 'Expected six original pilot metrics, found %',n;END IF;
 IF EXISTS(SELECT 1 FROM public.sec_operating_pilot_review WHERE
   model_eligible OR scoring_eligible OR original_10k_url IS NULL)
 THEN RAISE EXCEPTION 'Unsafe SEC pilot provenance or scoring eligibility';END IF;
 IF (SELECT count(DISTINCT symbol) FROM public.sec_operating_pilot_review)<>3
 THEN RAISE EXCEPTION 'All three issuers must be documented';END IF;
END $post$;
