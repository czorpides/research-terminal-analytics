-- Catalyst Intelligence v0.1: additive, source-auditable corporate event ledger.
-- Existing sector/macro catalysts and historical-event tables remain untouched.
-- No fabricated event data is seeded. Only server-side service_role may write.
CREATE TABLE IF NOT EXISTS public.catalyst_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE CHECK (char_length(event_key) BETWEEN 8 AND 180),
  asset_id uuid NOT NULL REFERENCES public.assets(id),
  event_type text NOT NULL CHECK (event_type IN
    ('index_inclusion','earnings_expectation','earnings_result','government_contract','political_statement')),
  headline text NOT NULL CHECK (char_length(headline) BETWEEN 8 AND 500),
  summary text NOT NULL DEFAULT '',
  direction text NOT NULL DEFAULT 'uncertain' CHECK (direction IN ('positive','negative','uncertain')),
  status text NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate','verified','rejected')),
  source_name text NOT NULL CHECK (char_length(source_name) BETWEEN 2 AND 160),
  source_url text NOT NULL CHECK (source_url ~ '^https://[^[:space:]]+$'),
  source_tier text NOT NULL CHECK (source_tier IN ('official','regulated','reputable','social')),
  source_published_at timestamptz NOT NULL,
  known_at timestamptz NOT NULL,
  effective_at timestamptz,
  expires_at timestamptz,
  materiality numeric(5,2) CHECK (materiality BETWEEN 0 AND 100),
  novelty numeric(5,2) CHECK (novelty BETWEEN 0 AND 100),
  evidence_confidence numeric(5,2) CHECK (evidence_confidence BETWEEN 0 AND 100),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  verification_note text,
  verified_at timestamptz,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT verified_requires_review CHECK (
    status <> 'verified' OR (
      verified_at IS NOT NULL AND char_length(coalesce(verification_note,'')) >= 12
    )
  ),
  CONSTRAINT known_after_published CHECK (known_at >= source_published_at - interval '2 seconds')
);
CREATE INDEX IF NOT EXISTS idx_catalyst_events_verified_latest
 ON public.catalyst_events (known_at DESC) WHERE status='verified';
CREATE INDEX IF NOT EXISTS idx_catalyst_events_asset_history
 ON public.catalyst_events (asset_id,known_at DESC);
CREATE INDEX IF NOT EXISTS idx_catalyst_events_review_queue
 ON public.catalyst_events (ingested_at DESC) WHERE status='candidate';
ALTER TABLE public.catalyst_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.catalyst_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.catalyst_events TO service_role;
COMMENT ON TABLE public.catalyst_events IS
 'Point-in-time verified catalyst feed for Swing and Opportunity research; no anonymous writes. Corporate events are distinct from historical macro event_instances.';
