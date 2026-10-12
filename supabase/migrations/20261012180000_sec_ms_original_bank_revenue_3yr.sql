-- Phase 2J4 follow-up: original Morgan Stanley consolidated statement revenue.
-- Original fiscal-year accession only, USD millions converted to absolute USD.
-- FY2025 original net revenue was already recorded in 2J3; add its components,
-- and FY2024/FY2023 original total and components. No later comparative is
-- passed off as an original filing.
DO $baseline$
BEGIN
 IF (SELECT count(*) FROM public.sec_issuer_reconciliations)<>35 THEN
  RAISE EXCEPTION 'Morgan Stanley bridge needs the 35-entry verified baseline';
 END IF;
END $baseline$;

WITH src(period_end,accession,interest_m,noninterest_m,total_m) AS (
 VALUES
 ('2025-12-31','0000895421-26-000086',10046,60599,70645),
 ('2024-12-31','0000895421-25-000304',8611,53150,61761),
 ('2023-12-31','0000895421-24-000300',8230,45913,54143)
), evidence AS (
 SELECT v.period_end,v.accession,b.metric_basis,b.amount_m,b.label
 FROM src v CROSS JOIN LATERAL (
  VALUES
  ('bank_issuer_total_revenue',v.total_m,'Net revenues'),
  ('bank_net_interest_income',v.interest_m,'Net interest'),
  ('bank_noninterest_income',v.noninterest_m,'Total non-interest revenues')
 ) b(metric_basis,amount_m,label)
 WHERE v.interest_m+v.noninterest_m=v.total_m
)
INSERT INTO public.sec_issuer_reconciliations(
 asset_id,reported_period_end,metric_basis,unit,reported_value,
 original_period_filing_id,evidence_filing_id,evidence_kind,
 evidence_line_label,statement_location,comparison_caveat,source_fact_id)
SELECT a.id,v.period_end::date,v.metric_basis,'USD',
 v.amount_m::numeric*1000000,f.id,f.id,'original_period_10k',
 v.label,'Consolidated Income Statement, original FY '||v.period_end,
 'Consolidated Morgan Stanley 10-K net revenues = net interest after interest expense + total non-interest revenues; distinct from segment revenues or gross interest received.',
 NULL
FROM evidence v JOIN public.assets a ON a.symbol='MS' AND a.active
JOIN public.fundamental_filings f ON f.asset_id=a.id
 AND f.period_end=v.period_end::date AND f.source_filing_id=v.accession
JOIN public.data_sources d ON d.id=f.source_id AND d.provider_code='sec_edgar'
ON CONFLICT(asset_id,reported_period_end,metric_basis,evidence_filing_id) DO NOTHING;

DO $verify$
DECLARE n integer;v integer;
BEGIN
 SELECT count(*) INTO n FROM public.sec_issuer_reconciliations;
 IF n<>43 THEN RAISE EXCEPTION 'Expected 8 new MS lines, 43 total: %',n;END IF;
 SELECT count(*) INTO v FROM (
   SELECT r.reported_period_end,
    max(r.reported_value) FILTER(WHERE r.metric_basis='bank_issuer_total_revenue') total,
    max(r.reported_value) FILTER(WHERE r.metric_basis='bank_net_interest_income') interest,
    max(r.reported_value) FILTER(WHERE r.metric_basis='bank_noninterest_income') noninterest,
    count(DISTINCT r.metric_basis) components
   FROM public.sec_issuer_reconciliations r JOIN public.assets a ON a.id=r.asset_id
   WHERE a.symbol='MS' AND r.reported_period_end IN ('2023-12-31','2024-12-31','2025-12-31')
   GROUP BY r.reported_period_end
 ) q WHERE q.components=3 AND q.interest+q.noninterest=q.total;
 IF v<>3 THEN RAISE EXCEPTION 'MS original three-year issuer bank bridges incomplete: %',v; END IF;
 IF (SELECT count(*) FROM public.sec_reconciliation_coverage
     WHERE symbol='MS' AND metric_code='STMT_REVENUE'
       AND review_stage='three_year_evidence_ready_for_owner_review')<>1 THEN
    RAISE EXCEPTION 'MS not eligible for formal *proposal* review';END IF;
END $verify$;