-- Point-in-time analyst expectation evidence for the Swing Trade conviction layer.
--
-- Values are never inferred by AI. Structured provider payloads are stored with
-- provenance and validation metadata. A new row is created only when the
-- provider payload changes; last_verified_at may advance when an identical
-- payload is successfully re-confirmed. Quarantined snapshots remain available
-- for audit but are never allowed to influence conviction scoring.

CREATE TABLE IF NOT EXISTS public.analyst_expectation_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  provider_code text NOT NULL,
  source_tier text NOT NULL,
  source_endpoints jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_hash text NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  last_verified_at timestamptz NOT NULL DEFAULT now(),
  ingested_at timestamptz NOT NULL DEFAULT now(),
  listing_currency text,
  reference_price numeric,

  fy1_date date,
  fy1_eps_avg numeric,
  fy1_eps_low numeric,
  fy1_eps_high numeric,
  fy1_eps_analysts integer,
  fy1_revenue_avg numeric,
  fy1_revenue_low numeric,
  fy1_revenue_high numeric,
  fy1_revenue_analysts integer,

  fy2_date date,
  fy2_eps_avg numeric,
  fy2_eps_low numeric,
  fy2_eps_high numeric,
  fy2_eps_analysts integer,
  fy2_revenue_avg numeric,
  fy2_revenue_low numeric,
  fy2_revenue_high numeric,
  fy2_revenue_analysts integer,

  target_consensus numeric,
  target_median numeric,
  target_high numeric,
  target_low numeric,
  target_last_month_avg numeric,
  target_last_month_count integer,
  target_last_quarter_avg numeric,
  target_last_quarter_count integer,
  target_last_year_avg numeric,
  target_last_year_count integer,
  target_publishers jsonb NOT NULL DEFAULT '[]'::jsonb,

  validation_state text NOT NULL DEFAULT 'accepted',
  validation_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence numeric NOT NULL DEFAULT 0,
  raw_estimates jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_target_consensus jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_target_summary jsonb NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT analyst_expectation_provider_valid CHECK (provider_code <> ''),
  CONSTRAINT analyst_expectation_state_valid CHECK (validation_state IN ('accepted', 'quarantined')),
  CONSTRAINT analyst_expectation_confidence_valid CHECK (confidence BETWEEN 0 AND 100),
  CONSTRAINT analyst_expectation_reference_price_valid CHECK (reference_price IS NULL OR reference_price > 0),
  CONSTRAINT analyst_expectation_counts_valid CHECK (
    (fy1_eps_analysts IS NULL OR fy1_eps_analysts BETWEEN 0 AND 250) AND
    (fy1_revenue_analysts IS NULL OR fy1_revenue_analysts BETWEEN 0 AND 250) AND
    (fy2_eps_analysts IS NULL OR fy2_eps_analysts BETWEEN 0 AND 250) AND
    (fy2_revenue_analysts IS NULL OR fy2_revenue_analysts BETWEEN 0 AND 250) AND
    (target_last_month_count IS NULL OR target_last_month_count BETWEEN 0 AND 1000) AND
    (target_last_quarter_count IS NULL OR target_last_quarter_count BETWEEN 0 AND 2500) AND
    (target_last_year_count IS NULL OR target_last_year_count BETWEEN 0 AND 10000)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS analyst_expectation_snapshot_hash_key
  ON public.analyst_expectation_snapshots(asset_id, provider_code, source_hash);

CREATE INDEX IF NOT EXISTS analyst_expectation_snapshot_asset_idx
  ON public.analyst_expectation_snapshots(asset_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS analyst_expectation_snapshot_verified_idx
  ON public.analyst_expectation_snapshots(validation_state, last_verified_at DESC);

ALTER TABLE public.analyst_expectation_snapshots ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.analyst_expectation_snapshots IS
  'Immutable point-in-time analyst EPS/revenue and price-target evidence. Identical payloads only advance last_verified_at; quarantined rows are audit-only.';
COMMENT ON COLUMN public.analyst_expectation_snapshots.source_hash IS
  'SHA-256 of the normalized structured provider payload used to prevent duplicate vintages.';
COMMENT ON COLUMN public.analyst_expectation_snapshots.validation_state IS
  'accepted rows may enter deterministic scoring; quarantined rows remain visible but contribute zero conviction.';
COMMENT ON COLUMN public.analyst_expectation_snapshots.last_verified_at IS
  'Most recent successful provider confirmation of this exact payload, used for freshness gating.';
