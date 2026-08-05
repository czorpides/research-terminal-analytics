-- Maintain corporate-action-correct adjusted closes for Opportunity Radar.
-- EODHD's single-symbol history costs one API unit regardless of history depth,
-- so reconciling all ~3,000 managed equities weekly is inexpensive (~3,000
-- units) relative to the verified 100,000-unit daily entitlement.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE IF NOT EXISTS public.opportunity_adjusted_history_reconciliation (
  asset_id uuid PRIMARY KEY REFERENCES public.assets(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'complete', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  rows_upserted integer NOT NULL DEFAULT 0,
  last_started_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS opportunity_adjusted_history_status_idx
  ON public.opportunity_adjusted_history_reconciliation(status, updated_at, attempts);

ALTER TABLE public.opportunity_adjusted_history_reconciliation ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.opportunity_adjusted_history_reconciliation TO authenticated;
GRANT ALL ON public.opportunity_adjusted_history_reconciliation TO service_role;

DROP POLICY IF EXISTS "adjusted history reconciliation readable"
  ON public.opportunity_adjusted_history_reconciliation;
CREATE POLICY "adjusted history reconciliation readable"
  ON public.opportunity_adjusted_history_reconciliation
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.opportunity_adjusted_history_reconciliation (asset_id, status, attempts, updated_at)
SELECT a.id, 'pending', 0, now()
FROM public.assets a
WHERE a.active = true AND a.asset_class = 'equity'
ON CONFLICT (asset_id) DO NOTHING;

-- Keep the reconciliation queue aligned with managed-universe membership.
CREATE OR REPLACE FUNCTION public.sync_opportunity_adjusted_history_queue_for_asset()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.active = true AND NEW.asset_class = 'equity' THEN
    INSERT INTO public.opportunity_adjusted_history_reconciliation (
      asset_id, status, attempts, updated_at
    ) VALUES (NEW.id, 'pending', 0, now())
    ON CONFLICT (asset_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assets_sync_opportunity_adjusted_history_queue ON public.assets;
CREATE TRIGGER assets_sync_opportunity_adjusted_history_queue
AFTER INSERT OR UPDATE OF active, asset_class ON public.assets
FOR EACH ROW EXECUTE FUNCTION public.sync_opportunity_adjusted_history_queue_for_asset();

-- Claim at most one bounded batch. The function is single-flight and refuses to
-- compete with the primary EODHD historical bootstrap. A dead worker is
-- recovered after 30 minutes; failed rows may retry up to three times per
-- weekly cycle.
CREATE OR REPLACE FUNCTION public.claim_opportunity_adjusted_history_batch(
  p_limit integer DEFAULT 50
)
RETURNS TABLE(asset_id uuid, symbol text, exchange text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
BEGIN
  UPDATE public.opportunity_adjusted_history_reconciliation
  SET status = 'pending',
      last_error = coalesce(last_error, 'Recovered stale running claim after 30 minutes.'),
      updated_at = now()
  WHERE status = 'running'
    AND last_started_at < now() - interval '30 minutes';

  -- Never use single-symbol reconciliation while the authoritative exchange-
  -- bulk history bootstrap is still running.
  IF EXISTS (
    SELECT 1 FROM public.equity_eod_backfill_queue
    WHERE status IN ('pending', 'running')
  ) THEN
    RETURN;
  END IF;

  IF (SELECT count(*) FROM public.assets WHERE active = true AND asset_class = 'equity') < 2950 THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.opportunity_adjusted_history_reconciliation
    WHERE status = 'running'
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT q.asset_id
    FROM public.opportunity_adjusted_history_reconciliation q
    JOIN public.assets a ON a.id = q.asset_id
    WHERE a.active = true
      AND a.asset_class = 'equity'
      AND (
        q.status = 'pending'
        OR (q.status = 'failed' AND q.attempts < 3)
      )
    ORDER BY
      CASE WHEN q.last_success_at IS NULL THEN 0 ELSE 1 END,
      q.last_success_at ASC NULLS FIRST,
      q.updated_at ASC,
      a.symbol ASC,
      a.exchange ASC
    FOR UPDATE OF q SKIP LOCKED
    LIMIT v_limit
  ), claimed AS (
    UPDATE public.opportunity_adjusted_history_reconciliation q
    SET status = 'running',
        attempts = q.attempts + 1,
        last_started_at = now(),
        last_error = NULL,
        updated_at = now()
    FROM candidates c
    WHERE q.asset_id = c.asset_id
    RETURNING q.asset_id
  )
  SELECT a.id, a.symbol, a.exchange
  FROM claimed c
  JOIN public.assets a ON a.id = c.asset_id
  ORDER BY a.symbol, a.exchange;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_opportunity_adjusted_history_batch(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_opportunity_adjusted_history_batch(integer)
  TO service_role;

-- Re-open successfully reconciled active assets once per week. Failed rows also
-- get a fresh three-attempt budget. Initial seed rows remain pending until the
-- main 252-session bootstrap finishes, at which point the worker can start.
DO $$
DECLARE
  existing_job RECORD;
BEGIN
  FOR existing_job IN
    SELECT jobid FROM cron.job
    WHERE jobname IN (
      'opportunity-adjusted-history-weekly-reset',
      'opportunity-adjusted-history-reconcile'
    )
  LOOP
    PERFORM cron.unschedule(existing_job.jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'opportunity-adjusted-history-weekly-reset',
  '5 0 * * 0',
  $cron$
  INSERT INTO public.opportunity_adjusted_history_reconciliation (
    asset_id, status, attempts, rows_upserted, last_error, updated_at
  )
  SELECT a.id, 'pending', 0, 0, NULL, now()
  FROM public.assets a
  WHERE a.active = true AND a.asset_class = 'equity'
  ON CONFLICT (asset_id) DO UPDATE SET
    status = CASE
      WHEN public.opportunity_adjusted_history_reconciliation.status = 'running'
        THEN 'running'
      ELSE 'pending'
    END,
    attempts = CASE
      WHEN public.opportunity_adjusted_history_reconciliation.status = 'running'
        THEN public.opportunity_adjusted_history_reconciliation.attempts
      ELSE 0
    END,
    rows_upserted = CASE
      WHEN public.opportunity_adjusted_history_reconciliation.status = 'running'
        THEN public.opportunity_adjusted_history_reconciliation.rows_upserted
      ELSE 0
    END,
    last_error = CASE
      WHEN public.opportunity_adjusted_history_reconciliation.status = 'running'
        THEN public.opportunity_adjusted_history_reconciliation.last_error
      ELSE NULL
    END,
    updated_at = now();
  $cron$
);

-- 50 assets every five minutes allows a 3,000-name weekly pass to finish in
-- roughly five hours. The SQL guard avoids even dispatching HTTP work while the
-- primary historical bootstrap is incomplete or another batch is still active.
SELECT cron.schedule(
  'opportunity-adjusted-history-reconcile',
  '*/5 0-8 * * *',
  $cron$
  SELECT CASE
    WHEN (
      SELECT count(*) FROM public.assets
      WHERE active = true AND asset_class = 'equity'
    ) >= 2950
    AND NOT EXISTS (
      SELECT 1 FROM public.equity_eod_backfill_queue
      WHERE status IN ('pending', 'running')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.opportunity_adjusted_history_reconciliation
      WHERE status = 'running'
        AND last_started_at >= now() - interval '30 minutes'
    )
    AND EXISTS (
      SELECT 1
      FROM public.opportunity_adjusted_history_reconciliation q
      JOIN public.assets a ON a.id = q.asset_id
      WHERE a.active = true
        AND a.asset_class = 'equity'
        AND (q.status = 'pending' OR (q.status = 'failed' AND q.attempts < 3))
    )
    THEN net.http_post(
      url := 'https://project--d87a6acb-6341-458d-8dd2-3a8d0894569f.lovable.app/api/public/ingest/stooq?adjustedReconcile=1&limit=50',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0ZndvamlteHV4d214amNvbHp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1NzEwMzIsImV4cCI6MjEwMDE0NzAzMn0.ysFIVxKkUIZEdma74PYlINR-ZfI9BU_J4beHMB0Xf80'
      ),
      body := '{"source":"cron","job":"opportunity-adjusted-history-reconcile","limit":50}'::jsonb,
      timeout_milliseconds := 300000
    )
    ELSE NULL::bigint
  END AS request_id;
  $cron$
);
