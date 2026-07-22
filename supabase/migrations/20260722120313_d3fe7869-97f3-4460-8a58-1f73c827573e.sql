
-- =========================================================
-- Stage 1: quant upgrade schema
-- Region-aware indicator registry, immutable raw observations
-- with vintages, transformed signals, model runs + outputs,
-- score ledger extension, and data-quality scores.
-- All additive; existing tables untouched.
-- =========================================================

-- 1) regions ------------------------------------------------
CREATE TABLE public.regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,               -- 'US' | 'UK' | 'EA'
  name TEXT NOT NULL,
  currency_code TEXT,
  timezone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.regions TO anon, authenticated;
GRANT ALL ON public.regions TO service_role;
ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "regions readable to all" ON public.regions FOR SELECT USING (true);

INSERT INTO public.regions (code, name, currency_code, timezone) VALUES
  ('US', 'United States', 'USD', 'America/New_York'),
  ('UK', 'United Kingdom', 'GBP', 'Europe/London'),
  ('EA', 'Euro Area',      'EUR', 'Europe/Frankfurt');

-- 2) release_calendars --------------------------------------
CREATE TABLE public.release_calendars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  cadence TEXT NOT NULL,                   -- daily | weekly | monthly | quarterly | irregular
  typical_lag_days INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.release_calendars TO anon, authenticated;
GRANT ALL ON public.release_calendars TO service_role;
ALTER TABLE public.release_calendars ENABLE ROW LEVEL SECURITY;
CREATE POLICY "release_calendars readable to all" ON public.release_calendars FOR SELECT USING (true);

-- 3) indicator_registry -------------------------------------
CREATE TABLE public.indicator_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID NOT NULL REFERENCES public.regions(id) ON DELETE RESTRICT,
  engine TEXT NOT NULL,                    -- growth|inflation|liquidity|labour|market
  concept_code TEXT NOT NULL,              -- e.g. real_gdp, industrial_production
  series_code_native TEXT NOT NULL,        -- e.g. FRED 'GDPC1'
  source_id UUID REFERENCES public.data_sources(id),
  fallback_source_id UUID REFERENCES public.data_sources(id),
  unit TEXT,
  frequency TEXT NOT NULL,                 -- daily|weekly|monthly|quarterly
  transform_default TEXT,                  -- level|yoy|mom|zscore
  direction TEXT,                          -- higher_is_better | lower_is_better | context
  seasonal_adj BOOLEAN NOT NULL DEFAULT false,
  license_status TEXT NOT NULL DEFAULT 'public',
  vintage_policy TEXT NOT NULL DEFAULT 'snapshot_on_ingest', -- snapshot_on_ingest | alfred | none
  release_calendar_id UUID REFERENCES public.release_calendars(id),
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (region_id, engine, concept_code)
);
CREATE INDEX idx_indicator_registry_engine ON public.indicator_registry(engine);
CREATE INDEX idx_indicator_registry_region ON public.indicator_registry(region_id);
GRANT SELECT ON public.indicator_registry TO anon, authenticated;
GRANT ALL ON public.indicator_registry TO service_role;
ALTER TABLE public.indicator_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "indicator_registry readable to all" ON public.indicator_registry FOR SELECT USING (true);

-- 4) data_vintages ------------------------------------------
CREATE TABLE public.data_vintages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_id UUID NOT NULL REFERENCES public.indicator_registry(id) ON DELETE CASCADE,
  release_date DATE NOT NULL,
  payload_hash TEXT NOT NULL,
  retrieved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_ref TEXT,
  UNIQUE (indicator_id, release_date, payload_hash)
);
CREATE INDEX idx_data_vintages_indicator ON public.data_vintages(indicator_id, release_date DESC);
GRANT SELECT ON public.data_vintages TO authenticated;
GRANT ALL ON public.data_vintages TO service_role;
ALTER TABLE public.data_vintages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "data_vintages readable" ON public.data_vintages FOR SELECT TO authenticated USING (true);

-- 5) raw_observations (immutable) ---------------------------
CREATE TABLE public.raw_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_id UUID NOT NULL REFERENCES public.indicator_registry(id) ON DELETE CASCADE,
  observation_date DATE NOT NULL,
  release_date DATE,
  retrieved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  value_raw NUMERIC,
  unit_raw TEXT,
  vintage_id UUID REFERENCES public.data_vintages(id),
  source_payload_ref TEXT,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (indicator_id, observation_date, vintage_id)
);
CREATE INDEX idx_raw_obs_indicator_obsdate ON public.raw_observations(indicator_id, observation_date DESC);
GRANT SELECT ON public.raw_observations TO authenticated;
GRANT ALL ON public.raw_observations TO service_role;
ALTER TABLE public.raw_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "raw_observations readable" ON public.raw_observations FOR SELECT TO authenticated USING (true);

-- 6) transformed_signals ------------------------------------
CREATE TABLE public.transformed_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_id UUID NOT NULL REFERENCES public.indicator_registry(id) ON DELETE CASCADE,
  ts DATE NOT NULL,
  transform_code TEXT NOT NULL,            -- yoy|mom|zscore_std|zscore_robust|momentum_3m|momentum_12m|ewma
  value NUMERIC,
  params JSONB,
  model_version TEXT NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (indicator_id, ts, transform_code, model_version)
);
CREATE INDEX idx_transformed_signals_lookup ON public.transformed_signals(indicator_id, transform_code, ts DESC);
GRANT SELECT ON public.transformed_signals TO authenticated;
GRANT ALL ON public.transformed_signals TO service_role;
ALTER TABLE public.transformed_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transformed_signals readable" ON public.transformed_signals FOR SELECT TO authenticated USING (true);

-- 7) model_runs (audit) -------------------------------------
CREATE TABLE public.model_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_key TEXT NOT NULL,                 -- e.g. kalman.llt
  model_version TEXT NOT NULL,             -- e.g. v1
  region_id UUID REFERENCES public.regions(id),
  status TEXT NOT NULL DEFAULT 'running',  -- running|success|failed|partial
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  git_sha TEXT,
  service_version TEXT,
  input_hash TEXT,
  output_summary JSONB,
  diagnostics JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_model_runs_key_time ON public.model_runs(model_key, started_at DESC);
GRANT SELECT ON public.model_runs TO authenticated;
GRANT ALL ON public.model_runs TO service_role;
ALTER TABLE public.model_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "model_runs readable" ON public.model_runs FOR SELECT TO authenticated USING (true);

-- 8) model_outputs (versioned) ------------------------------
CREATE TABLE public.model_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_key TEXT NOT NULL,
  model_version TEXT NOT NULL,
  run_id UUID REFERENCES public.model_runs(id) ON DELETE SET NULL,
  indicator_id UUID REFERENCES public.indicator_registry(id) ON DELETE CASCADE,
  ts DATE NOT NULL,
  output_type TEXT NOT NULL,               -- kalman_level|kalman_slope|kalman_sigma|innovation|residual
  value NUMERIC,
  uncertainty NUMERIC,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (model_key, model_version, indicator_id, ts, output_type)
);
CREATE INDEX idx_model_outputs_lookup ON public.model_outputs(model_key, indicator_id, ts DESC);
GRANT SELECT ON public.model_outputs TO authenticated;
GRANT ALL ON public.model_outputs TO service_role;
ALTER TABLE public.model_outputs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "model_outputs readable" ON public.model_outputs FOR SELECT TO authenticated USING (true);

-- 9) factor_models (scaffold — populated in later stage) ----
CREATE TABLE public.factor_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engine TEXT NOT NULL,
  region_id UUID NOT NULL REFERENCES public.regions(id),
  model_version TEXT NOT NULL,
  loadings JSONB,
  explained_variance JSONB,
  approved BOOLEAN NOT NULL DEFAULT false,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (engine, region_id, model_version)
);
GRANT SELECT ON public.factor_models TO authenticated;
GRANT ALL ON public.factor_models TO service_role;
ALTER TABLE public.factor_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "factor_models readable" ON public.factor_models FOR SELECT TO authenticated USING (true);

-- 10) regime_states (scaffold) ------------------------------
CREATE TABLE public.regime_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID NOT NULL REFERENCES public.regions(id),
  ts DATE NOT NULL,
  model_version TEXT NOT NULL,
  state_index INT,
  state_label TEXT,
  probabilities JSONB,
  status TEXT NOT NULL DEFAULT 'shadow',   -- shadow | approved
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (region_id, ts, model_version)
);
GRANT SELECT ON public.regime_states TO authenticated;
GRANT ALL ON public.regime_states TO service_role;
ALTER TABLE public.regime_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "regime_states readable" ON public.regime_states FOR SELECT TO authenticated USING (true);

-- 11) event_definitions & event_instances (scaffold) --------
CREATE TABLE public.event_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,                           -- macro_release | earnings | index_rebalance | weather | other
  version TEXT NOT NULL DEFAULT 'v1',
  rules JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.event_definitions TO authenticated;
GRANT ALL ON public.event_definitions TO service_role;
ALTER TABLE public.event_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "event_definitions readable" ON public.event_definitions FOR SELECT TO authenticated USING (true);

CREATE TABLE public.event_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id UUID NOT NULL REFERENCES public.event_definitions(id) ON DELETE CASCADE,
  region_id UUID REFERENCES public.regions(id),
  subject_type TEXT,                       -- asset | region | industry
  subject_id UUID,
  event_date DATE NOT NULL,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_event_instances_def_date ON public.event_instances(definition_id, event_date DESC);
GRANT SELECT ON public.event_instances TO authenticated;
GRANT ALL ON public.event_instances TO service_role;
ALTER TABLE public.event_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "event_instances readable" ON public.event_instances FOR SELECT TO authenticated USING (true);

-- 12) score_ledger_entries ----------------------------------
CREATE TABLE public.score_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type TEXT NOT NULL,              -- asset|region|industry
  subject_id UUID NOT NULL,
  feature_code TEXT NOT NULL,
  ts DATE NOT NULL,
  contribution NUMERIC,
  direction TEXT NOT NULL,                 -- positive|deduction|contradiction|context
  evidence_ref JSONB,
  model_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ledger_subject ON public.score_ledger_entries(subject_type, subject_id, ts DESC);
GRANT SELECT ON public.score_ledger_entries TO authenticated;
GRANT ALL ON public.score_ledger_entries TO service_role;
ALTER TABLE public.score_ledger_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "score_ledger readable" ON public.score_ledger_entries FOR SELECT TO authenticated USING (true);

-- 13) data_quality_scores -----------------------------------
CREATE TABLE public.data_quality_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_id UUID REFERENCES public.indicator_registry(id) ON DELETE CASCADE,
  feature_code TEXT,
  ts DATE NOT NULL,
  authority NUMERIC,       -- A
  freshness NUMERIC,       -- F
  coverage NUMERIC,        -- C
  reconciliation NUMERIC,  -- R
  mapping NUMERIC,         -- M
  stability NUMERIC,       -- S
  composite NUMERIC,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (indicator_id, feature_code, ts)
);
GRANT SELECT ON public.data_quality_scores TO authenticated;
GRANT ALL ON public.data_quality_scores TO service_role;
ALTER TABLE public.data_quality_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "data_quality readable" ON public.data_quality_scores FOR SELECT TO authenticated USING (true);

-- 14) Views -------------------------------------------------
CREATE OR REPLACE VIEW public.v_current_canonical_observations AS
SELECT DISTINCT ON (ro.indicator_id, ro.observation_date)
  ro.id, ro.indicator_id, ro.observation_date, ro.release_date,
  ro.retrieved_at, ro.value_raw, ro.unit_raw, ro.vintage_id
FROM public.raw_observations ro
ORDER BY ro.indicator_id, ro.observation_date, ro.release_date DESC NULLS LAST, ro.retrieved_at DESC;

CREATE OR REPLACE VIEW public.v_current_model_outputs AS
SELECT DISTINCT ON (mo.model_key, mo.indicator_id, mo.output_type, mo.ts)
  mo.id, mo.model_key, mo.model_version, mo.run_id, mo.indicator_id,
  mo.ts, mo.output_type, mo.value, mo.uncertainty, mo.meta
FROM public.model_outputs mo
ORDER BY mo.model_key, mo.indicator_id, mo.output_type, mo.ts,
  mo.model_version DESC, mo.created_at DESC;

GRANT SELECT ON public.v_current_canonical_observations TO authenticated;
GRANT SELECT ON public.v_current_model_outputs TO authenticated;

-- 15) updated_at triggers -----------------------------------
CREATE TRIGGER trg_regions_updated
  BEFORE UPDATE ON public.regions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_indicator_registry_updated
  BEFORE UPDATE ON public.indicator_registry
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
