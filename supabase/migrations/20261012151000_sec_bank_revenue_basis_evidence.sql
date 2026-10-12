-- Original FY2025 issuer bank accounts: USD millions to absolute USD.
-- Not uniform industrial-company top-line revenue; no scoring promotion.
WITH v(symbol,metric_basis,usd_millions,accession,line_label,location) AS
 (VALUES ('PNC','bank_issuer_total_revenue',23099,'0000713676-26-000020','Total revenue','Consolidated Income Statement'),
('PNC','bank_net_interest_income',14410,'0000713676-26-000020','Net interest income','Consolidated Income Statement'),
('PNC','bank_noninterest_income',8689,'0000713676-26-000020','Noninterest income','Consolidated Income Statement'),
('WFC','bank_issuer_total_revenue',83699,'0000072971-26-000133','Total revenue','Consolidated Statement of Income'),
('WFC','bank_net_interest_income',47484,'0000072971-26-000133','Net interest income','Consolidated Statement of Income'),
('WFC','bank_noninterest_income',36215,'0000072971-26-000133','Total noninterest income','Consolidated Statement of Income'),
('GS','bank_issuer_total_revenue',58283,'0000886982-26-000091','Total net revenues','Net Revenues by Line Item'),
('GS','bank_net_interest_income',13559,'0000886982-26-000091','Net interest income','Net Revenues by Line Item'),
('GS','bank_noninterest_income',44724,'0000886982-26-000091','Total non-interest revenues','Net Revenues by Line Item'),
('MS','bank_issuer_total_revenue',70645,'0000895421-26-000086','Net revenues','Consolidated Financial Results'))
INSERT INTO public.sec_issuer_reconciliations(
 asset_id,reported_period_end,metric_basis,unit,reported_value,
 original_period_filing_id,evidence_filing_id,evidence_kind,
 evidence_line_label,statement_location,comparison_caveat,source_fact_id)
SELECT a.id,'2025-12-31',''::text||v.metric_basis,'USD',
 v.usd_millions::numeric*1000000,
 f.id,f.id,'original_period_10k',
 v.line_label,v.location||' FY2025',
 'Issuer net-interest and noninterest revenue accounting bases differ from industrial gross sales; not interchangeable with gross interest income or a generic sector-wide industrial metric.',
 CASE WHEN v.metric_basis='bank_issuer_total_revenue' THEN
  (SELECT ff.id FROM public.fundamental_facts ff WHERE ff.filing_id=f.id
   AND ff.metric_code='STMT_REVENUE'
   AND ff.value_num=v.usd_millions::numeric*1000000 LIMIT 1)
 ELSE NULL END
FROM v JOIN public.assets a ON a.symbol=v.symbol AND a.active
 JOIN public.fundamental_filings f ON f.asset_id=a.id
   AND f.source_filing_id=v.accession AND f.period_end='2025-12-31'
 JOIN public.data_sources d ON d.id=f.source_id AND d.provider_code='sec_edgar'
ON CONFLICT(asset_id,reported_period_end,metric_basis,evidence_filing_id) DO NOTHING;
