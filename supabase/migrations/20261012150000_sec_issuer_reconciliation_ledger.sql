-- Phase 2J3: original-issuer-document numeric reconciliation evidence.
-- Separate immutable evidence; never UPDATE fundamental_filings/fundamental_facts.
-- No score, valuation, source provider or SEC worker is changed.
CREATE TABLE IF NOT EXISTS public.sec_issuer_reconciliations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 asset_id uuid NOT NULL REFERENCES public.assets(id),
 reported_period_end date NOT NULL,
 metric_basis text NOT NULL CHECK (metric_basis IN (
   'consolidated_net_income',
   'bank_issuer_total_revenue',
   'bank_net_interest_income',
   'bank_noninterest_income',
   'diluted_shares_split_adjusted_comparative'
 )),
 unit text NOT NULL CHECK (unit IN ('USD','shares')),
 reported_value numeric NOT NULL,
 original_period_filing_id uuid NOT NULL REFERENCES public.fundamental_filings(id),
 evidence_filing_id uuid NOT NULL REFERENCES public.fundamental_filings(id),
 evidence_kind text NOT NULL CHECK (evidence_kind IN
   ('original_period_10k','later_10k_comparative')),
 evidence_line_label text NOT NULL CHECK (length(trim(evidence_line_label))>=5),
 statement_location text NOT NULL CHECK (length(trim(statement_location))>=5),
 source_checked_at timestamptz NOT NULL DEFAULT now(),
 evidence_status text NOT NULL DEFAULT 'issuer_document_checked'
   CHECK (evidence_status='issuer_document_checked'),
 accounting_policy_version text NOT NULL DEFAULT 'sec.issuer.reconciliation.v1'
   CHECK (accounting_policy_version='sec.issuer.reconciliation.v1'),
 comparison_caveat text NOT NULL CHECK (length(trim(comparison_caveat))>=12),
 source_fact_id uuid NULL REFERENCES public.fundamental_facts(id),
 model_eligible boolean NOT NULL DEFAULT false CHECK (model_eligible=false),
 score_eligible boolean NOT NULL DEFAULT false CHECK (score_eligible=false),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(asset_id,reported_period_end,metric_basis,evidence_filing_id)
);
CREATE INDEX IF NOT EXISTS sec_issuer_reconciliations_asset_period
 ON public.sec_issuer_reconciliations(asset_id,reported_period_end DESC);

CREATE OR REPLACE FUNCTION public.sec_reconciliation_validate_immutable()
RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_period public.fundamental_filings%ROWTYPE;
DECLARE v_source public.fundamental_filings%ROWTYPE;
DECLARE v_tag text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'SEC reconciliation evidence is append-only';
  END IF;
  SELECT * INTO v_period FROM public.fundamental_filings
    WHERE id=NEW.original_period_filing_id;
  SELECT * INTO v_source FROM public.fundamental_filings
    WHERE id=NEW.evidence_filing_id;
  IF v_period.id IS NULL OR v_source.id IS NULL
    OR v_period.asset_id IS DISTINCT FROM NEW.asset_id
    OR v_source.asset_id IS DISTINCT FROM NEW.asset_id
    OR v_period.period_end IS DISTINCT FROM NEW.reported_period_end
    OR v_period.fiscal_period<>'FY' OR v_source.fiscal_period<>'FY'
    OR v_period.revision_no<>1 OR v_source.revision_no<>1
    OR v_period.is_restatement OR v_source.is_restatement
    OR NOT EXISTS(SELECT 1 FROM public.data_sources s
      WHERE s.id=v_period.source_id AND s.provider_code='sec_edgar')
    OR NOT EXISTS(SELECT 1 FROM public.data_sources s
      WHERE s.id=v_source.source_id AND s.provider_code='sec_edgar')
    OR v_source.raw->>'form'<>'10-K' OR v_period.raw->>'form'<>'10-K'
    OR v_source.source_filing_id IS NULL
    OR v_source.raw->>'accession' IS DISTINCT FROM v_source.source_filing_id
    OR v_source.raw->>'primaryDocumentUrl' NOT LIKE
       'https://www.sec.gov/Archives/edgar/data/%'
    OR (NEW.evidence_kind='original_period_10k' AND
       v_period.id IS DISTINCT FROM v_source.id)
    OR (NEW.evidence_kind='later_10k_comparative' AND
       v_source.period_end<=v_period.period_end)
  THEN RAISE EXCEPTION 'Invalid issuer/filing/accession/period evidence';
  END IF;
  IF (NEW.metric_basis='diluted_shares_split_adjusted_comparative')
     IS DISTINCT FROM (NEW.unit='shares')
     OR (NEW.unit='shares' AND (NEW.evidence_kind<>'later_10k_comparative'
       OR NEW.reported_value<=0))
     OR (NEW.unit='USD' AND NEW.reported_value<0)
     OR (NEW.metric_basis IN ('bank_net_interest_income','bank_noninterest_income',
            'bank_issuer_total_revenue') AND NEW.unit<>'USD')
     OR (NEW.metric_basis='consolidated_net_income' AND NEW.unit<>'USD')
  THEN RAISE EXCEPTION 'Invalid financial metric basis, unit or amount';END IF;
  IF NEW.source_fact_id IS NOT NULL THEN
    SELECT ff.raw->>'tag' INTO v_tag FROM public.fundamental_facts ff
     WHERE ff.id=NEW.source_fact_id AND ff.filing_id=v_period.id
       AND ff.asset_id=NEW.asset_id;
    IF v_tag IS NULL THEN
      RAISE EXCEPTION 'Source fact not tied to original fiscal filing';
    END IF;
  END IF;
  -- The asserted amount is a documented original statement line, not an
  -- automatically source-extracted fact. Status never approves model use.
  NEW.model_eligible:=false;
  NEW.score_eligible:=false;
  NEW.source_checked_at:=now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sec_reconciliation_immutable_guard ON public.sec_issuer_reconciliations;
CREATE TRIGGER sec_reconciliation_immutable_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.sec_issuer_reconciliations
  FOR EACH ROW EXECUTE FUNCTION public.sec_reconciliation_validate_immutable();
ALTER TABLE public.sec_issuer_reconciliations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sec_issuer_reconciliations FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.sec_issuer_reconciliations TO service_role;
REVOKE ALL ON FUNCTION public.sec_reconciliation_validate_immutable() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE VIEW public.sec_issuer_reconciliation_review
WITH (security_invoker=true) AS
SELECT a.symbol,r.reported_period_end,r.metric_basis,r.reported_value,r.unit,
       r.evidence_status,r.evidence_kind,r.evidence_line_label,
       r.statement_location,r.comparison_caveat,r.accounting_policy_version,
       r.source_checked_at,r.model_eligible,r.score_eligible,
       op.source_filing_id AS period_original_accession,
       op.raw->>'primaryDocumentUrl' AS original_period_10k_url,
       ef.source_filing_id AS evidence_accession,
       ef.period_end AS evidence_filing_period_end,
       ef.raw->>'primaryDocumentUrl' AS evidence_url,
       ef.known_at AS evidence_first_observed,
       r.source_fact_id,
       f.raw->>'tag' AS existing_direct_fact_tag,
       f.value_num AS existing_direct_fact_amount
FROM public.sec_issuer_reconciliations r
JOIN public.assets a ON a.id=r.asset_id
JOIN public.fundamental_filings op ON op.id=r.original_period_filing_id
JOIN public.fundamental_filings ef ON ef.id=r.evidence_filing_id
LEFT JOIN public.fundamental_facts f ON f.id=r.source_fact_id;

REVOKE ALL ON public.sec_issuer_reconciliation_review FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.sec_issuer_reconciliation_review TO service_role;
COMMENT ON VIEW public.sec_issuer_reconciliation_review IS
'Original SEC as-filed issuer statement lines. Non-model-ready evidence only, including comparative distinction and immutable source links.';
