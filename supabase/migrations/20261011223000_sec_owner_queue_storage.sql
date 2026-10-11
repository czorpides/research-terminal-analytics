-- Phase 2H. Storage and atomic lease protocol ONLY; activation of
-- owner-approved background worker is a separate, explicit release step.
-- Nothing in this migration schedules a provider request.
CREATE TABLE IF NOT EXISTS public.sec_queue_waves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  mode text NOT NULL DEFAULT 'expand' CHECK (mode='expand'),
  state text NOT NULL DEFAULT 'queued' CHECK (state IN
    ('queued','running','paused','completed','completed_with_issues','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.sec_queue_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wave_id uuid NOT NULL REFERENCES public.sec_queue_waves(id),
  asset_id uuid NOT NULL REFERENCES public.assets(id),
  symbol text NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal BETWEEN 1 AND 10),
  state text NOT NULL DEFAULT 'queued' CHECK (state IN
    ('queued','running','retry_wait','succeeded','partial','failed','cancelled')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  leased_until timestamptz,
  new_filings integer NOT NULL DEFAULT 0 CHECK (new_filings>=0),
  new_facts integer NOT NULL DEFAULT 0 CHECK (new_facts>=0),
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(wave_id,asset_id), UNIQUE(wave_id,ordinal)
);
-- Prevent the same issuer being approved concurrently in multiple waves.
CREATE UNIQUE INDEX IF NOT EXISTS sec_queue_active_asset_one
  ON public.sec_queue_jobs(asset_id)
  WHERE state IN ('queued','running','retry_wait');
CREATE INDEX IF NOT EXISTS sec_queue_jobs_pending
  ON public.sec_queue_jobs(available_at,created_at)
  WHERE state IN ('queued','running','retry_wait');
CREATE INDEX IF NOT EXISTS sec_queue_jobs_wave_order
  ON public.sec_queue_jobs(wave_id,ordinal);
ALTER TABLE public.sec_queue_waves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sec_queue_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sec_queue_waves,public.sec_queue_jobs FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.sec_queue_waves,public.sec_queue_jobs TO service_role;

-- Credential is generated inside production; never hard-coded in GitHub, UI,
-- migration files, or environment logs. Cron uses it only over HTTPS.
CREATE TABLE IF NOT EXISTS public.sec_queue_worker_auth (
  name text PRIMARY KEY CHECK (name='sec-queue'),
  token text NOT NULL CHECK (length(token)>=48)
);
ALTER TABLE public.sec_queue_worker_auth ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sec_queue_worker_auth FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.sec_queue_worker_auth TO service_role;
INSERT INTO public.sec_queue_worker_auth(name,token)
VALUES ('sec-queue',encode(gen_random_bytes(32),'hex'))
ON CONFLICT(name) DO NOTHING;

-- Server-side plan recomputation precedes this call, but SQL also validates
-- source identity, original SEC coverage, source QA and active queue conflicts
-- in the same transaction. Only service_role can invoke it.
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
     p_asset_ids @> ARRAY[NULL::uuid] THEN
    RAISE EXCEPTION 'Invalid bounded owner-approved SEC queue';
  END IF;
  PERFORM pg_advisory_xact_lock(2026,2081);
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

CREATE OR REPLACE FUNCTION public.sec_queue_claim()
RETURNS TABLE(job_id uuid,asset_id uuid,symbol text,lease_token uuid,
  wave_id uuid,attempt integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_job uuid;
BEGIN
  -- Serialize simultaneous cron deliveries during the short DB transaction.
  IF NOT pg_try_advisory_xact_lock(2026,2082) THEN RETURN; END IF;

  -- A timed-out third attempt can never remain leased indefinitely.
  UPDATE public.sec_queue_jobs j
    SET state='failed',error=coalesce(j.error,'')||' Worker lease expired after 3 attempts',
        finished_at=now(),lease_token=NULL,leased_until=NULL
    WHERE j.state='running' AND j.leased_until < now() AND j.attempts>=3;
  UPDATE public.sec_queue_waves w SET
    state=CASE WHEN EXISTS(SELECT 1 FROM public.sec_queue_jobs j
      WHERE j.wave_id=w.id AND j.state IN ('partial','failed'))
      THEN 'completed_with_issues' ELSE 'completed' END,
    finished_at=now(),updated_at=now()
    WHERE w.state IN ('queued','running') AND
      NOT EXISTS(SELECT 1 FROM public.sec_queue_jobs j WHERE j.wave_id=w.id
        AND j.state IN ('queued','running','retry_wait'));

  -- SEC is global rate limited. One unexpired active lease per project.
  IF EXISTS(SELECT 1 FROM public.sec_queue_jobs j
    WHERE j.state='running' AND j.leased_until>=now()) THEN RETURN; END IF;
  SELECT j.id INTO v_job FROM public.sec_queue_jobs j
    JOIN public.sec_queue_waves w ON w.id=j.wave_id
    WHERE w.state IN ('queued','running') AND (
      (j.state IN ('queued','retry_wait') AND j.available_at<=now()) OR
      (j.state='running' AND j.leased_until<now() AND j.attempts<3)
    )
    ORDER BY w.created_at,j.ordinal
    FOR UPDATE OF j SKIP LOCKED LIMIT 1;
  IF v_job IS NULL THEN RETURN; END IF;

  RETURN QUERY
    UPDATE public.sec_queue_jobs j SET state='running',
      attempts=j.attempts+1,lease_token=gen_random_uuid(),
      leased_until=now()+interval '5 minutes',
      started_at=coalesce(j.started_at,now()),
      error=NULL
    WHERE j.id=v_job
    RETURNING j.id,j.asset_id,j.symbol,j.lease_token,j.wave_id,j.attempts;
  UPDATE public.sec_queue_waves w SET state='running',updated_at=now()
    WHERE w.id=(SELECT j.wave_id FROM public.sec_queue_jobs j WHERE j.id=v_job)
      AND w.state='queued';
END;
$$;

CREATE OR REPLACE FUNCTION public.sec_queue_complete(
  p_job_id uuid,p_lease_token uuid,p_outcome text,
  p_filings integer DEFAULT 0,p_facts integer DEFAULT 0,
  p_error text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_job public.sec_queue_jobs%ROWTYPE;
DECLARE v_status text;
BEGIN
  IF p_job_id IS NULL OR p_lease_token IS NULL OR
     p_outcome NOT IN ('succeeded','partial','failed','retryable') OR
     p_filings IS NULL OR p_facts IS NULL OR
     p_filings<0 OR p_facts<0 THEN RAISE EXCEPTION 'Invalid SEC queue completion'; END IF;
  SELECT * INTO v_job FROM public.sec_queue_jobs
    WHERE id=p_job_id FOR UPDATE;
  IF NOT FOUND OR v_job.state<>'running' OR
     v_job.lease_token IS DISTINCT FROM p_lease_token OR
     v_job.leased_until<now() THEN
    RAISE EXCEPTION 'Stale or invalid SEC worker lease';
  END IF;
  v_status:=CASE WHEN p_outcome='retryable' THEN
    CASE WHEN v_job.attempts<3 THEN 'retry_wait' ELSE 'failed' END
    ELSE p_outcome END;
  UPDATE public.sec_queue_jobs SET state=v_status,
    new_filings=public.sec_queue_jobs.new_filings+p_filings,
    new_facts=public.sec_queue_jobs.new_facts+p_facts,
    available_at=CASE WHEN v_status='retry_wait' THEN
      now()+make_interval(mins=>2*(2^(v_job.attempts-1))::integer)
      ELSE available_at END,
    error=left(p_error,600),lease_token=NULL,leased_until=NULL,
    finished_at=CASE WHEN v_status='retry_wait' THEN NULL ELSE now() END
  WHERE id=p_job_id;
  UPDATE public.sec_queue_waves w SET
    state=CASE WHEN w.state='cancelled' THEN 'cancelled'
      WHEN EXISTS(SELECT 1 FROM public.sec_queue_jobs j WHERE j.wave_id=w.id
        AND j.state IN ('queued','running','retry_wait')) THEN 'running'
      WHEN EXISTS(SELECT 1 FROM public.sec_queue_jobs j WHERE j.wave_id=w.id
        AND j.state IN ('partial','failed','cancelled'))
        THEN 'completed_with_issues'
      ELSE 'completed' END,
    updated_at=now(),
    finished_at=CASE WHEN NOT EXISTS(SELECT 1 FROM public.sec_queue_jobs j
      WHERE j.wave_id=w.id AND j.state IN ('queued','running','retry_wait'))
      THEN now() ELSE NULL END
    WHERE w.id=v_job.wave_id AND w.state<>'paused';
  RETURN v_status;
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
  UPDATE public.sec_queue_waves
    SET state=CASE WHEN p_action='pause' THEN 'paused' ELSE 'running' END,
        updated_at=now() WHERE id=p_wave_id;
  RETURN CASE WHEN p_action='pause' THEN 'paused' ELSE 'running' END;
END;
$$;

REVOKE ALL ON FUNCTION public.sec_queue_enqueue(uuid,uuid[]) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sec_queue_claim() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sec_queue_complete(uuid,uuid,text,integer,integer,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sec_queue_control(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sec_queue_enqueue(uuid,uuid[]),
  public.sec_queue_claim(),
  public.sec_queue_complete(uuid,uuid,text,integer,integer,text),
  public.sec_queue_control(uuid,uuid,text) TO service_role;
