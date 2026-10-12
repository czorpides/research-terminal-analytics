-- Phase 2J4: extend original-FY bank revenue composition through FY2023–24.
-- All numbers USD millions as reported in each ORIGINAL fiscal year SEC 10-K.
-- Authoritative originals: PNC 2024/2023, WFC 2024/2023, GS 2024/2023.
-- Never import a later 2025 comparative as an original-period observation.
DO $sanity$
BEGIN
 IF (SELECT count(*) FROM public.sec_issuer_reconciliations) <> 17
 THEN RAISE EXCEPTION 'Unexpected baseline issuer reconciliation count'; END IF;
END $sanity$;
WITH source_data(symbol,period_end,accession,net_interest_m,noninterest_m,total_m)
AS (VALUES
('PNC','2024-12-31','0000713676-25-000027',13499,8056,21555),
('PNC','2023-12-31','0000713676-24-000028',13916,7574,21490),
('WFC','2024-12-31','0000072971-25-000066',47676,34620,82296),
('WFC','2023-12-31','0000072971-24-000064',52375,30222,82597),
('GS','2024-12-31','0000886982-25-000005',8056,45456,53512),
('GS','2023-12-31','0000886982-24-000006',6351,39903,46254)
),
approved_lines AS (
 SELECT s.symbol,s.period_end,s.accession,
    x.basis,x.amount_m,x.caption
 FROM source_data s
 CROSS JOIN LATERAL (
  VALUES
  ('bank_net_interest_income',s.net_interest_m,'Net interest income'),
  ('bank_noninterest_income',s.noninterest_m,'Total noninterest income'),
  ('bank_issuer_total_revenue',s.total_m,'Issuer total net revenues')
 ) x(basis,amount_m,caption)
 WHERE s.net_interest_m+s.noninterest_m=s.total_m
)
INSERT INTO public.sec_issuer_reconciliations(
 asset_id,reported_period_end,metric_basis,unit,reported_value,
 original_period_filing_id,evidence_filing_id,evidence_kind,
 evidence_line_label,statement_location,comparison_caveat,source_fact_id
)
SELECT a.id,l.period_end::date,l.basis,'USD',
 l.amount_m::numeric*1000000,f.id,f.id,'original_period_10k',
 l.caption,'Original '+l.period_end+' Form 10-K consolidated income statement',
 'Consolidated issuer bank net revenue components. GAAP net interest income is after interest expense; noninterest income includes other operating lines. Neither equals industrial-company gross sales or total interest income.',
 (SELECT ff.id FROM public.fundamental_facts ff
    WHERE ff.filing_id=f.id
      AND ff.metric_code='STMT_REVENUE'
      AND l.basis='bank_issuer_total_revenue'
      AND ff.value_num=l.amount_m::numeric*1000000
    LIMIT 1)
FROM approved_lines l
JOIN public.assets a ON a.symbol=l.symbol AND a.active
JOIN public.fundamental_filings f ON f.asset_id=a.id
 AND f.source_filing_id=l.accession AND f.period_end=l.period_end::date
JOIN public.data_sources d ON d.id=f.source_id AND d.provider_code='sec_edgar'
ON CONFLICT (asset_id,reported_period_end,metric_basis,evidence_filing_id)
 DO NOTHING;

DO $check$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM public.sec_issuer_reconciliations;
 IF n<>35 THEN RAISE EXCEPTION 'Expected 35 original-ledger rows after 18 additions: %',n; END IF;
 IF EXISTS(
  SELECT 1 FROM (
   SELECT a.symbol,r.reported_period_end,
    max(r.reported_value) FILTER(WHERE r.metric_basis='bank_issuer_total_revenue') AS total,
    max(r.reported_value) FILTER(WHERE r.metric_basis='bank_net_interest_income') AS interest,
    max(r.reported_value) FILTER(WHERE r.metric_basis='bank_noninterest_income') AS noninterest
   FROM public.sec_issuer_reconciliations r JOIN public.assets a ON a.id=r.asset_id
   WHERE a.symbol IN ('PNC','WFC','GS') AND r.reported_period_end IN ('2024-12-31','2023-12-31')
   GROUP BY a.symbol,r.reported_period_end
  ) x
  WHERE x.total IS DISTINCT FROM x.interest+x.noninterest
 ) THEN RAISE EXCEPTION '2023/24 source revenue components do not reconcile'; END IF;
END $check$;
