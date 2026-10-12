-- Phase 2J4: two-step research-model-only approval (not Radar/scoring).
-- Service-role-only functions, immutable source evidence, audited transitions.
CREATE TABLE public.sec_model_review_cases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 asset_id uuid NOT NULL REFERENCES public.assets(id),
 metric_basis text NOT NULL CHECK (metric_basis IN
   ('consolidated_net_income','bank_issuer_total_revenue')),
 original_evidence_ids uuid[] NOT NULL CHECK
   (cardinality(original_evidence_ids)=3),
 latest_annual_period date NOT NULL,
 policy_version text NOT NULL DEFAULT 'sec.model.review.v1'
    CHECK (policy_version='sec.model.review.v1'),
 model_scope text NOT NULL DEFAULT 'research_only'
    CHECK(model_scope='research_only'),
 state text NOT NULL DEFAULT 'proposed' CHECK
   (state IN ('proposed','research_approved','rejected','revoked')),
 proposer uuid NOT NULL,
 proposal_notes text NOT NULL CHECK(length(trim(proposal_notes))>=40),
 submitted_at timestamptz NOT NULL DEFAULT now(),
 reviewer uuid, reviewed_at timestamptz, review_notes text,
 scoring_enabled boolean NOT NULL DEFAULT false CHECK(scoring_enabled=false),
 UNIQUE(asset_id,metric_basis,latest_annual_period)
);
CREATE TABLE public.sec_model_review_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 case_id uuid NOT NULL REFERENCES public.sec_model_review_cases(id),
 actor uuid NOT NULL,
 event_type text NOT NULL CHECK(event_type IN('proposed','research_approved','rejected','revoked')),
 detail text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sec_model_review_events_case ON public.sec_model_review_events(case_id,recorded_at);
ALTER TABLE public.sec_model_review_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sec_model_review_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sec_model_review_cases,public.sec_model_review_events
 FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.sec_model_review_cases,public.sec_model_review_events TO service_role;

-- Independently revalidate the current 3 original FYs every time the owner
-- proposes or approves. No later-filed comparative allowed for this version.
CREATE OR REPLACE FUNCTION public.sec_model_three_year_evidence(
 p_asset uuid,p_basis text
) RETURNS TABLE(evidence_ids uuid[],latest_period date)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_filings uuid[];
DECLARE v_latest date;
DECLARE v_ids uuid[];
DECLARE v_parts integer;
BEGIN
 IF p_asset IS NULL OR p_basis NOT IN
  ('consolidated_net_income','bank_issuer_total_revenue') THEN
  RAISE EXCEPTION 'Unsupported issuer-specific model evidence basis';
 END IF;
 IF NOT EXISTS(
  SELECT 1 FROM public.sec_original_10k_coverage c
   WHERE c.asset_id=p_asset AND c.three_year_history_available=true
 ) THEN RAISE EXCEPTION 'Three consecutive original SEC FY 10-K years required';END IF;
 SELECT array_agg(f.id ORDER BY f.period_end DESC),max(f.period_end)
 INTO v_filings,v_latest
 FROM (SELECT f.id,f.period_end FROM public.fundamental_filings f
  JOIN public.data_sources d ON d.id=f.source_id
   WHERE f.asset_id=p_asset AND d.provider_code='sec_edgar'
    AND f.fiscal_period='FY' AND f.revision_no=1 AND NOT f.is_restatement
  ORDER BY f.period_end DESC LIMIT 3) f;
 IF coalesce(cardinality(v_filings),0)<>3 THEN
  RAISE EXCEPTION 'Insufficient original SEC FY filings';
 END IF;
 SELECT array_agg(r.id ORDER BY f.period_end DESC) INTO v_ids
 FROM unnest(v_filings) u(filing_id)
 JOIN public.fundamental_filings f ON f.id=u.filing_id
 JOIN public.sec_issuer_reconciliations r ON
   r.original_period_filing_id=f.id AND
   r.evidence_filing_id=f.id AND
   r.metric_basis=p_basis AND
   r.evidence_kind='original_period_10k' AND
   r.evidence_status='issuer_document_checked' AND
   r.accounting_policy_version='sec.issuer.reconciliation.v1' AND
   r.unit='USD' AND r.asset_id=p_asset;
 IF coalesce(cardinality(v_ids),0)<>3 OR
    (SELECT count(DISTINCT x) FROM unnest(v_ids) x)<>3 THEN
  RAISE EXCEPTION 'Three years of source-checked, original-year issuer statements required';
 END IF;
 IF p_basis='bank_issuer_total_revenue' THEN
  SELECT count(*) INTO v_parts FROM (
    SELECT r.original_period_filing_id,
      max(r.reported_value) FILTER(WHERE r.metric_basis='bank_issuer_total_revenue') total,
      max(r.reported_value) FILTER(WHERE r.metric_basis='bank_net_interest_income') interest,
      max(r.reported_value) FILTER(WHERE r.metric_basis='bank_noninterest_income') noninterest,
      count(DISTINCT r.metric_basis) AS distinct_measures
    FROM public.sec_issuer_reconciliations r
    WHERE r.original_period_filing_id=ANY(v_filings)
      AND r.evidence_filing_id=r.original_period_filing_id
      AND r.asset_id=p_asset
      AND r.evidence_kind='original_period_10k'
      AND r.metric_basis IN
       ('bank_issuer_total_revenue','bank_net_interest_income','bank_noninterest_income')
    GROUP BY r.original_period_filing_id
  ) s WHERE s.distinct_measures=3 AND s.total=s.interest+s.noninterest;
  IF v_parts<>3 THEN
    RAISE EXCEPTION 'All three years require verified issuer bank revenue bridges';
  END IF;
 END IF;
 RETURN QUERY SELECT v_ids,v_latest;
END $$;

CREATE OR REPLACE FUNCTION public.sec_model_propose_review(
 p_owner uuid,p_asset uuid,p_basis text,p_notes text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_ids uuid[];
DECLARE v_end date;
DECLARE v_id uuid;
BEGIN
 IF p_owner IS NULL OR p_notes IS NULL OR length(trim(p_notes))<40 THEN
   RAISE EXCEPTION 'Documented owner proposal (>=40 characters) is required';
 END IF;
 SELECT x.evidence_ids,x.latest_period INTO STRICT v_ids,v_end
 FROM public.sec_model_three_year_evidence(p_asset,p_basis) x;
 INSERT INTO public.sec_model_review_cases(
   asset_id,metric_basis,original_evidence_ids,latest_annual_period,
   proposer,proposal_notes)
 VALUES(p_asset,p_basis,v_ids,v_end,p_owner,trim(p_notes))
 RETURNING id INTO v_id;
 INSERT INTO public.sec_model_review_events(case_id,actor,event_type,detail)
 VALUES(v_id,p_owner,'proposed','Owner requested research-only 3-year SEC metric review');
 RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.sec_model_decide_review(
 p_owner uuid,p_case uuid,p_decision text,p_notes text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_case public.sec_model_review_cases%ROWTYPE;
DECLARE v_ids uuid[];
DECLARE v_latest date;
DECLARE v_state text;
BEGIN
 IF p_owner IS NULL OR p_case IS NULL OR p_decision NOT IN
   ('research_approved','rejected','revoked') OR
   p_notes IS NULL OR length(trim(p_notes))<80 THEN
  RAISE EXCEPTION 'Explicit reviewer and documented decision (>=80 characters) required';
 END IF;
 SELECT * INTO STRICT v_case FROM public.sec_model_review_cases
   WHERE id=p_case FOR UPDATE;
 IF (p_decision IN ('research_approved','rejected')
    AND v_case.state<>'proposed') OR
    (p_decision='revoked' AND v_case.state<>'research_approved')
 THEN RAISE EXCEPTION 'Invalid SEC research review state transition';END IF;
 IF p_decision='research_approved' THEN
   SELECT e.evidence_ids,e.latest_period INTO STRICT v_ids,v_latest
     FROM public.sec_model_three_year_evidence(v_case.asset_id,v_case.metric_basis) e;
   IF v_ids IS DISTINCT FROM v_case.original_evidence_ids
     OR v_latest IS DISTINCT FROM v_case.latest_annual_period
   THEN RAISE EXCEPTION 'SEC original source evidence changed; re-review required';END IF;
 END IF;
 UPDATE public.sec_model_review_cases SET
  state=p_decision,reviewer=p_owner,reviewed_at=now(),review_notes=trim(p_notes)
 WHERE id=p_case;
 INSERT INTO public.sec_model_review_events(case_id,actor,event_type,detail)
 VALUES(p_case,p_owner,p_decision,trim(p_notes));
 RETURN p_decision;
END $$;

-- Current approval is contingent on unchanged original 3-year evidence.
-- Even research approval NEVER enables automated investment scoring.
CREATE OR REPLACE VIEW public.sec_model_readiness_review
WITH (security_invoker=true) AS
SELECT r.id,r.asset_id,a.symbol,r.metric_basis,r.latest_annual_period,
 r.original_evidence_ids,r.proposal_notes,r.submitted_at,r.proposer,
 r.state,r.reviewer,r.reviewed_at,r.review_notes,r.policy_version,r.model_scope,
 r.scoring_enabled,
 (r.state='research_approved'
  AND c.three_year_history_available=true
  AND c.last_period_end=r.latest_annual_period
  AND r.reviewed_at IS NOT NULL
  AND r.original_evidence_ids IS NOT NULL) AS research_model_approval_current,
 false AS radar_scoring_eligible,
 false AS automatic_live_model_consumption_enabled
FROM public.sec_model_review_cases r
JOIN public.assets a ON a.id=r.asset_id
JOIN public.sec_original_10k_coverage c ON c.asset_id=r.asset_id;

REVOKE ALL ON public.sec_model_readiness_review FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.sec_model_readiness_review TO service_role;
REVOKE ALL ON FUNCTION public.sec_model_three_year_evidence(uuid,text),
 public.sec_model_propose_review(uuid,uuid,text,text),
 public.sec_model_decide_review(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sec_model_three_year_evidence(uuid,text),
 public.sec_model_propose_review(uuid,uuid,text,text),
 public.sec_model_decide_review(uuid,uuid,text,text) TO service_role;
COMMENT ON VIEW public.sec_model_readiness_review IS
'Research-only evidence approval; unchanged original current 3-year SEC history. Separate opt-in model consumer needed; NEVER Radar/source scoring.';
