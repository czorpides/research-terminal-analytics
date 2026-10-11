-- Phase 2H worker activation is opt-in infrastructure only.
-- This repeats every minute solely to DISPATCH *owner-approved* pending
-- jobs. It never discovers, enqueues or scores equities on any schedule.
-- Do NOT apply before app version with /api/public/ingest/sec-queue-worker is live.
-- Authentication secret generated in production and never stored in Git.
DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='sec-owner-queue-tick') THEN
    PERFORM cron.unschedule('sec-owner-queue-tick');
  END IF;
END $$;

SELECT cron.schedule(
  'sec-owner-queue-tick','* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://research-terminal-analytics.lovable.app/api/public/ingest/sec-queue-worker',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'X-SEC-Queue-Token',credential.token
    ),
    body := '{"approved_jobs_only":true}'::jsonb,
    timeout_milliseconds := 290000
  ) AS request_id
  FROM public.sec_queue_worker_auth credential
  WHERE credential.name='sec-queue'
    AND EXISTS (
      SELECT 1 FROM public.sec_queue_jobs j
      JOIN public.sec_queue_waves w ON w.id=j.wave_id
      WHERE w.state IN ('queued','running')
        AND (
          (j.state IN ('queued','retry_wait') AND j.available_at<=now())
          OR (j.state='running' AND j.leased_until<now())
        )
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.sec_queue_jobs j
      WHERE j.state='running' AND j.leased_until>=now()
    );
  $cron$
);
