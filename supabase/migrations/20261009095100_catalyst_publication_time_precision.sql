-- Preserve uncertainty when official sources publish only a calendar date.
-- For backtests use 23:59:59 UTC at the end of the source date, never
-- invent an intraday timestamp earlier than publication.
ALTER TABLE public.catalyst_source_documents
  ADD COLUMN IF NOT EXISTS published_time_precision text NOT NULL DEFAULT 'exact'
    CHECK (published_time_precision IN ('exact','date_only_conservative'));
COMMENT ON COLUMN public.catalyst_source_documents.published_time_precision IS
 'For date_only_conservative, source_published_at is the end-of-calendar-day conservative bound, NOT the actual intraday publication timestamp.';
