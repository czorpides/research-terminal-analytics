-- SEC source contact metadata is public in principle, but owned here in a
-- server-only table so no personal contact details appear in source control.
-- NOT a credential store: never put provider API keys or job tokens here.
CREATE TABLE IF NOT EXISTS public.research_provider_settings (
  name text PRIMARY KEY CHECK (name IN ('sec_edgar_user_agent')),
  value text NOT NULL CHECK (length(value) BETWEEN 12 AND 250),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.research_provider_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.research_provider_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.research_provider_settings TO service_role;
COMMENT ON TABLE public.research_provider_settings IS
'Non-secret operator-declared provider contact only. Server role access; never API keys, tokens, or passwords.';
