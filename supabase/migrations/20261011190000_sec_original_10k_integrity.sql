-- Phase 2F: independent structural QA on original SEC evidence already stored.
-- Diagnostic only: zero flags cannot establish numerical accuracy or score eligibility.
CREATE OR REPLACE VIEW public.sec_original_10k_integrity
WITH (security_invoker=true)
AS
WITH sec_filings AS (
  SELECT f.id,f.asset_id,f.source_id,f.source_filing_id,f.period_end,
         f.fiscal_period,f.revision_no,f.is_restatement,f.known_at,
         f.published_at,f.raw
  FROM public.fundamental_filings f
  JOIN public.data_sources d ON d.id=f.source_id
  WHERE d.provider_code='sec_edgar' AND d.active=true
), filing_audit AS (
  SELECT f.id,f.asset_id,
    count(ff.id)::integer fact_rows,
    (count(ff.id)-count(DISTINCT ff.metric_code))::integer duplicate_metric_rows,
    count(ff.id) FILTER (WHERE
      ff.asset_id IS DISTINCT FROM f.asset_id OR
      ff.source_id IS DISTINCT FROM f.source_id OR
      ff.period_end IS DISTINCT FROM f.period_end OR
      ff.known_at IS DISTINCT FROM f.known_at OR
      ff.revision_no IS DISTINCT FROM 1 OR
      ff.is_restatement IS DISTINCT FROM false OR
      (ff.raw->>'accn') IS DISTINCT FROM f.source_filing_id
    )::integer inconsistent_fact_rows,
    CASE WHEN
      f.source_filing_id !~ '^[0-9]{10}-[0-9]{2}-[0-9]{6}$' OR
      f.fiscal_period IS DISTINCT FROM 'FY' OR
      f.revision_no IS DISTINCT FROM 1 OR
      f.is_restatement IS DISTINCT FROM false OR
      f.known_at IS NULL OR
      f.published_at IS NOT NULL OR
      (f.raw->>'form') IS DISTINCT FROM '10-K' OR
      (f.raw->>'accession') IS DISTINCT FROM f.source_filing_id OR
      (f.raw->>'reportDate') IS DISTINCT FROM f.period_end::text OR
      COALESCE((f.raw->>'filedDate') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$',true) OR
      COALESCE(f.known_at::date::text < (f.raw->>'filedDate'),true)
    THEN 1 ELSE 0 END::integer bad_filing_metadata
  FROM sec_filings f
  LEFT JOIN public.fundamental_facts ff ON ff.filing_id=f.id
  GROUP BY f.id,f.asset_id,f.source_id,f.source_filing_id,f.period_end,
           f.fiscal_period,f.revision_no,f.is_restatement,f.known_at,
           f.published_at,f.raw
)
SELECT a.id AS asset_id,a.symbol,
  count(*)::integer checked_filings,
  sum(bad_filing_metadata)::integer invalid_metadata_filings,
  count(*) FILTER (WHERE fact_rows=0)::integer empty_filings,
  sum(duplicate_metric_rows)::integer duplicate_metrics,
  sum(inconsistent_fact_rows)::integer inconsistent_fact_rows
FROM filing_audit x
JOIN public.assets a ON a.id=x.asset_id
GROUP BY a.id,a.symbol;

REVOKE ALL ON public.sec_original_10k_integrity FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.sec_original_10k_integrity TO service_role;
COMMENT ON VIEW public.sec_original_10k_integrity IS
'Internal consistency flags for SEC original 10-K evidence; no judgement on reported numbers or trading-score readiness.';
