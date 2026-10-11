-- Phase 2J1. Source-semantic diagnostics. Deliberately read-only.
-- No classification here certifies GAAP comparability, investment or model readiness.
CREATE OR REPLACE VIEW public.sec_semantic_quality_review
WITH (security_invoker=true)
AS
WITH sec_source AS (
  SELECT id FROM public.data_sources WHERE provider_code='sec_edgar' AND active=true
), ranked AS (
  SELECT f.id AS filing_id,f.asset_id,f.period_end,
         row_number() OVER (PARTITION BY f.asset_id ORDER BY f.period_end DESC) AS recent_rank
  FROM public.fundamental_filings f
  WHERE f.source_id=(SELECT id FROM sec_source)
    AND f.fiscal_period='FY' AND f.revision_no=1 AND f.is_restatement=false
), last_three AS (
  SELECT * FROM ranked WHERE recent_rank<=3
), facts AS (
  SELECT l.asset_id,l.filing_id,l.period_end,l.recent_rank,
         ff.metric_code,ff.value_num,ff.raw->>'tag' AS sec_tag,ff.unit
  FROM last_three l
  LEFT JOIN public.fundamental_facts ff ON ff.filing_id=l.filing_id
), measures AS (
  SELECT asset_id,
    count(DISTINCT filing_id)::integer AS inspected_years,
    count(DISTINCT filing_id) FILTER (WHERE metric_code='STMT_REVENUE')::integer AS revenue_years,
    count(DISTINCT filing_id) FILTER (WHERE metric_code='STMT_NET_INCOME')::integer AS net_income_years,
    count(DISTINCT filing_id) FILTER (WHERE metric_code='STMT_TOTAL_ASSETS')::integer AS assets_years,
    count(DISTINCT filing_id) FILTER (WHERE metric_code='STMT_OPERATING_CASH_FLOW')::integer AS operating_cash_years,
    count(DISTINCT filing_id) FILTER (WHERE metric_code='STMT_WEIGHTED_AVG_SHARES')::integer AS diluted_shares_years,
    max(sec_tag) FILTER (WHERE recent_rank=1 AND metric_code='STMT_REVENUE') AS latest_revenue_tag,
    max(sec_tag) FILTER (WHERE recent_rank=1 AND metric_code='STMT_NET_INCOME') AS latest_income_tag,
    count(DISTINCT sec_tag) FILTER (WHERE metric_code='STMT_REVENUE')::integer AS revenue_tag_count,
    max(abs(value_num)) FILTER (WHERE metric_code='STMT_WEIGHTED_AVG_SHARES') AS largest_diluted_shares,
    min(abs(value_num)) FILTER (WHERE metric_code='STMT_WEIGHTED_AVG_SHARES' AND value_num<>0) AS smallest_diluted_shares,
    count(*) FILTER (WHERE metric_code='STMT_WEIGHTED_AVG_SHARES' AND value_num<=0)::integer AS invalid_diluted_share_values
  FROM facts
  GROUP BY asset_id
)
SELECT c.asset_id,c.symbol,c.filing_years,c.last_period_end,
       c.three_year_history_available,
       m.inspected_years,
       m.revenue_years,m.net_income_years,m.assets_years,
       m.operating_cash_years,m.diluted_shares_years,
       m.latest_revenue_tag,m.latest_income_tag,
       m.revenue_tag_count,
       (m.largest_diluted_shares IS NOT NULL
        AND m.smallest_diluted_shares IS NOT NULL
        AND m.largest_diluted_shares >= 3*m.smallest_diluted_shares)
           AS significant_share_scale_change,
       (m.invalid_diluted_share_values>0) AS invalid_share_values,
       coalesce(i.invalid_metadata_filings,0)+coalesce(i.empty_filings,0)+
         coalesce(i.duplicate_metrics,0)+coalesce(i.inconsistent_fact_rows,0)
           AS structural_issue_count,
       (i.asset_id IS NOT NULL) AS structural_audit_available,
       (
         CASE WHEN c.three_year_history_available IS DISTINCT FROM true
             OR m.inspected_years<>3 THEN 1 ELSE 0 END +
         CASE WHEN m.revenue_years<>3 THEN 1 ELSE 0 END +
         CASE WHEN m.net_income_years<>3 THEN 1 ELSE 0 END +
         CASE WHEN m.assets_years<>3 THEN 1 ELSE 0 END +
         CASE WHEN m.operating_cash_years<>3 THEN 1 ELSE 0 END +
         CASE WHEN m.revenue_tag_count>1 THEN 1 ELSE 0 END +
         CASE WHEN m.largest_diluted_shares>=3*m.smallest_diluted_shares
             THEN 1 ELSE 0 END +
         CASE WHEN m.invalid_diluted_share_values>0 THEN 1 ELSE 0 END +
         CASE WHEN i.asset_id IS NULL THEN 1 ELSE 0 END +
         CASE WHEN coalesce(i.invalid_metadata_filings,0)+
                   coalesce(i.empty_filings,0)+coalesce(i.duplicate_metrics,0)+
                   coalesce(i.inconsistent_fact_rows,0)>0 THEN 1 ELSE 0 END
       )::integer AS diagnostic_flag_count,
       false AS numerical_values_reconciled,
       false AS accounting_bases_reconciled,
       false AS model_ready
FROM public.sec_original_10k_coverage c
JOIN measures m ON m.asset_id=c.asset_id
LEFT JOIN public.sec_original_10k_integrity i ON i.asset_id=c.asset_id;

REVOKE ALL ON public.sec_semantic_quality_review FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.sec_semantic_quality_review TO service_role;
COMMENT ON VIEW public.sec_semantic_quality_review IS
'Automated source-semantic warning flags only. All amounts, tags, corporate-action bases and model use remain unverified. model_ready deliberately false for every issuer.';
