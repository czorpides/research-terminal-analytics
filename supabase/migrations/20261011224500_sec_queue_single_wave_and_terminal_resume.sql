-- Phase 2H follow-up: one active owner-approved wave globally; correctly
-- finish a paused wave once its final in-flight lease has returned.
-- Additive function replacements only: no automatic work or data changes.
CREATE OR REPLACE FUNCTION public.sec_queue_enqueue(
  p_owner_id uuid, p_asset_ids uuid[]
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE
  v_wave uuid;
  v_src uuid;
  v_id uuid;
  v_index integer;
  v_symbol text;
BEGIN
  IF p_owner_id IS NULL OR p_asset_ids IS NULL OR
     coalesce(array_length(p_asset_ids,1),0) NOT BETWEEN 1 AND 10 OR
     EXISTS(SELECT 1 FROM unnest(p_asset_ids) AS u(id) WHERE u.id IS NULL) THEN
    RAISE EXCEPTION 'Invalid bounded owner-approved SEC queue';
  END IF;
  PERFORM pg_advisory_xact_lock(2026,2081);
  -- One active owner wave at a time, including paused waves.
  IF EXISTS(SELECT 1 FROM public.sec_queue_waves w
    WHERE w.state IN ('queued','running','paused')) THEN
    RAISE EXCEPTION 'Finish or cancel existing SEC queue wave before starting another';
  END IF;
  IF (SELECT count(DISTINCT x) FROM unnest(p_asset_ids) x)
      <> array_length(p_asset_ids,1) THEN
    RAISE EXCEPTION 'Duplicate SEC issuer in wave';
  END IF;
  SELECT id INTO STRICT v_src FROM public.data_sources
    WHERE provider_code='sec_edgar' AND active=true;
  FOR v_index IN 1..array_length(p_asset_ids,1) LOOP
    v_id := p_asset_ids[v_index];
    SELECT a.symbol INTO v_symbol FROM public.assets a WHERE
      a.id=v_id AND a.active AND a.asset_class='equity'
      AND a.currency='USD' AND a.exchange IN ('XNAS','XNYS','XASE');
    IF v_symbol IS NULL OR
       (SELECT count(*) FROM public.assets a WHERE
         a.symbol=v_symbol AND a.active AND a.asset_class='equity'
         AND a.currency='USD' AND a.exchange IN ('XNAS','XNYS','XASE'))<>1 THEN
      RAISE EXCEPTION 'Ineligible or ambiguous SEC identity';
    END IF;
    IF EXISTS(SELECT 1 FROM public.fundamental_filings f
      WHERE f.asset_id=v_id AND f.source_id=v_src) THEN
      RAISE EXCEPTION 'Queue is for untouched SEC issuers only';
    END IF;
    IF EXISTS(SELECT 1 FROM public.sec_queue_jobs j
      WHERE j.asset_id=v_id AND j.state IN ('queued','running','retry_wait')) THEN
      RAISE EXCEPTION 'SEC issuer already queued';
    END IF;
    IF EXISTS (SELECT 1 FROM public.sec_original_10k_integrity q
      WHERE q.asset_id=v_id AND
        (q.invalid_metadata_filings>0 OR q.empty_filings>0 OR
         q.duplicate_metrics>0 OR q.inconsistent_fact_rows>0)) THEN
      RAISE EXCEPTION 'SEC issuer requires structural review';
    END IF;
  END LOOP;
  INSERT INTO public.sec_queue_waves(owner_id) VALUES (p_owner_id)
    RETURNING id INTO v_wave;
  FOR v_index IN 1..array_length(p_asset_ids,1) LOOP
    INSERT INTO public.sec_queue_jobs(wave_id,asset_id,symbol,ordinal)
    SELECT v_wave,a.id,a.symbol,v_index FROM public.assets a
    WHERE a.id=p_asset_ids[v_index];
  END LOOP;
  RETURN v_wave;
END;
$$;


CREATE OR REPLACE FUNCTION public.sec_queue_control(
 p_wave_id uuid,p_owner_id uuid,p_action text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_state text;
BEGIN
  IF p_action NOT IN ('pause','resume','cancel') THEN
    RAISE EXCEPTION 'Invalid SEC queue action';
  END IF;
  SELECT state INTO v_state FROM public.sec_queue_waves
    WHERE id=p_wave_id AND owner_id=p_owner_id FOR UPDATE;
  IF v_state IS NULL OR v_state IN
    ('completed','completed_with_issues','cancelled') THEN
    RAISE EXCEPTION 'SEC queue wave not adjustable';
  END IF;
  IF p_action='resume' AND v_state<>'paused' THEN
    RAISE EXCEPTION 'SEC wave is not paused';
  END IF;
  IF p_action='pause' AND v_state='paused' THEN RETURN 'paused'; END IF;
  IF p_action='cancel' THEN
    UPDATE public.sec_queue_jobs SET state='cancelled',
      finished_at=now() WHERE wave_id=p_wave_id AND
      state IN ('queued','retry_wait');
    UPDATE public.sec_queue_waves SET state='cancelled',
      updated_at=now(),finished_at=now() WHERE id=p_wave_id;
    RETURN 'cancelled';
  END IF;
  IF p_action='pause' THEN
    UPDATE public.sec_queue_waves SET state='paused',updated_at=now()
      WHERE id=p_wave_id;
    RETURN 'paused';
  END IF;
  -- A paused wave may have finished its last leased issuer while paused.
  -- Resuming must finalize it rather than leaving an unprocessable "running"
  -- wave with zero due jobs and no future cron dispatch.
  v_state:=CASE
    WHEN EXISTS(SELECT 1 FROM public.sec_queue_jobs j
      WHERE j.wave_id=p_wave_id AND
      j.state IN ('queued','running','retry_wait')) THEN 'running'
    WHEN EXISTS(SELECT 1 FROM public.sec_queue_jobs j
      WHERE j.wave_id=p_wave_id AND j.state IN ('partial','failed','cancelled'))
      THEN 'completed_with_issues'
    ELSE 'completed' END;
  UPDATE public.sec_queue_waves SET state=v_state,updated_at=now(),
    finished_at=CASE WHEN v_state IN ('completed','completed_with_issues')
      THEN now() ELSE NULL END WHERE id=p_wave_id;
  RETURN v_state;
END;
$$;

REVOKE ALL ON FUNCTION public.sec_queue_enqueue(uuid,uuid[]) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sec_queue_control(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sec_queue_enqueue(uuid,uuid[]),
  public.sec_queue_control(uuid,uuid,text) TO service_role;
