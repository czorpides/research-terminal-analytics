-- An abandoned network request must not remain "running" indefinitely.
-- The production fundamental batch is bounded; >6 hours cannot represent
-- a legitimate ongoing batch. Preserve original ingestion evidence untouched.
UPDATE public.ingestion_runs
SET status='failed',
    finished_at=now(),
    error=COALESCE(
      NULLIF(error,''),
      'Interrupted before completion; reconciled after six hours without a terminal result.'
    )
WHERE data_category::text='fundamentals'
  AND status::text='running'
  AND finished_at IS NULL
  AND started_at < now()-interval '6 hours';
