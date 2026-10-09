-- Phase 3: anticipatory hypotheses are NOT the observed catalyst_events ledger.
-- No guess, forecast probability, index constituent or event is seeded.
-- Service-role write only, point-in-time source evidence required.
CREATE TABLE IF NOT EXISTS public.catalyst_anticipations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hypothesis_key text NOT NULL UNIQUE CHECK (char_length(hypothesis_key) BETWEEN 8 AND 180),
  asset_id uuid NOT NULL REFERENCES public.assets(id),
  hypothesis_type text NOT NULL CHECK (hypothesis_type IN
    ('sp500_inclusion','nasdaq100_reconstitution','earnings_revision','government_award','fda_pdufa')),
  headline text NOT NULL CHECK (char_length(headline) BETWEEN 8 AND 500),
  source_name text NOT NULL CHECK (char_length(source_name) BETWEEN 2 AND 160),
  source_url text NOT NULL CHECK (source_url ~ '^https://[^[:space:]]+$'),
  source_published_at timestamptz NOT NULL,
  first_observed_at timestamptz NOT NULL DEFAULT now(),
  last_reviewed_at timestamptz NOT NULL DEFAULT now(),
  target_at timestamptz,
  expires_at timestamptz,
  status text NOT NULL DEFAULT 'monitoring' CHECK (status IN ('monitoring','dismissed','realized')),
  criteria jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(criteria) = 'array'),
  reviewer_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT anticipation_publication_before_capture CHECK (source_published_at <= first_observed_at + interval '2 seconds'),
  CONSTRAINT anticipation_review_after_capture CHECK (last_reviewed_at >= first_observed_at),
  CONSTRAINT anticipation_expiry_after_capture CHECK (expires_at IS NULL OR expires_at > first_observed_at)
);
CREATE INDEX IF NOT EXISTS idx_catalyst_anticipations_active
 ON public.catalyst_anticipations (last_reviewed_at DESC)
 WHERE status='monitoring';
CREATE INDEX IF NOT EXISTS idx_catalyst_anticipations_asset
 ON public.catalyst_anticipations (asset_id,last_reviewed_at DESC);
ALTER TABLE public.catalyst_anticipations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.catalyst_anticipations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.catalyst_anticipations TO service_role;
COMMENT ON TABLE public.catalyst_anticipations IS
 'Source-backed, unscored anticipatory research hypotheses; separately gated from realized company events. Neither eligibility nor an event probability is implied.';
