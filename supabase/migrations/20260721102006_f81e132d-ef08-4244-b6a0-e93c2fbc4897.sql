
-- Undervaluation watchlist for stable, weekly-refreshed value candidates.
CREATE TABLE public.undervaluation_watchlist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  entry_score NUMERIC NOT NULL,
  last_score NUMERIC NOT NULL,
  last_confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  weak_streak INTEGER NOT NULL DEFAULT 0,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_at TIMESTAMPTZ,
  exit_reason TEXT,
  UNIQUE(asset_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.undervaluation_watchlist TO authenticated;
GRANT ALL ON public.undervaluation_watchlist TO service_role;
ALTER TABLE public.undervaluation_watchlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_all_authenticated" ON public.undervaluation_watchlist FOR SELECT TO authenticated USING (true);
CREATE INDEX undervaluation_watchlist_active_idx ON public.undervaluation_watchlist(removed_at) WHERE removed_at IS NULL;

-- Seed commodity universe (idempotent).
INSERT INTO public.commodities (code, name, unit) VALUES
  ('WTI',  'Crude Oil (WTI)',    'USD/bbl'),
  ('BRENT','Crude Oil (Brent)',  'USD/bbl'),
  ('NG',   'Natural Gas (Henry Hub)', 'USD/MMBtu'),
  ('GOLD', 'Gold',               'USD/oz'),
  ('SILVER','Silver',            'USD/oz'),
  ('COPPER','Copper',            'USD/lb'),
  ('WHEAT','Wheat',              'USD/bu'),
  ('CORN', 'Corn',               'USD/bu'),
  ('SOY',  'Soybeans',           'USD/bu')
ON CONFLICT (code) DO NOTHING;
