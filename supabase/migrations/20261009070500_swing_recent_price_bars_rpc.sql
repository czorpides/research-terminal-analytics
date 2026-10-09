-- Additive read-only RPC for Swing Radar deep scans.
-- The old PostgREST request made ~75 separately sorted historical-price
-- requests for a 220-equity scan. This uses the existing composite price
-- index and one bounded lateral lookup for each requested instrument.
-- No scoring method or stored market price is changed.
CREATE OR REPLACE FUNCTION public.get_swing_recent_price_bars(
  p_asset_ids uuid[],
  p_from_date date,
  p_bars_per_asset integer DEFAULT 300
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'asset_id', ids.asset_id,
      'trade_date', bars.trade_date,
      'open', bars.open,
      'high', bars.high,
      'low', bars.low,
      'close', bars.close,
      'adj_close', bars.adj_close,
      'volume', bars.volume
    )
  ), '[]'::jsonb)
  FROM unnest(p_asset_ids) AS ids(asset_id)
  CROSS JOIN LATERAL (
    SELECT pd.trade_date, pd.open, pd.high, pd.low, pd.close,
           pd.adj_close, pd.volume
    FROM public.prices_daily pd
    WHERE pd.asset_id = ids.asset_id
      AND pd.trade_date >= p_from_date
    ORDER BY pd.trade_date DESC
    LIMIT LEAST(GREATEST(p_bars_per_asset, 1), 300)
  ) AS bars;
$$;

REVOKE ALL ON FUNCTION public.get_swing_recent_price_bars(uuid[],date,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_swing_recent_price_bars(uuid[],date,integer)
  TO service_role;
