-- Verified from each issuer's original, accession-matched annual SEC 10-K.
-- Values USD, NOT USD millions. Source checked now, no point-in-time backdating.
WITH v(symbol,period_end,amount,accn) AS (VALUES ('PNC','2025-12-31',6997000000,'0000713676-26-000020'),
('PNC','2024-12-31',5953000000,'0000713676-25-000027'),
('PNC','2023-12-31',5647000000,'0000713676-24-000028'),
('AVGO','2025-11-02',23126000000,'0001730168-25-000121'),
('AVGO','2024-11-03',5895000000,'0001730168-24-000139'),
('AVGO','2023-10-29',14082000000,'0001730168-23-000096'))
INSERT INTO public.sec_issuer_reconciliations(
 asset_id,reported_period_end,metric_basis,unit,reported_value,
 original_period_filing_id,evidence_filing_id,evidence_kind,
 evidence_line_label,statement_location,comparison_caveat,source_fact_id)
SELECT a.id,v.period_end::date,'consolidated_net_income','USD',v.amount,
 f.id,f.id,'original_period_10k','Net income',
 'Consolidated annual income statement',
 'Consolidated reported net profit; not necessarily parent common-shareholder profit; numerical scope remains unsuitable for scoring.',
 (SELECT ff.id FROM public.fundamental_facts ff WHERE ff.filing_id=f.id
  AND ff.metric_code='STMT_NET_INCOME' AND ff.value_num=v.amount LIMIT 1)
FROM v JOIN public.assets a ON a.symbol=v.symbol AND a.active
 JOIN public.fundamental_filings f ON f.asset_id=a.id
  AND f.period_end=v.period_end::date AND f.source_filing_id=v.accn
 JOIN public.data_sources d ON d.id=f.source_id AND d.provider_code='sec_edgar'
ON CONFLICT (asset_id,reported_period_end,metric_basis,evidence_filing_id) DO NOTHING;
