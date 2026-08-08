-- Genuine point-in-time valuation history for the Opportunity Radar.
--
-- This table stores provider-observed annual valuation metrics at their
-- historical fiscal dates. It is deliberately separate from `data_points`,
-- whose `as_of` field records when a current snapshot was ingested and must
-- not be reinterpreted as a 5-10 year valuation history.

CREATE TABLE public.historical_valuation_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES public.data_sources(id),
  metric_code text NOT NULL,
  period_end date NOT NULL,
  fiscal_year integer,
  value_num numeric NOT NULL,
  known_at timestamptz NOT NULL,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  raw jsonb,
  UNIQUE (asset_id, source_id, metric_code, period_end)
);

CREATE INDEX historical_valuation_metrics_lookup_idx
  ON public.historical_valuation_metrics(asset_id, metric_code, period_end DESC);

CREATE INDEX historical_valuation_metrics_period_idx
  ON public.historical_valuation_metrics(period_end DESC, metric_code);

GRANT SELECT ON public.historical_valuation_metrics TO authenticated;
GRANT ALL ON public.historical_valuation_metrics TO service_role;

ALTER TABLE public.historical_valuation_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "historical valuation metrics readable"
  ON public.historical_valuation_metrics
  FOR SELECT TO authenticated
  USING (true);
