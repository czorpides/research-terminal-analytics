-- Abort release if one original SEC 10-K, sector revenue bridge or
-- stock split comparative was omitted. All figures retain model embargo.
DO $qa$
DECLARE n integer; v numeric;
BEGIN
 SELECT count(*) INTO n FROM public.sec_issuer_reconciliations r
 WHERE r.accounting_policy_version='sec.issuer.reconciliation.v1';
 IF n<>17 THEN RAISE EXCEPTION 'Expected 17 issuer evidence entries, found %',n; END IF;
 SELECT count(*) INTO n FROM public.sec_issuer_reconciliations r
 WHERE r.model_eligible OR r.score_eligible;
 IF n<>0 THEN RAISE EXCEPTION 'Unsafe SEC issuer source promoted to scoring'; END IF;
 SELECT count(*) INTO n FROM public.sec_corporate_action_evidence e
 JOIN public.assets a ON a.id=e.asset_id
 WHERE a.symbol='AVGO' AND e.action_effective_date='2024-07-12'
  AND e.numerator=10 AND e.denominator=1;
 IF n<>1 THEN RAISE EXCEPTION 'Verified 10-for-one Broadcom split evidence missing';END IF;
 -- The rounded 2023 original share count remains 427m in original ledger
 -- while a subsequent 10-K restated 2023 to 4.272bn, NOT 4.270bn.
 SELECT value_num INTO v FROM public.fundamental_facts ff
 JOIN public.fundamental_filings f ON f.id=ff.filing_id
 JOIN public.assets a ON a.id=f.asset_id
 WHERE a.symbol='AVGO' AND f.period_end='2023-10-29'
  AND ff.metric_code='STMT_WEIGHTED_AVG_SHARES';
 IF v IS DISTINCT FROM 427000000 THEN
  RAISE EXCEPTION 'Original FY2023 Broadcom share count was rewritten'; END IF;
 SELECT r.reported_value INTO v FROM public.sec_issuer_reconciliations r
 JOIN public.assets a ON a.id=r.asset_id WHERE a.symbol='AVGO'
  AND r.reported_period_end='2023-10-29'
  AND r.metric_basis='diluted_shares_split_adjusted_comparative';
 IF v IS DISTINCT FROM 4272000000 THEN
   RAISE EXCEPTION 'Split-adjusted 2023 comparative missing';END IF;
 -- Bank issuer total net revenue is net interest plus noninterest revenue.
 IF EXISTS(
  SELECT 1 FROM (
   SELECT a.symbol,
    sum(r.reported_value) FILTER(WHERE r.metric_basis='bank_net_interest_income') ni,
    sum(r.reported_value) FILTER(WHERE r.metric_basis='bank_noninterest_income') nni,
    sum(r.reported_value) FILTER(WHERE r.metric_basis='bank_issuer_total_revenue') total
   FROM public.sec_issuer_reconciliations r
   JOIN public.assets a ON a.id=r.asset_id
   WHERE a.symbol IN ('PNC','WFC','GS') AND r.reported_period_end='2025-12-31'
   GROUP BY a.symbol
  ) bridge WHERE ni IS NULL OR nni IS NULL OR total IS NULL OR ni+nni<>total
 ) THEN RAISE EXCEPTION 'Issuer bank revenue bridge does not reconcile';END IF;
END $qa$;