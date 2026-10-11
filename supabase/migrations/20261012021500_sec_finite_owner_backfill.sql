-- Phase 2I. One-time owner-approved finite expansion of the existing
-- 100-name SEC pilot, NOT a scheduled new issuer discovery system.
-- This migration does not enqueue any jobs or make provider requests.
ALTER TABLE public.sec_queue_waves
  DROP CONSTRAINT IF EXISTS sec_queue_waves_mode_check;
ALTER TABLE public.sec_queue_waves
  ADD CONSTRAINT sec_queue_waves_mode_check
  CHECK (mode IN ('expand','finite_backfill'));
ALTER TABLE public.sec_queue_jobs
  DROP CONSTRAINT IF EXISTS sec_queue_jobs_ordinal_check;
ALTER TABLE public.sec_queue_jobs
  ADD CONSTRAINT sec_queue_jobs_ordinal_check
  CHECK (ordinal BETWEEN 1 AND 100);

CREATE OR REPLACE FUNCTION public.sec_queue_enqueue_finite_backfill(
 p_owner_id uuid, p_asset_ids uuid[]
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE
 v_wave uuid;
 v_source uuid;
 v_id uuid;
 v_pos integer;
 v_symbol text;
BEGIN
 IF p_owner_id IS NULL OR p_asset_ids IS NULL OR
    coalesce(array_length(p_asset_ids,1),0) NOT BETWEEN 1 AND 100 OR
    EXISTS (SELECT 1 FROM unnest(p_asset_ids) AS u(id) WHERE u.id IS NULL) THEN
   RAISE EXCEPTION 'Invalid finite SEC backfill';
 END IF;
 PERFORM pg_advisory_xact_lock(2026,2081);
 IF EXISTS(SELECT 1 FROM public.sec_queue_waves
     WHERE state IN ('queued','running','paused')) THEN
   RAISE EXCEPTION 'An active SEC wave must finish first';
 END IF;
 -- The owner may run this one-time campaign once; cancellation permits an
 -- explicitly reapproved new snapshot of still-untouched issuers.
 IF EXISTS(SELECT 1 FROM public.sec_queue_waves
     WHERE owner_id=p_owner_id AND mode='finite_backfill'
       AND state<>'cancelled') THEN
   RAISE EXCEPTION 'Finite SEC backfill already approved for this owner';
 END IF;
 IF (SELECT count(DISTINCT id) FROM unnest(p_asset_ids) AS t(id))
      <> array_length(p_asset_ids,1) THEN
   RAISE EXCEPTION 'Duplicate SEC issuer in finite backfill';
 END IF;
 SELECT id INTO STRICT v_source FROM public.data_sources
   WHERE provider_code='sec_edgar' AND active=true;
 FOR v_pos IN 1..array_length(p_asset_ids,1) LOOP
   v_id:=p_asset_ids[v_pos];
   SELECT a.symbol INTO v_symbol FROM public.assets a
     WHERE a.id=v_id AND a.active AND a.asset_class='equity'
       AND a.currency='USD' AND a.exchange IN ('XNAS','XNYS','XASE');
   IF v_symbol IS NULL OR
     (SELECT count(*) FROM public.assets a
       WHERE a.active AND a.asset_class='equity'
         AND a.symbol=v_symbol AND a.currency='USD'
         AND a.exchange IN ('XNAS','XNYS','XASE'))<>1 THEN
     RAISE EXCEPTION 'Missing or ambiguous SEC registrant equity';
   END IF;
   IF EXISTS(SELECT 1 FROM public.fundamental_filings f
       WHERE f.asset_id=v_id AND f.source_id=v_source) THEN
     RAISE EXCEPTION 'Only previously untouched SEC issuers can be approved';
   END IF;
   IF EXISTS(SELECT 1 FROM public.sec_queue_jobs j
       WHERE j.asset_id=v_id AND j.state IN ('queued','running','retry_wait')) THEN
     RAISE EXCEPTION 'SEC asset is already in a background queue';
   END IF;
   IF EXISTS(SELECT 1 FROM public.sec_original_10k_integrity q
       WHERE q.asset_id=v_id AND (q.invalid_metadata_filings>0 OR
         q.empty_filings>0 OR q.duplicate_metrics>0 OR
         q.inconsistent_fact_rows>0)) THEN
     RAISE EXCEPTION 'SEC asset has existing QA warnings';
   END IF;
 END LOOP;
 INSERT INTO public.sec_queue_waves(owner_id,mode)
   VALUES(p_owner_id,'finite_backfill') RETURNING id INTO v_wave;
 FOR v_pos IN 1..array_length(p_asset_ids,1) LOOP
   INSERT INTO public.sec_queue_jobs(wave_id,asset_id,symbol,ordinal)
   SELECT v_wave,a.id,a.symbol,v_pos FROM public.assets a
   WHERE a.id=p_asset_ids[v_pos];
 END LOOP;
 RETURN v_wave;
END;
$$;
REVOKE ALL ON FUNCTION public.sec_queue_enqueue_finite_backfill(uuid,uuid[])
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sec_queue_enqueue_finite_backfill(uuid,uuid[])
  TO service_role;
COMMENT ON FUNCTION public.sec_queue_enqueue_finite_backfill(uuid,uuid[]) IS
'Explicit owner-approved snapshot only, at most the curated 100 issuers. Does not schedule, discover or infer any future work.';
