-- Phase 2J5. Static contract from existing Piotroski and Magic Formula
-- calculation modules. READ ONLY. Does not modify source facts or models.
--
-- This is an original-source definition/reconciliation BACKLOG, not a
-- permission to use unreviewed SEC values in existing Radar calculations.
CREATE OR REPLACE VIEW public.sec_model_metric_requirements
WITH (security_invoker=true) AS
SELECT * FROM (VALUES
 ('piotroski','STMT_NET_INCOME','Net income',2,'P0','Consolidated vs parent-attributable basis; income and ROA'),
 ('piotroski','STMT_OPERATING_CASH_FLOW','Operating cash flow',1,'P0','Operating activities cash flow: annual duration and continuing businesses'),
 ('piotroski','STMT_TOTAL_ASSETS','Total assets',3,'P0','Comparable opening/closing total asset denominator'),
 ('piotroski','STMT_REVENUE','Revenue',3,'P0','Issuer top-line scope and banking net revenue differ'),
 ('piotroski','STMT_LONG_TERM_DEBT','Long-term debt',2,'P1','Debt perimeter and liabilities across comparative years'),
 ('piotroski','STMT_CURRENT_ASSETS','Current assets',2,'P1','Issuer current/long-term presentation; financial sector needs separate rules'),
 ('piotroski','STMT_CURRENT_LIABILITIES','Current liabilities',2,'P1','Current-liability definition and cash liquidity classification'),
 ('piotroski','STMT_WEIGHTED_AVG_SHARES','Share denominator',2,'P1','Stock split / issuance: diluted weighted-average is NOT shares outstanding at year-end'),
 ('piotroski','STMT_GROSS_PROFIT','Gross profit',2,'P1','Gross margin may not be a meaningful standard measure for financial firms'),
 ('magic_formula','STMT_EBIT','EBIT',1,'P0','Operating income versus EBIT; no current direct SEC mapping'),
 ('magic_formula','STMT_TOTAL_DEBT','Total debt',1,'P0','Short-term plus long-term interest-bearing debt; avoid double counting'),
 ('magic_formula','STMT_CURRENT_ASSETS','Current assets',1,'P1','Operating working capital definition requires issuer-specific review'),
 ('magic_formula','STMT_CURRENT_LIABILITIES','Current liabilities',1,'P1','Operating working capital and non-operating line treatment'),
 ('magic_formula','STMT_CASH_AND_EQUIVALENTS','Cash and equivalents',1,'P1','Cash perimeter and restricted cash for enterprise value'),
 ('magic_formula','STMT_NET_PROPERTY_PLANT_EQUIPMENT','Net fixed assets',1,'P1','Net PPE does not necessarily represent all invested operating capital')
) AS r(model_key,metric_code,metric_label,required_annual_periods,priority_band,accounting_risk);
REVOKE ALL ON public.sec_model_metric_requirements FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.sec_model_metric_requirements TO service_role;

CREATE OR REPLACE VIEW public.sec_model_metric_readiness
WITH (security_invoker=true) AS
WITH original_years AS (
 SELECT f.id,f.asset_id,f.period_end,
  row_number() OVER(PARTITION BY f.asset_id ORDER BY f.period_end DESC,f.id) AS recency
 FROM public.fundamental_filings f JOIN public.data_sources d ON d.id=f.source_id
 WHERE d.provider_code='sec_edgar' AND f.fiscal_period='FY'
  AND f.revision_no=1 AND NOT f.is_restatement
), latest AS (
 SELECT * FROM original_years WHERE recency<=3
), observed AS (
 SELECT f.asset_id,ff.metric_code,
  count(DISTINCT f.id)::integer AS observed_annual_periods
 FROM latest f JOIN public.fundamental_facts ff ON ff.filing_id=f.id
 GROUP BY f.asset_id,ff.metric_code
), issuer_review AS (
 SELECT r.asset_id,r.metric_basis,
  count(DISTINCT r.original_period_filing_id)::integer AS checked_annual_periods
 FROM public.sec_issuer_reconciliations r
 JOIN latest l ON l.id=r.original_period_filing_id
 WHERE r.evidence_kind='original_period_10k'
 AND r.evidence_filing_id=r.original_period_filing_id
 AND r.evidence_status='issuer_document_checked'
 AND r.accounting_policy_version='sec.issuer.reconciliation.v1'
 GROUP BY r.asset_id,r.metric_basis
), base AS (
 SELECT c.asset_id,c.symbol,c.filing_years,c.three_year_history_available,
  r.model_key,r.metric_code,r.metric_label,
  r.required_annual_periods,r.priority_band,r.accounting_risk,
  COALESCE(o.observed_annual_periods,0) AS observed_annual_periods,
  CASE
   WHEN r.metric_code='STMT_NET_INCOME' THEN COALESCE(ni.checked_annual_periods,0)
   WHEN r.metric_code='STMT_REVENUE' THEN COALESCE(rv.checked_annual_periods,0)
   ELSE 0 END AS checked_annual_periods,
  i.code AS mapped_industry_code,
  (a.industry_id IS NULL OR i.id IS NULL) AS industry_mapping_missing
 FROM public.sec_original_10k_coverage c
 JOIN public.assets a ON a.id=c.asset_id
 LEFT JOIN public.industries i ON i.id=a.industry_id
 CROSS JOIN public.sec_model_metric_requirements r
 LEFT JOIN observed o ON o.asset_id=c.asset_id AND o.metric_code=r.metric_code
 LEFT JOIN issuer_review ni ON ni.asset_id=c.asset_id AND ni.metric_basis='consolidated_net_income'
 LEFT JOIN issuer_review rv ON rv.asset_id=c.asset_id AND rv.metric_basis='bank_issuer_total_revenue'
)
SELECT b.*,
 CASE
  WHEN b.three_year_history_available IS DISTINCT FROM true
    THEN 'source_history_incomplete'
  WHEN b.model_key='magic_formula' AND b.mapped_industry_code IN ('SEC_FIN','SEC_RE','SEC_UTL')
    THEN 'sector_excluded'
  WHEN b.metric_code='STMT_WEIGHTED_AVG_SHARES'
    THEN 'weighted_average_not_year_end_issuance_proxy'
  WHEN b.checked_annual_periods>=b.required_annual_periods
    THEN 'reviewed_evidence_present_not_model_approved'
  WHEN b.observed_annual_periods=0 THEN 'no_eligible_original_tag'
  WHEN b.observed_annual_periods<b.required_annual_periods
    THEN 'missing_required_annual_observations'
  WHEN b.model_key='magic_formula' AND b.industry_mapping_missing
    THEN 'industry_identity_review_required'
  ELSE 'source_definition_and_numerical_review_required'
 END AS readiness_blocker,
 CASE
  WHEN b.priority_band='P0' THEN 1 ELSE 2 END AS priority_order,
 false AS scoring_eligible,
 false AS model_input_approved
FROM base b;
REVOKE ALL ON public.sec_model_metric_readiness FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.sec_model_metric_readiness TO service_role;

CREATE OR REPLACE VIEW public.sec_model_metric_priorities
WITH (security_invoker=true) AS
SELECT model_key,metric_code,metric_label,required_annual_periods,
 priority_band,accounting_risk,
 count(*)::integer AS covered_issuers,
 count(*) FILTER(WHERE three_year_history_available)::integer AS complete_history_issuers,
 count(*) FILTER(WHERE observed_annual_periods>=required_annual_periods)::integer AS source_period_coverage_issuers,
 count(*) FILTER(WHERE checked_annual_periods>=required_annual_periods)::integer AS issuer_document_checked_issuers,
 count(*) FILTER(WHERE readiness_blocker='no_eligible_original_tag')::integer AS no_tag_issuers,
 count(*) FILTER(WHERE readiness_blocker='source_history_incomplete')::integer AS history_exceptions,
 count(*) FILTER(WHERE model_key='magic_formula' AND industry_mapping_missing)::integer AS unclassified_industries,
 false AS permitted_for_automatic_models
FROM public.sec_model_metric_readiness
GROUP BY model_key,metric_code,metric_label,required_annual_periods,
 priority_band,accounting_risk;
REVOKE ALL ON public.sec_model_metric_priorities FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.sec_model_metric_priorities TO service_role;

COMMENT ON VIEW public.sec_model_metric_priorities IS
'Source requirements from existing Piotroski and Magic Formula code, per issuer SEC original filing coverage. Excludes pre-calculated FUND ratios and hypothetical DCF modules; no score or model grants.';
