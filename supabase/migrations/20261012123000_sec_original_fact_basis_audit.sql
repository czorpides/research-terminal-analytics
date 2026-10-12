-- Phase 2J2: immutable raw SEC fact semantic taxonomy, not normalized
-- statement values. This view is a source-evidence audit surface only.
-- The source filing and fact remain authoritative as actually first observed.
CREATE OR REPLACE VIEW public.sec_original_fact_basis_audit
WITH (security_invoker=true)
AS
SELECT
 a.id AS asset_id,
 a.symbol,
 f.id AS filing_id,
 f.source_filing_id AS accession,
 f.period_end,
 f.known_at AS filing_first_observed,
 (f.raw->>'filedDate') AS filed_date,
 (f.raw->>'primaryDocumentUrl') AS source_document_url,
 (f.raw->>'cik') AS legal_filer_cik,
 ff.id AS fact_id,
 ff.metric_code,
 ff.value_num AS original_value,
 ff.unit,
 ff.known_at AS fact_first_observed,
 (ff.raw->>'tag') AS sec_tag,
 'sec.original.basis.v1'::text AS basis_version,
 CASE
   WHEN ff.metric_code='STMT_REVENUE' AND a.symbol='WMT'
     AND f.period_end='2026-01-31'
     AND ff.raw->>'tag'='RevenueFromContractWithCustomerExcludingAssessedTax'
     THEN 'net_sales_issuer_specific'
   WHEN ff.metric_code='STMT_REVENUE'
     AND ff.raw->>'tag'='RevenueFromContractWithCustomerExcludingAssessedTax'
     THEN 'contract_revenue_not_necessarily_total'
   WHEN ff.metric_code='STMT_REVENUE'
     AND ff.raw->>'tag'='SalesRevenueNet'
     THEN 'net_sales_not_necessarily_total'
   WHEN ff.metric_code='STMT_REVENUE'
     AND ff.raw->>'tag'='Revenues'
     THEN 'revenue_scope_requires_issuer_review'
   WHEN ff.metric_code='STMT_NET_INCOME' AND
     ff.raw->>'tag'='NetIncomeLoss'
     THEN 'reported_income_attribution_unconfirmed'
   WHEN ff.metric_code='STMT_WEIGHTED_AVG_SHARES' AND
     ff.raw->>'tag'='WeightedAverageNumberOfDilutedSharesOutstanding'
     THEN 'raw_diluted_weighted_average_unadjusted'
   WHEN ff.metric_code='STMT_OPERATING_CASH_FLOW' AND
     ff.raw->>'tag'='NetCashProvidedByUsedInOperatingActivities'
     THEN 'operating_cash_flow_direct_tag'
   WHEN ff.metric_code='STMT_TOTAL_ASSETS' AND
     ff.raw->>'tag'='Assets'
     THEN 'total_assets_direct_tag'
   ELSE 'unclassified_raw_fact'
 END AS observed_basis,
 CASE
   WHEN a.symbol='WMT' AND f.period_end='2026-01-31'
     AND ff.metric_code='STMT_REVENUE'
     THEN 'FY2026 original issuer statement describes this amount as net sales, not total revenues; issuer comparative policy still under review'
   WHEN ff.metric_code='STMT_REVENUE'
     THEN 'Revenue may differ by issuer presentation, interest/noninterest composition or other income; do not treat as comparable total revenue'
   WHEN ff.metric_code='STMT_NET_INCOME'
     THEN 'Confirm consolidated versus parent/common-shareholder attributable income from the original statement'
   WHEN ff.metric_code='STMT_WEIGHTED_AVG_SHARES'
     THEN 'As-reported denominator; review corporate actions and share-count basis before per-share comparisons'
   ELSE 'Direct SEC tag presence is not a numerical reconciliation'
 END AS unresolved_semantic_note,
 false AS source_value_reconciled,
 false AS peer_comparable,
 false AS scoring_eligible
FROM public.fundamental_facts ff
JOIN public.fundamental_filings f ON f.id=ff.filing_id
JOIN public.assets a ON a.id=f.asset_id
JOIN public.data_sources d ON d.id=f.source_id
WHERE d.provider_code='sec_edgar'
 AND d.id=ff.source_id
 AND ff.asset_id=f.asset_id
 AND f.fiscal_period='FY'
 AND f.revision_no=1
 AND f.is_restatement=false;

REVOKE ALL ON public.sec_original_fact_basis_audit FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.sec_original_fact_basis_audit TO service_role;
COMMENT ON VIEW public.sec_original_fact_basis_audit IS
'Versioned accounting-basis hints for immutable original SEC 10-K facts. Never a normalized, reconciled, or score-eligible source.';
