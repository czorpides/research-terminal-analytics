-- Verified original Broadcom FY2024 SEC 10-K: 10-for-one forward split
-- on 2024-07-12. No adjustment to original 2023 source rows or known_at.
CREATE TABLE IF NOT EXISTS public.sec_corporate_action_evidence (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 asset_id uuid NOT NULL REFERENCES public.assets(id),
 action_type text NOT NULL CHECK(action_type='forward_stock_split'),
 action_effective_date date NOT NULL,
 numerator integer NOT NULL CHECK(numerator BETWEEN 2 AND 1000),
 denominator integer NOT NULL CHECK(denominator BETWEEN 1 AND 1000),
 evidence_filing_id uuid NOT NULL REFERENCES public.fundamental_filings(id),
 original_reference text NOT NULL,
 source_checked_at timestamptz NOT NULL DEFAULT now(),
 model_eligible boolean NOT NULL DEFAULT false CHECK(model_eligible=false),
 UNIQUE(asset_id,action_type,action_effective_date,evidence_filing_id)
);
ALTER TABLE public.sec_corporate_action_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sec_corporate_action_evidence FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.sec_corporate_action_evidence TO service_role;
CREATE OR REPLACE FUNCTION public.sec_corporate_action_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE f public.fundamental_filings%ROWTYPE;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Corporate action ledger is append-only'; END IF;
 SELECT * INTO f FROM public.fundamental_filings WHERE id=NEW.evidence_filing_id;
 IF f.id IS NULL OR f.asset_id IS DISTINCT FROM NEW.asset_id
  OR f.fiscal_period<>'FY' OR f.raw->>'form'<>'10-K'
  OR NOT EXISTS(SELECT 1 FROM public.data_sources s
   WHERE s.id=f.source_id AND s.provider_code='sec_edgar')
  OR coalesce(f.raw->>'primaryDocumentUrl','') NOT LIKE
    'https://www.sec.gov/Archives/edgar/data/%'
 THEN RAISE EXCEPTION 'Not original SEC action filing'; END IF;
 NEW.model_eligible:=false;
 NEW.source_checked_at:=now();
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sec_corporate_action_appendonly ON public.sec_corporate_action_evidence;
CREATE TRIGGER sec_corporate_action_appendonly BEFORE INSERT OR UPDATE OR DELETE
 ON public.sec_corporate_action_evidence FOR EACH ROW
 EXECUTE FUNCTION public.sec_corporate_action_guard();
REVOKE ALL ON FUNCTION public.sec_corporate_action_guard() FROM PUBLIC,anon,authenticated;

INSERT INTO public.sec_corporate_action_evidence(
 asset_id,action_type,action_effective_date,numerator,denominator,
 evidence_filing_id,original_reference)
SELECT a.id,'forward_stock_split','2024-07-12',10,1,f.id,
 'FY2024 Form 10-K, Note 1 Basis of Presentation and Note 11 Stockholders Equity: 10-for-one stock split and retrospective adjustment'
FROM public.assets a JOIN public.fundamental_filings f ON f.asset_id=a.id
 JOIN public.data_sources d ON d.id=f.source_id AND d.provider_code='sec_edgar'
WHERE a.symbol='AVGO' AND a.active AND f.period_end='2024-11-03'
 AND f.source_filing_id='0001730168-24-000139'
ON CONFLICT(asset_id,action_type,action_effective_date,evidence_filing_id) DO NOTHING;

INSERT INTO public.sec_issuer_reconciliations(
 asset_id,reported_period_end,metric_basis,unit,reported_value,
 original_period_filing_id,evidence_filing_id,evidence_kind,evidence_line_label,
 statement_location,comparison_caveat)
SELECT a.id,'2023-10-29','diluted_shares_split_adjusted_comparative','shares',
 4272000000,oldf.id,newf.id,'later_10k_comparative',
 'Weighted-average shares outstanding - diluted (FY2023 comparative)',
 'FY2024 10-K Note 8, Net Income Per Share',
 'FY2023 original reports 427m diluted weighted average shares; FY2024 source retrospectively reports 4,272m post-10-for-one split. Do not backdate later comparative to original FY2023 or multiply rounded 427m into false precision.'
FROM public.assets a JOIN public.fundamental_filings oldf ON oldf.asset_id=a.id
 JOIN public.fundamental_filings newf ON newf.asset_id=a.id
 JOIN public.data_sources d ON d.id=newf.source_id AND d.provider_code='sec_edgar'
WHERE a.symbol='AVGO' AND a.active
 AND oldf.period_end='2023-10-29' AND oldf.source_filing_id='0001730168-23-000096'
 AND newf.period_end='2024-11-03' AND newf.source_filing_id='0001730168-24-000139'
 AND EXISTS(SELECT 1 FROM public.sec_corporate_action_evidence x WHERE
  x.asset_id=a.id AND x.evidence_filing_id=newf.id
  AND x.action_effective_date='2024-07-12' AND x.numerator=10 AND x.denominator=1)
ON CONFLICT(asset_id,reported_period_end,metric_basis,evidence_filing_id) DO NOTHING;
