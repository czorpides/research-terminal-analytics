CREATE TABLE public.fundamental_filings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES public.data_sources(id),
  source_filing_id text NOT NULL,
  content_hash text NOT NULL,
  period_end date NOT NULL,
  fiscal_year integer,
  fiscal_period text NOT NULL CHECK (fiscal_period IN ('FY', 'Q1', 'Q2', 'Q3', 'Q4')),
  published_at timestamptz,
  known_at timestamptz NOT NULL,
  reported_currency text,
  revision_no integer NOT NULL DEFAULT 1 CHECK (revision_no > 0),
  is_restatement boolean NOT NULL DEFAULT false,
  supersedes_filing_id uuid REFERENCES public.fundamental_filings(id),
  ingested_at timestamptz NOT NULL DEFAULT now(),
  raw jsonb,
  UNIQUE (asset_id, source_id, source_filing_id, content_hash),
  UNIQUE (asset_id, source_id, period_end, fiscal_period, revision_no)
);
CREATE INDEX fundamental_filings_latest_idx
  ON public.fundamental_filings(asset_id, fiscal_period, period_end DESC, known_at DESC);
CREATE TABLE public.fundamental_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filing_id uuid NOT NULL REFERENCES public.fundamental_filings(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES public.data_sources(id),
  metric_code text NOT NULL,
  value_num numeric NOT NULL,
  unit text,
  period_end date NOT NULL,
  known_at timestamptz NOT NULL,
  revision_no integer NOT NULL CHECK (revision_no > 0),
  is_restatement boolean NOT NULL DEFAULT false,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  raw jsonb,
  UNIQUE (filing_id, metric_code)
);
CREATE INDEX fundamental_facts_lookup_idx
  ON public.fundamental_facts(asset_id, metric_code, period_end DESC, known_at DESC);
GRANT SELECT ON public.fundamental_filings, public.fundamental_facts TO authenticated;
GRANT ALL ON public.fundamental_filings, public.fundamental_facts TO service_role;
ALTER TABLE public.fundamental_filings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fundamental_facts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fundamental filings readable"
  ON public.fundamental_filings FOR SELECT TO authenticated USING (true);
CREATE POLICY "fundamental facts readable"
  ON public.fundamental_facts FOR SELECT TO authenticated USING (true);
CREATE VIEW public.latest_asset_fundamentals
WITH (security_invoker = true) AS
SELECT DISTINCT ON (subject_id, metric_code)
  subject_id, metric_code, value_num, as_of, confidence, source_id
FROM public.data_points
WHERE subject_type = 'asset'
ORDER BY subject_id, metric_code, as_of DESC, ingested_at DESC;
GRANT SELECT ON public.latest_asset_fundamentals TO authenticated, service_role;
CREATE VIEW public.latest_asset_scores
WITH (security_invoker = true) AS
SELECT DISTINCT ON (subject_id, score_type)
  subject_id, score_type, value, confidence, inputs, positives, deductions, computed_at, calc_version
FROM public.scores
WHERE subject_type = 'asset'
ORDER BY subject_id, score_type, computed_at DESC, id DESC;
GRANT SELECT ON public.latest_asset_scores TO authenticated, service_role;