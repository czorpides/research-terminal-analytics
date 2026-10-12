-- Phase 2J4. Dynamic reconciliation coverage of ALL original SEC issuers.
-- Read-only and service-role-only. No automatic numerical certification.
CREATE OR REPLACE VIEW public.sec_reconciliation_coverage
WITH (security_invoker=true) AS
WITH original_years AS (
 SELECT f.id AS filing_id,f.asset_id,f.period_end,
 row_number() OVER (PARTITION BY f.asset_id ORDER BY f.period_end DESC) AS ordinal
 FROM public.fundamental_filings f
 JOIN public.data_sources d ON d.id=f.source_id
 WHERE d.provider_code='sec_edgar'
  AND f.fiscal_period='FY' AND f.revision_no=1 AND NOT f.is_restatement
), last_three AS (
 SELECT * FROM original_years WHERE ordinal<=3
), raw_metrics AS (
 SELECT l.asset_id,ff.metric_code,
  count(DISTINCT l.filing_id)::integer AS direct_years
 FROM last_three l
 JOIN public.fundamental_facts ff ON ff.filing_id=l.filing_id
 GROUP BY l.asset_id,ff.metric_code
), validated AS (
 SELECT r.asset_id,r.metric_basis,
  count(DISTINCT r.reported_period_end)::integer AS checked_years
 FROM public.sec_issuer_reconciliations r
 JOIN last_three l ON l.filing_id=r.original_period_filing_id
 WHERE r.evidence_kind='original_period_10k'
   AND r.evidence_filing_id=r.original_period_filing_id
   AND r.accounting_policy_version='sec.issuer.reconciliation.v1'
 GROUP BY r.asset_id,r.metric_basis
), metrics(metric_code,display_label,eligible_basis) AS (
 VALUES
 ('STMT_REVENUE','Issuer revenue requires accounting scope',
  'bank_issuer_total_revenue'),
 ('STMT_NET_INCOME','Consolidated net income',
  'consolidated_net_income'),
 ('STMT_TOTAL_ASSETS','Total assets',NULL::text),
 ('STMT_OPERATING_CASH_FLOW','Operating cash flow',NULL::text),
 ('STMT_WEIGHTED_AVG_SHARES','Diluted weighted shares',NULL::text)
)
SELECT c.asset_id,c.symbol,c.filing_years,c.three_year_history_available,
 m.metric_code,m.display_label,m.eligible_basis,
 COALESCE(x.direct_years,0) AS direct_original_years,
 CASE WHEN m.eligible_basis IS NULL THEN 0
   ELSE COALESCE(r.checked_years,0) END AS issuer_document_checked_years,
 CASE
  WHEN NOT c.three_year_history_available THEN 'filing_history_incomplete'
  WHEN m.eligible_basis IS NOT NULL AND COALESCE(r.checked_years,0)=3
    THEN 'three_year_evidence_ready_for_owner_review'
  WHEN COALESCE(x.direct_years,0)<3 THEN 'missing_original_tag'
  WHEN m.eligible_basis IS NULL THEN 'basis_policy_not_yet_defined'
  ELSE 'issuer_statement_review_pending'
 END AS review_stage,
 false AS automatically_model_eligible,
 false AS automatically_score_eligible
FROM public.sec_original_10k_coverage c
CROSS JOIN metrics m
LEFT JOIN raw_metrics x ON x.asset_id=c.asset_id AND x.metric_code=m.metric_code
LEFT JOIN validated r ON r.asset_id=c.asset_id AND r.metric_basis=m.eligible_basis;

REVOKE ALL ON public.sec_reconciliation_coverage FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.sec_reconciliation_coverage TO service_role;
COMMENT ON VIEW public.sec_reconciliation_coverage IS
'All SEC issuers x five core original annual metrics. Source presence and checked statements are separate; all candidates default to unapproved.';
