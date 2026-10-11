-- Phase 2E: read-only quality diagnostics for official original SEC 10-K facts.
-- Counts are evidence coverage, NEVER a green light for live ranking updates.
CREATE OR REPLACE VIEW public.sec_original_10k_coverage
WITH (security_invoker=true)
AS
WITH sec_source AS (
  SELECT id FROM public.data_sources
  WHERE provider_code='sec_edgar' AND active=true
),
filings AS (
  SELECT f.id,f.asset_id,f.period_end,f.known_at
  FROM public.fundamental_filings f
  JOIN sec_source s ON s.id=f.source_id
  WHERE f.fiscal_period='FY' AND f.revision_no=1 AND NOT f.is_restatement
),
filing_counts AS (
  SELECT asset_id, count(*)::integer filing_years,
         min(period_end) first_period_end,
         max(period_end) last_period_end,
         max(known_at) last_observed_at
  FROM filings GROUP BY asset_id
),
latest AS (
  SELECT DISTINCT ON (asset_id) asset_id,id,period_end
  FROM filings
  ORDER BY asset_id,period_end DESC,id
),
fact_totals AS (
  SELECT f.asset_id,count(ff.id)::integer total_fact_count
  FROM filings f JOIN public.fundamental_facts ff ON ff.filing_id=f.id
  GROUP BY f.asset_id
),
latest_core AS (
  SELECT l.asset_id,
    count(DISTINCT ff.metric_code) FILTER (WHERE ff.metric_code IN (
      'STMT_REVENUE','STMT_NET_INCOME',
      'STMT_TOTAL_ASSETS','STMT_OPERATING_CASH_FLOW'
    ))::integer latest_core_count,
    count(ff.id)::integer latest_fact_count
  FROM latest l LEFT JOIN public.fundamental_facts ff ON ff.filing_id=l.id
  GROUP BY l.asset_id
)
SELECT a.id asset_id,a.symbol,
  c.filing_years,c.first_period_end,c.last_period_end,c.last_observed_at,
  coalesce(t.total_fact_count,0)::integer total_fact_count,
  coalesce(l.latest_core_count,0)::integer latest_core_count,
  coalesce(l.latest_fact_count,0)::integer latest_fact_count,
  (c.filing_years>=3) three_year_history_available,
  (coalesce(l.latest_core_count,0)=4) latest_core_observed
FROM filing_counts c
JOIN public.assets a ON a.id=c.asset_id
LEFT JOIN fact_totals t ON t.asset_id=c.asset_id
LEFT JOIN latest_core l ON l.asset_id=c.asset_id;

REVOKE ALL ON public.sec_original_10k_coverage FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.sec_original_10k_coverage TO service_role;
COMMENT ON VIEW public.sec_original_10k_coverage IS
'Original 10-K SEC provenance completeness, NOT a full set of financial statements or permission to re-score equities.';
