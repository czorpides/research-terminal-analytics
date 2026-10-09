-- Staging corporate-source document intake and health log.
-- Documents are NOT security-scored catalyst events until ticker/entity review.
CREATE TABLE IF NOT EXISTS public.catalyst_source_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 provider text NOT NULL CHECK(provider IN ('sp_dji_index_news')),
 source_url text NOT NULL UNIQUE CHECK(source_url ~ '^https://[^[:space:]]+$'),
 title text NOT NULL CHECK(length(title) BETWEEN 8 AND 500),
 source_published_at timestamptz NOT NULL,
 first_observed_at timestamptz NOT NULL DEFAULT now(),
 first_known_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'unmapped' CHECK(status IN ('unmapped','reviewed','dismissed')),
 matched_asset_id uuid REFERENCES public.assets(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(first_known_at >= source_published_at - interval '2 seconds'),
 CHECK(status != 'reviewed' OR matched_asset_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_catalyst_source_documents_new
 ON public.catalyst_source_documents(first_known_at DESC) WHERE status='unmapped';
ALTER TABLE public.catalyst_source_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.catalyst_source_documents FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE ON public.catalyst_source_documents TO service_role;

CREATE TABLE IF NOT EXISTS public.catalyst_poll_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 source text NOT NULL CHECK(source IN ('sp_dji_index_news','sec_earnings')),
 started_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz,
 status text NOT NULL DEFAULT 'running' CHECK(status IN ('running','ok','error','skipped')),
 observed integer NOT NULL DEFAULT 0 CHECK(observed>=0),
 submitted integer NOT NULL DEFAULT 0 CHECK(submitted>=0),
 warning text,
 CHECK(finished_at IS NULL OR finished_at >= started_at)
);
CREATE INDEX IF NOT EXISTS idx_catalyst_poll_run_recent
 ON public.catalyst_poll_runs(source,started_at DESC);
ALTER TABLE public.catalyst_poll_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.catalyst_poll_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE ON public.catalyst_poll_runs TO service_role;
COMMENT ON TABLE public.catalyst_source_documents IS
 'First-seen source documents from official announcement feeds. Unmapped docs never alter stock scores.';
