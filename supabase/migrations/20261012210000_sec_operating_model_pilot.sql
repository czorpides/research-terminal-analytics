-- Phase 2J6: direct original 10-K pilot, no mutations to source facts or score models.
-- Three actual non-bank issuer fiscal-years with independently checked statement
-- line items. Operating income is NEVER automatically treated as EBIT, and
-- borrowed money excluding leases is NOT certified as universal EV total debt.
CREATE TABLE IF NOT EXISTS public.sec_operating_model_pilot (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 asset_id uuid NOT NULL REFERENCES public.assets(id),
 original_filing_id uuid NOT NULL REFERENCES public.fundamental_filings(id),
 period_end date NOT NULL,
 observed_basis text NOT NULL CHECK(observed_basis IN
   ('gaap_consolidated_operating_income','borrowings_excluding_leases')),
 reported_usd numeric NOT NULL CHECK(reported_usd>=0),
 components jsonb NOT NULL CHECK(jsonb_typeof(components)='array' AND
   jsonb_array_length(components) BETWEEN 1 AND 5),
 source_section text NOT NULL CHECK(length(trim(source_section))>=12),
 accounting_caveat text NOT NULL CHECK(length(trim(accounting_caveat))>=40),
 definition_version text NOT NULL DEFAULT 'sec.operating.pilot.v1'
    CHECK(definition_version='sec.operating.pilot.v1'),
 evidence_state text NOT NULL DEFAULT 'original_statement_checked'
    CHECK(evidence_state='original_statement_checked'),
 model_eligible boolean NOT NULL DEFAULT false CHECK(model_eligible=false),
 scoring_eligible boolean NOT NULL DEFAULT false CHECK(scoring_eligible=false),
 source_checked_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(asset_id,period_end,observed_basis)
);
CREATE OR REPLACE FUNCTION public.sec_operating_pilot_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_f public.fundamental_filings%ROWTYPE;
DECLARE v_item jsonb;
DECLARE v_total numeric:=0;
DECLARE v_count integer:=0;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'SEC pilot ledger is append-only';END IF;
 SELECT * INTO v_f FROM public.fundamental_filings WHERE id=NEW.original_filing_id;
 IF v_f.id IS NULL OR v_f.asset_id IS DISTINCT FROM NEW.asset_id
    OR v_f.period_end IS DISTINCT FROM NEW.period_end
    OR v_f.fiscal_period<>'FY' OR v_f.revision_no<>1 OR v_f.is_restatement
    OR v_f.raw->>'form'<>'10-K'
    OR coalesce(v_f.raw->>'primaryDocumentUrl','') NOT LIKE
       'https://www.sec.gov/Archives/edgar/data/%'
    OR v_f.source_filing_id IS NULL
    OR v_f.raw->>'accession' IS DISTINCT FROM v_f.source_filing_id
    OR NOT EXISTS(SELECT 1 FROM public.data_sources d WHERE
         d.id=v_f.source_id AND d.provider_code='sec_edgar')
 THEN RAISE EXCEPTION 'Original exact-accession issuer annual filing required';END IF;
 FOR v_item IN SELECT value FROM jsonb_array_elements(NEW.components)
 LOOP
   IF jsonb_typeof(v_item)<>'object'
     OR length(trim(coalesce(v_item->>'line','')))<3
     OR coalesce(v_item->>'line','')=''
     OR coalesce(v_item->>'amount_usd','') !~ '^[0-9]+$'
   THEN RAISE EXCEPTION 'Invalid source statement component';END IF;
   v_total:=v_total+(v_item->>'amount_usd')::numeric;
   v_count:=v_count+1;
 END LOOP;
 IF NEW.observed_basis='gaap_consolidated_operating_income' AND v_count<>1
 THEN RAISE EXCEPTION 'Operating income must identify exactly one source line';END IF;
 IF NEW.observed_basis='borrowings_excluding_leases' AND v_count<2
 THEN RAISE EXCEPTION 'Borrowing components incomplete';END IF;
 IF v_total<>NEW.reported_usd
 THEN RAISE EXCEPTION 'Original source statement components do not reconcile';END IF;
 NEW.model_eligible:=false;NEW.scoring_eligible:=false;
 NEW.source_checked_at:=now();
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sec_operating_pilot_immutable ON public.sec_operating_model_pilot;
CREATE TRIGGER sec_operating_pilot_immutable
 BEFORE INSERT OR UPDATE OR DELETE ON public.sec_operating_model_pilot
 FOR EACH ROW EXECUTE FUNCTION public.sec_operating_pilot_guard();
ALTER TABLE public.sec_operating_model_pilot ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sec_operating_model_pilot FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.sec_operating_model_pilot TO service_role;
REVOKE ALL ON FUNCTION public.sec_operating_pilot_guard() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE VIEW public.sec_operating_pilot_review WITH (security_invoker=true)
AS
SELECT a.symbol,p.period_end,p.observed_basis,p.reported_usd,
 p.components,p.source_section,p.accounting_caveat,p.definition_version,
 p.evidence_state,p.model_eligible,p.scoring_eligible,p.source_checked_at,
 f.id AS filing_id,f.source_filing_id AS original_accession,
 f.known_at AS filing_first_observed,
 f.raw->>'primaryDocumentUrl' AS original_10k_url
FROM public.sec_operating_model_pilot p
JOIN public.assets a ON a.id=p.asset_id
JOIN public.fundamental_filings f ON f.id=p.original_filing_id;
REVOKE ALL ON public.sec_operating_pilot_review FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.sec_operating_pilot_review TO service_role;
COMMENT ON VIEW public.sec_operating_pilot_review IS
'Read-only 3-company source-accounting pilot. Operating income is distinct from EBIT and borrowing subset excludes leases; no automated scoring or model authorisation.';
