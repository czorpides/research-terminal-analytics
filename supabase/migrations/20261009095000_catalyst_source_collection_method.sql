-- Distinguish evidence discovered by the scheduled feed from genuinely
-- reviewed official press releases added manually when the RSS endpoint
-- does not permit server-side automated access.
ALTER TABLE public.catalyst_source_documents
  ADD COLUMN IF NOT EXISTS collection_method text NOT NULL DEFAULT 'automatic_feed'
    CHECK (collection_method IN ('automatic_feed','manual_official'));
COMMENT ON COLUMN public.catalyst_source_documents.collection_method IS
  'Records whether official source was discovered by automated permitted feed or manually using official publication; never implies stock-catalyst verification.';
