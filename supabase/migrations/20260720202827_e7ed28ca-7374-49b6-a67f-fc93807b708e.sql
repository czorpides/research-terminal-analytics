
-- =========================================================
-- Phase 1: Foundation schema for personal investment dashboard
-- =========================================================

-- Reusable updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- Enums
CREATE TYPE public.source_tier AS ENUM ('tier1_official','tier2_regulated','tier3_reputable','tier4_alternative');
CREATE TYPE public.data_category AS ENUM ('macro_release','price_daily','price_intraday','fundamentals','earnings','news','commodity','fx','alt_data','corporate_action');
CREATE TYPE public.asset_class AS ENUM ('equity','etf','bond','commodity','fx','crypto','index','future','option');
CREATE TYPE public.ingestion_status AS ENUM ('pending','running','success','partial','failed');
CREATE TYPE public.subject_type AS ENUM ('asset','industry','country','commodity','factor','indicator','thesis');
CREATE TYPE public.thesis_state AS ENUM ('active','strengthening','weakening','broken','archived');
CREATE TYPE public.alert_state AS ENUM ('pending','triggered','acknowledged','dismissed');

-- =====================
-- Reference catalogue
-- =====================
CREATE TABLE public.countries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  iso2 text UNIQUE NOT NULL,
  name text NOT NULL,
  region text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.industries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  parent_id uuid REFERENCES public.industries(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.commodities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  unit text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.factors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.economic_indicators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  country_id uuid REFERENCES public.countries(id),
  frequency text,
  unit text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  name text NOT NULL,
  asset_class public.asset_class NOT NULL,
  country_id uuid REFERENCES public.countries(id),
  currency text,
  industry_id uuid REFERENCES public.industries(id),
  exchange text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (symbol, exchange)
);
CREATE TRIGGER assets_set_updated_at BEFORE UPDATE ON public.assets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================
-- Sources & reliability
-- =====================
CREATE TABLE public.data_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  tier public.source_tier NOT NULL,
  base_url text,
  api_docs_url text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER data_sources_set_updated_at BEFORE UPDATE ON public.data_sources FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.source_freshness_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_category public.data_category NOT NULL UNIQUE,
  max_age_seconds integer NOT NULL,
  warn_age_seconds integer NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ingestion_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.data_sources(id) ON DELETE CASCADE,
  data_category public.data_category NOT NULL,
  status public.ingestion_status NOT NULL DEFAULT 'pending',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  rows_ingested integer NOT NULL DEFAULT 0,
  error text,
  details jsonb
);
CREATE INDEX ingestion_runs_source_idx ON public.ingestion_runs(source_id, started_at DESC);

-- Append-only fact table every panel reads through
CREATE TABLE public.data_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type public.subject_type NOT NULL,
  subject_id uuid NOT NULL,
  metric_code text NOT NULL,
  value_num numeric,
  value_text text,
  as_of timestamptz NOT NULL,
  source_id uuid REFERENCES public.data_sources(id),
  ingested_at timestamptz NOT NULL DEFAULT now(),
  confidence integer NOT NULL DEFAULT 100,
  penalties jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw jsonb
);
CREATE INDEX data_points_lookup_idx ON public.data_points(subject_type, subject_id, metric_code, as_of DESC);

-- =====================
-- Market / fundamentals (skeleton)
-- =====================
CREATE TABLE public.prices_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  trade_date date NOT NULL,
  open numeric, high numeric, low numeric, close numeric, adj_close numeric,
  volume numeric,
  source_id uuid REFERENCES public.data_sources(id),
  UNIQUE (asset_id, trade_date)
);

CREATE TABLE public.prices_intraday (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  ts timestamptz NOT NULL,
  price numeric NOT NULL,
  volume numeric,
  source_id uuid REFERENCES public.data_sources(id)
);
CREATE INDEX prices_intraday_asset_ts_idx ON public.prices_intraday(asset_id, ts DESC);

CREATE TABLE public.fundamentals_quarterly (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  period_end date NOT NULL,
  statement_type text NOT NULL,
  line_item text NOT NULL,
  value numeric,
  currency text,
  source_id uuid REFERENCES public.data_sources(id),
  UNIQUE (asset_id, period_end, statement_type, line_item)
);

CREATE TABLE public.fundamentals_annual (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  fiscal_year integer NOT NULL,
  statement_type text NOT NULL,
  line_item text NOT NULL,
  value numeric,
  currency text,
  source_id uuid REFERENCES public.data_sources(id),
  UNIQUE (asset_id, fiscal_year, statement_type, line_item)
);

CREATE TABLE public.earnings_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL,
  period_end date,
  estimate_eps numeric,
  actual_eps numeric,
  surprise_pct numeric,
  source_id uuid REFERENCES public.data_sources(id)
);

CREATE TABLE public.economic_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_id uuid NOT NULL REFERENCES public.economic_indicators(id) ON DELETE CASCADE,
  release_time timestamptz NOT NULL,
  period_ref text,
  actual numeric,
  consensus numeric,
  previous numeric,
  surprise numeric,
  source_id uuid REFERENCES public.data_sources(id),
  UNIQUE (indicator_id, release_time)
);

CREATE TABLE public.news_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  headline text NOT NULL,
  url text,
  published_at timestamptz NOT NULL,
  subject_type public.subject_type,
  subject_id uuid,
  sentiment numeric,
  source_id uuid REFERENCES public.data_sources(id),
  raw jsonb
);
CREATE INDEX news_items_subject_idx ON public.news_items(subject_type, subject_id, published_at DESC);

CREATE TABLE public.commodity_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commodity_id uuid NOT NULL REFERENCES public.commodities(id) ON DELETE CASCADE,
  ts timestamptz NOT NULL,
  price numeric NOT NULL,
  source_id uuid REFERENCES public.data_sources(id),
  UNIQUE (commodity_id, ts)
);

CREATE TABLE public.fx_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_ccy text NOT NULL,
  quote_ccy text NOT NULL,
  ts timestamptz NOT NULL,
  rate numeric NOT NULL,
  source_id uuid REFERENCES public.data_sources(id),
  UNIQUE (base_ccy, quote_ccy, ts)
);

CREATE TABLE public.alt_data_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_code text NOT NULL,
  subject_type public.subject_type NOT NULL,
  subject_id uuid NOT NULL,
  ts timestamptz NOT NULL,
  value numeric,
  meta jsonb,
  source_id uuid REFERENCES public.data_sources(id)
);
CREATE INDEX alt_data_signals_subject_idx ON public.alt_data_signals(subject_type, subject_id, ts DESC);

-- =====================
-- Analytics layer (auditable)
-- =====================
CREATE TABLE public.scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type public.subject_type NOT NULL,
  subject_id uuid NOT NULL,
  score_type text NOT NULL,
  value numeric NOT NULL,
  confidence integer NOT NULL DEFAULT 100,
  calc_version text NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  weights jsonb NOT NULL DEFAULT '{}'::jsonb,
  positives jsonb NOT NULL DEFAULT '[]'::jsonb,
  deductions jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX scores_subject_idx ON public.scores(subject_type, subject_id, score_type, computed_at DESC);

CREATE TABLE public.event_study_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  subject_type public.subject_type NOT NULL,
  subject_id uuid NOT NULL,
  window_days integer NOT NULL,
  sample_size integer NOT NULL,
  mean_return numeric,
  median_return numeric,
  hit_rate numeric,
  distribution jsonb,
  confidence integer NOT NULL DEFAULT 100,
  calc_version text NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.regime_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regime_type text NOT NULL,
  label text NOT NULL,
  as_of timestamptz NOT NULL,
  inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence integer NOT NULL DEFAULT 100,
  calc_version text NOT NULL
);

CREATE TABLE public.sensitivity_matrix (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type public.subject_type NOT NULL,
  subject_id uuid NOT NULL,
  driver_code text NOT NULL,
  beta numeric,
  r_squared numeric,
  window_start date,
  window_end date,
  calc_version text NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now()
);

-- =====================
-- User research layer (private)
-- =====================
CREATE TABLE public.watchlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER watchlists_set_updated_at BEFORE UPDATE ON public.watchlists FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.watchlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_id uuid NOT NULL REFERENCES public.watchlists(id) ON DELETE CASCADE,
  subject_type public.subject_type NOT NULL,
  subject_id uuid NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  note text
);

CREATE TABLE public.research_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  subject_type public.subject_type,
  subject_id uuid,
  title text NOT NULL,
  body text,
  tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER research_notes_set_updated_at BEFORE UPDATE ON public.research_notes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.theses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  subject_type public.subject_type NOT NULL,
  subject_id uuid NOT NULL,
  title text NOT NULL,
  hypothesis text NOT NULL,
  supporting_evidence text,
  invalidation_condition text,
  state public.thesis_state NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER theses_set_updated_at BEFORE UPDATE ON public.theses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.thesis_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id uuid NOT NULL REFERENCES public.theses(id) ON DELETE CASCADE,
  captured_at timestamptz NOT NULL DEFAULT now(),
  direction text NOT NULL,
  weight integer NOT NULL DEFAULT 1,
  summary text NOT NULL,
  data_point_id uuid REFERENCES public.data_points(id),
  news_item_id uuid REFERENCES public.news_items(id)
);

CREATE TABLE public.alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  subject_type public.subject_type NOT NULL,
  subject_id uuid,
  condition jsonb NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER alert_rules_set_updated_at BEFORE UPDATE ON public.alert_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  rule_id uuid REFERENCES public.alert_rules(id) ON DELETE SET NULL,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  state public.alert_state NOT NULL DEFAULT 'pending',
  headline text NOT NULL,
  detail jsonb,
  confidence integer NOT NULL DEFAULT 100
);
CREATE INDEX alerts_owner_idx ON public.alerts(owner_id, triggered_at DESC);

-- =========================================================
-- GRANTS + RLS
-- =========================================================
-- Reference/market tables: authenticated can read; only owners can write (enforced later via role table).
-- For now: authenticated select-only, service_role full.
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'countries','industries','commodities','factors','economic_indicators','assets',
    'data_sources','source_freshness_policies','ingestion_runs','data_points',
    'prices_daily','prices_intraday','fundamentals_quarterly','fundamentals_annual',
    'earnings_events','economic_releases','news_items','commodity_prices','fx_rates',
    'alt_data_signals','scores','event_study_results','regime_classifications','sensitivity_matrix'
  ])
  LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "read_all_authenticated" ON public.%I FOR SELECT TO authenticated USING (true)', t);
  END LOOP;
END $$;

-- Private per-owner tables
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'watchlists','research_notes','theses','alert_rules','alerts'
  ])
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "owner_all" ON public.%I FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid())', t);
  END LOOP;
END $$;

-- Child tables gated via parent
GRANT SELECT, INSERT, UPDATE, DELETE ON public.watchlist_items TO authenticated;
GRANT ALL ON public.watchlist_items TO service_role;
ALTER TABLE public.watchlist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "watchlist_items_owner" ON public.watchlist_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.watchlists w WHERE w.id = watchlist_id AND w.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.watchlists w WHERE w.id = watchlist_id AND w.owner_id = auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.thesis_evidence TO authenticated;
GRANT ALL ON public.thesis_evidence TO service_role;
ALTER TABLE public.thesis_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "thesis_evidence_owner" ON public.thesis_evidence FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.theses t WHERE t.id = thesis_id AND t.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.theses t WHERE t.id = thesis_id AND t.owner_id = auth.uid()));

-- =========================================================
-- Seed: freshness policies + a few Tier-1 sources
-- =========================================================
INSERT INTO public.source_freshness_policies (data_category, max_age_seconds, warn_age_seconds, notes) VALUES
  ('macro_release', 60*60*24*7, 60*60*24*2, 'Weekly macro cadence; warn after 2 days'),
  ('price_daily',   60*60*24*2, 60*60*24,   'Should be updated by next trading day'),
  ('price_intraday',60*10,      60*2,       'Intraday quotes: fresh within minutes'),
  ('fundamentals',  60*60*24*100,60*60*24*45,'Quarterly reporting cycle'),
  ('earnings',      60*60*24*2, 60*60*12,   'Earnings actuals within 48h'),
  ('news',          60*60*6,    60*60,      'News should be near-real-time'),
  ('commodity',     60*60*6,    60*60,      'Spot/futures commodity quotes'),
  ('fx',            60*10,      60*2,       'FX ticks near-real-time'),
  ('alt_data',      60*60*24*3, 60*60*24,   'Alt data typically delayed'),
  ('corporate_action', 60*60*24*3, 60*60*12,'Splits, dividends, guidance');

INSERT INTO public.data_sources (name, tier, base_url, api_docs_url, notes) VALUES
  ('FRED (Federal Reserve)', 'tier1_official', 'https://api.stlouisfed.org', 'https://fred.stlouisfed.org/docs/api/fred/', 'US macro releases, gold standard'),
  ('SEC EDGAR', 'tier1_official', 'https://data.sec.gov', 'https://www.sec.gov/edgar/sec-api-documentation', 'US company filings'),
  ('ECB Statistical Data Warehouse', 'tier1_official', 'https://data.ecb.europa.eu', 'https://data.ecb.europa.eu/help/api/overview', 'Eurozone macro'),
  ('Bureau of Labor Statistics', 'tier1_official', 'https://api.bls.gov', 'https://www.bls.gov/developers/', 'US employment & CPI');
