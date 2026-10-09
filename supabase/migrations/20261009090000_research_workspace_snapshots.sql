-- Server-only staging research snapshot cache.
-- Reduces user-facing full-universe scan latency without altering model inputs.
CREATE TABLE IF NOT EXISTS public.research_workspace_snapshots (
  cache_key text PRIMARY KEY,
  model_version text NOT NULL,
  data_asof text,
  computed_at timestamptz NOT NULL DEFAULT now(),
  workspace jsonb NOT NULL
);
ALTER TABLE public.research_workspace_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.research_workspace_snapshots FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.research_workspace_snapshots TO service_role;
COMMENT ON TABLE public.research_workspace_snapshots IS 'Server-only, time-limited cached result of a read-only research computation. Raw market observations and scores are not changed.';
