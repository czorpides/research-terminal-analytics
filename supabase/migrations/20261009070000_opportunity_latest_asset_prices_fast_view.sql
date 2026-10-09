-- Additive, read-only staging migration: indexed latest close per managed equity.
-- Replaces the expensive multi-asset ORDER BY trade_date DESC scans that
-- repeatedly timed out when opening Opportunity Radar.
-- Relies on prices_daily_asset_id_trade_date_key (asset_id, trade_date).
-- Does not alter source observations, valuation inputs, or scoring logic.
CREATE OR REPLACE VIEW public.opportunity_latest_asset_prices
WITH (security_invoker = true) AS
SELECT
  a.id AS asset_id,
  p.trade_date,
  p.close
FROM public.assets AS a
LEFT JOIN LATERAL (
  SELECT pd.trade_date, pd.close
  FROM public.prices_daily AS pd
  WHERE pd.asset_id = a.id
    AND pd.close IS NOT NULL
  ORDER BY pd.trade_date DESC
  LIMIT 1
) AS p ON TRUE
WHERE a.active = true
  AND a.asset_class = 'equity';

GRANT SELECT ON public.opportunity_latest_asset_prices TO service_role;
