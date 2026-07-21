
ALTER TABLE public.historical_events
  ADD COLUMN IF NOT EXISTS causes TEXT,
  ADD COLUMN IF NOT EXISTS mechanism TEXT,
  ADD COLUMN IF NOT EXISTS what_happened_next TEXT,
  ADD COLUMN IF NOT EXISTS key_takeaway TEXT,
  ADD COLUMN IF NOT EXISTS citations JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS narrative_status TEXT NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS narrative_verifier TEXT,
  ADD COLUMN IF NOT EXISTS narrative_confidence INT,
  ADD COLUMN IF NOT EXISTS narrative_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS narrative_issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS narrative_attempts INT NOT NULL DEFAULT 0;

ALTER TABLE public.historical_events
  DROP CONSTRAINT IF EXISTS narrative_status_check;
ALTER TABLE public.historical_events
  ADD CONSTRAINT narrative_status_check
  CHECK (narrative_status IN ('unverified','verified','needs_review'));
