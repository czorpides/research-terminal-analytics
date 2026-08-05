-- Opportunity Radar evidence-integrity hardening.
--
-- This migration deliberately leaves the existing EODHD/Swing ingestion and
-- scoring thresholds untouched. It adds durable provider-symbol identity,
-- freshness-aware readiness telemetry and regional coverage evidence so the
-- Radar cannot hide a broken market behind a healthy global average.

CREATE TABLE IF NOT EXISTS public.asset_provider_symbols (
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  provider_code text NOT NULL,
  provider_symbol text NOT NULL,
  exchange_code text,
  mapping_status text NOT NULL DEFAULT 'derived'
    CHECK (mapping_status IN ('derived', 'verified', 'failed')),
  last_verified_at timestamptz,
  last_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (asset_id, provider_code)
);

CREATE INDEX IF NOT EXISTS asset_provider_symbols_lookup_idx
  ON public.asset_provider_symbols(provider_code, provider_symbol);

CREATE INDEX IF NOT EXISTS asset_provider_symbols_status_idx
  ON public.asset_provider_symbols(provider_code, mapping_status, updated_at DESC);

ALTER TABLE public.asset_provider_symbols ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.asset_provider_symbols TO authenticated;
GRANT ALL ON public.asset_provider_symbols TO service_role;

DROP POLICY IF EXISTS "asset provider symbols readable" ON public.asset_provider_symbols;
CREATE POLICY "asset provider symbols readable"
  ON public.asset_provider_symbols FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.derive_asset_provider_symbol(
  p_provider text,
  p_symbol text,
  p_exchange text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE lower(coalesce(p_provider, ''))
    WHEN 'eodhd' THEN CASE upper(coalesce(p_exchange, ''))
      WHEN 'XNYS' THEN upper(p_symbol) || '.US'
      WHEN 'XNAS' THEN upper(p_symbol) || '.US'
      WHEN 'XASE' THEN upper(p_symbol) || '.US'
      WHEN 'XLON' THEN upper(p_symbol) || '.LSE'
      WHEN 'XETR' THEN upper(p_symbol) || '.XETRA'
      WHEN 'XPAR' THEN upper(p_symbol) || '.PA'
      WHEN 'XAMS' THEN upper(p_symbol) || '.AS'
      ELSE NULL
    END
    WHEN 'fmp' THEN CASE upper(coalesce(p_exchange, ''))
      WHEN 'XNYS' THEN upper(p_symbol)
      WHEN 'XNAS' THEN upper(p_symbol)
      WHEN 'XASE' THEN upper(p_symbol)
      WHEN 'XLON' THEN upper(p_symbol) || '.L'
      WHEN 'XETR' THEN upper(p_symbol) || '.DE'
      WHEN 'XPAR' THEN upper(p_symbol) || '.PA'
      WHEN 'XAMS' THEN upper(p_symbol) || '.AS'
      ELSE NULL
    END
    WHEN 'twelvedata' THEN CASE upper(coalesce(p_exchange, ''))
      WHEN 'XNYS' THEN upper(p_symbol) || '|NYSE'
      WHEN 'XNAS' THEN upper(p_symbol) || '|NASDAQ'
      WHEN 'XASE' THEN upper(p_symbol) || '|AMEX'
      WHEN 'XLON' THEN upper(p_symbol) || '|LSE'
      WHEN 'XETR' THEN upper(p_symbol) || '|XETR'
      WHEN 'XPAR' THEN upper(p_symbol) || '|XPAR'
      WHEN 'XAMS' THEN upper(p_symbol) || '|XAMS'
      ELSE NULL
    END
    WHEN 'tiingo' THEN CASE upper(coalesce(p_exchange, ''))
      WHEN 'XNYS' THEN upper(p_symbol)
      WHEN 'XNAS' THEN upper(p_symbol)
      WHEN 'XASE' THEN upper(p_symbol)
      ELSE NULL
    END
    WHEN 'alphavantage' THEN CASE upper(coalesce(p_exchange, ''))
      WHEN 'XNYS' THEN upper(p_symbol)
      WHEN 'XNAS' THEN upper(p_symbol)
      WHEN 'XASE' THEN upper(p_symbol)
      ELSE NULL
    END
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION public.derive_asset_provider_symbol(text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.derive_asset_provider_symbol(text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_asset_provider_symbols_for_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provider text;
  v_symbol text;
BEGIN
  IF NEW.asset_class <> 'equity' THEN
    RETURN NEW;
  END IF;

  FOREACH v_provider IN ARRAY ARRAY['eodhd', 'fmp', 'twelvedata', 'tiingo', 'alphavantage']
  LOOP
    v_symbol := public.derive_asset_provider_symbol(v_provider, NEW.symbol, NEW.exchange);
    IF v_symbol IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO public.asset_provider_symbols (
      asset_id,
      provider_code,
      provider_symbol,
      exchange_code,
      mapping_status,
      metadata,
      updated_at
    ) VALUES (
      NEW.id,
      v_provider,
      v_symbol,
      NEW.exchange,
      'derived',
      jsonb_build_object('derivation', 'exchange_rule_v1'),
      now()
    )
    ON CONFLICT (asset_id, provider_code) DO UPDATE SET
      provider_symbol = EXCLUDED.provider_symbol,
      exchange_code = EXCLUDED.exchange_code,
      mapping_status = CASE
        WHEN public.asset_provider_symbols.provider_symbol = EXCLUDED.provider_symbol
          AND public.asset_provider_symbols.mapping_status = 'verified'
        THEN 'verified'
        ELSE 'derived'
      END,
      last_verified_at = CASE
        WHEN public.asset_provider_symbols.provider_symbol = EXCLUDED.provider_symbol
          AND public.asset_provider_symbols.mapping_status = 'verified'
        THEN public.asset_provider_symbols.last_verified_at
        ELSE NULL
      END,
      last_error = NULL,
      metadata = EXCLUDED.metadata,
      updated_at = now();
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assets_sync_provider_symbols ON public.assets;
CREATE TRIGGER assets_sync_provider_symbols
AFTER INSERT OR UPDATE OF symbol, exchange, asset_class ON public.assets
FOR EACH ROW EXECUTE FUNCTION public.sync_asset_provider_symbols_for_row();

-- Seed the new identity layer for the existing managed universe. The internal
-- asset id remains canonical; these strings are only provider adapters.
INSERT INTO public.asset_provider_symbols (
  asset_id,
  provider_code,
  provider_symbol,
  exchange_code,
  mapping_status,
  metadata,
  updated_at
)
SELECT
  a.id,
  p.provider_code,
  public.derive_asset_provider_symbol(p.provider_code, a.symbol, a.exchange),
  a.exchange,
  'derived',
  jsonb_build_object('derivation', 'exchange_rule_v1', 'seeded', true),
  now()
FROM public.assets a
CROSS JOIN (
  VALUES ('eodhd'), ('fmp'), ('twelvedata'), ('tiingo'), ('alphavantage')
) AS p(provider_code)
WHERE a.asset_class = 'equity'
  AND public.derive_asset_provider_symbol(p.provider_code, a.symbol, a.exchange) IS NOT NULL
ON CONFLICT (asset_id, provider_code) DO UPDATE SET
  provider_symbol = EXCLUDED.provider_symbol,
  exchange_code = EXCLUDED.exchange_code,
  mapping_status = CASE
    WHEN public.asset_provider_symbols.provider_symbol = EXCLUDED.provider_symbol
      AND public.asset_provider_symbols.mapping_status = 'verified'
    THEN 'verified'
    ELSE 'derived'
  END,
  last_verified_at = CASE
    WHEN public.asset_provider_symbols.provider_symbol = EXCLUDED.provider_symbol
      AND public.asset_provider_symbols.mapping_status = 'verified'
    THEN public.asset_provider_symbols.last_verified_at
    ELSE NULL
  END,
  last_error = NULL,
  metadata = EXCLUDED.metadata,
  updated_at = now();

-- Provider-neutral, freshness-aware and regional Opportunity Radar readiness.
CREATE OR REPLACE FUNCTION public.get_opportunity_radar_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active integer := 0;
  v_price_ready integer := 0;
  v_history_252 integer := 0;
  v_technical_scores integer := 0;
  v_fundamentals_current integer := 0;
  v_fundamentals_fresh integer := 0;
  v_fundamentals_warning integer := 0;
  v_fundamentals_stale integer := 0;
  v_two_period_statements integer := 0;
  v_current_statements integer := 0;
  v_pending_backfill integer := 0;
  v_failed_backfill integer := 0;
  v_bulk_date date := NULL;
  v_bulk_finished timestamptz := NULL;
  v_bulk_rows integer := 0;
  v_bulk_status text := NULL;
  v_regions jsonb := '[]'::jsonb;
  v_eodhd_mapped integer := 0;
  v_fmp_mapped integer := 0;
  v_fmp_verified integer := 0;
  v_twelve_mapped integer := 0;
BEGIN
  SELECT count(*)::integer INTO v_active
  FROM public.assets
  WHERE active = true AND asset_class = 'equity';

  SELECT
    nullif(details->>'date', '')::date,
    coalesce(finished_at, started_at),
    rows_ingested,
    status::text
  INTO v_bulk_date, v_bulk_finished, v_bulk_rows, v_bulk_status
  FROM public.ingestion_runs
  WHERE data_category = 'price_daily_bulk'
    AND status = 'success'
  ORDER BY started_at DESC
  LIMIT 1;

  SELECT count(*)::integer INTO v_price_ready
  FROM public.assets a
  JOIN public.equity_technical_screen s ON s.asset_id = a.id
  WHERE a.active = true
    AND a.asset_class = 'equity'
    AND (v_bulk_date IS NULL OR s.as_of >= v_bulk_date);

  SELECT count(*)::integer INTO v_history_252
  FROM public.assets a
  JOIN public.equity_technical_screen s ON s.asset_id = a.id
  WHERE a.active = true
    AND a.asset_class = 'equity'
    AND s.bars >= 252;

  IF v_bulk_finished IS NOT NULL THEN
    SELECT count(*)::integer INTO v_technical_scores
    FROM (
      SELECT s.subject_id
      FROM public.scores s
      JOIN public.assets a ON a.id = s.subject_id
      WHERE s.subject_type = 'asset'
        AND s.score_type IN ('momentum', 'trend', 'volatility')
        AND s.computed_at >= v_bulk_finished
        AND a.active = true
        AND a.asset_class = 'equity'
      GROUP BY s.subject_id
      HAVING count(DISTINCT s.score_type) = 3
    ) q;
  END IF;

  -- TTM/current fundamentals are useful only while their latest values are
  -- reasonably current. <=45d is fresh, 46-100d is warning, >100d is stale.
  SELECT count(*)::integer INTO v_fundamentals_fresh
  FROM (
    SELECT f.subject_id
    FROM public.latest_asset_fundamentals f
    JOIN public.assets a ON a.id = f.subject_id
    WHERE a.active = true
      AND a.asset_class = 'equity'
      AND f.as_of >= now() - interval '45 days'
      AND f.metric_code IN (
        'fund_pe_ttm', 'fund_pb', 'fund_ps_ttm', 'fund_ev_ebitda_ttm',
        'fund_fcf_yield_ttm', 'fund_roe_ttm', 'fund_roic_ttm',
        'fund_debt_equity', 'fund_current_ratio', 'fund_market_cap'
      )
    GROUP BY f.subject_id
    HAVING count(DISTINCT f.metric_code) >= 5
  ) q;

  SELECT count(*)::integer INTO v_fundamentals_current
  FROM (
    SELECT f.subject_id
    FROM public.latest_asset_fundamentals f
    JOIN public.assets a ON a.id = f.subject_id
    WHERE a.active = true
      AND a.asset_class = 'equity'
      AND f.as_of >= now() - interval '100 days'
      AND f.metric_code IN (
        'fund_pe_ttm', 'fund_pb', 'fund_ps_ttm', 'fund_ev_ebitda_ttm',
        'fund_fcf_yield_ttm', 'fund_roe_ttm', 'fund_roic_ttm',
        'fund_debt_equity', 'fund_current_ratio', 'fund_market_cap'
      )
    GROUP BY f.subject_id
    HAVING count(DISTINCT f.metric_code) >= 5
  ) q;

  SELECT count(*)::integer INTO v_fundamentals_stale
  FROM (
    SELECT f.subject_id
    FROM public.latest_asset_fundamentals f
    JOIN public.assets a ON a.id = f.subject_id
    WHERE a.active = true
      AND a.asset_class = 'equity'
      AND f.metric_code IN (
        'fund_pe_ttm', 'fund_pb', 'fund_ps_ttm', 'fund_ev_ebitda_ttm',
        'fund_fcf_yield_ttm', 'fund_roe_ttm', 'fund_roic_ttm',
        'fund_debt_equity', 'fund_current_ratio', 'fund_market_cap'
      )
    GROUP BY f.subject_id
    HAVING count(DISTINCT f.metric_code) >= 5
       AND max(f.as_of) < now() - interval '100 days'
  ) q;
  v_fundamentals_warning := greatest(0, v_fundamentals_current - v_fundamentals_fresh);

  SELECT count(*)::integer INTO v_two_period_statements
  FROM (
    SELECT ff.asset_id
    FROM public.fundamental_filings ff
    JOIN public.assets a ON a.id = ff.asset_id
    WHERE a.active = true
      AND a.asset_class = 'equity'
      AND ff.fiscal_period = 'FY'
    GROUP BY ff.asset_id
    HAVING count(DISTINCT ff.period_end) >= 2
  ) q;

  SELECT count(*)::integer INTO v_current_statements
  FROM (
    SELECT ff.asset_id
    FROM public.fundamental_filings ff
    JOIN public.assets a ON a.id = ff.asset_id
    WHERE a.active = true
      AND a.asset_class = 'equity'
      AND ff.fiscal_period = 'FY'
    GROUP BY ff.asset_id
    HAVING count(DISTINCT ff.period_end) >= 2
       AND max(ff.period_end) >= current_date - interval '550 days'
  ) q;

  SELECT count(*)::integer INTO v_pending_backfill
  FROM public.equity_eod_backfill_queue
  WHERE status IN ('pending', 'running');

  SELECT count(*)::integer INTO v_failed_backfill
  FROM public.equity_eod_backfill_queue
  WHERE status = 'failed';

  SELECT count(*)::integer INTO v_eodhd_mapped
  FROM public.asset_provider_symbols m
  JOIN public.assets a ON a.id = m.asset_id
  WHERE a.active = true AND a.asset_class = 'equity'
    AND m.provider_code = 'eodhd' AND m.mapping_status <> 'failed';

  SELECT count(*)::integer INTO v_fmp_mapped
  FROM public.asset_provider_symbols m
  JOIN public.assets a ON a.id = m.asset_id
  WHERE a.active = true AND a.asset_class = 'equity'
    AND m.provider_code = 'fmp' AND m.mapping_status <> 'failed';

  SELECT count(*)::integer INTO v_fmp_verified
  FROM public.asset_provider_symbols m
  JOIN public.assets a ON a.id = m.asset_id
  WHERE a.active = true AND a.asset_class = 'equity'
    AND m.provider_code = 'fmp' AND m.mapping_status = 'verified';

  SELECT count(*)::integer INTO v_twelve_mapped
  FROM public.asset_provider_symbols m
  JOIN public.assets a ON a.id = m.asset_id
  WHERE a.active = true AND a.asset_class = 'equity'
    AND m.provider_code = 'twelvedata' AND m.mapping_status <> 'failed';

  WITH base AS (
    SELECT
      a.id,
      CASE
        WHEN a.exchange IN ('XNYS', 'XNAS', 'XASE') THEN 'US'
        WHEN a.exchange = 'XLON' THEN 'UK'
        WHEN a.exchange IN ('XETR', 'XPAR', 'XAMS') THEN 'EU'
        ELSE 'OTHER'
      END AS region
    FROM public.assets a
    WHERE a.active = true AND a.asset_class = 'equity'
  ), fresh_scores AS (
    SELECT s.subject_id AS asset_id
    FROM public.scores s
    JOIN base b ON b.id = s.subject_id
    WHERE s.subject_type = 'asset'
      AND s.score_type IN ('momentum', 'trend', 'volatility')
      AND v_bulk_finished IS NOT NULL
      AND s.computed_at >= v_bulk_finished
    GROUP BY s.subject_id
    HAVING count(DISTINCT s.score_type) = 3
  ), grouped AS (
    SELECT
      b.region,
      count(*)::integer AS active_assets,
      count(*) FILTER (
        WHERE t.asset_id IS NOT NULL
          AND (v_bulk_date IS NULL OR t.as_of >= v_bulk_date)
      )::integer AS fresh_price_assets,
      count(*) FILTER (WHERE t.bars >= 252)::integer AS history_252_assets,
      count(*) FILTER (WHERE fs.asset_id IS NOT NULL)::integer AS fresh_score_assets
    FROM base b
    LEFT JOIN public.equity_technical_screen t ON t.asset_id = b.id
    LEFT JOIN fresh_scores fs ON fs.asset_id = b.id
    WHERE b.region IN ('US', 'UK', 'EU')
    GROUP BY b.region
  )
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'region', region,
        'activeAssets', active_assets,
        'freshPriceAssets', fresh_price_assets,
        'history252Assets', history_252_assets,
        'freshTechnicalScoreAssets', fresh_score_assets
      ) ORDER BY CASE region WHEN 'US' THEN 1 WHEN 'UK' THEN 2 ELSE 3 END
    ),
    '[]'::jsonb
  ) INTO v_regions
  FROM grouped;

  RETURN jsonb_build_object(
    'asOf', now(),
    'activeEquities', v_active,
    'latestBulkDate', v_bulk_date,
    'latestBulkFinishedAt', v_bulk_finished,
    'latestBulkRows', v_bulk_rows,
    'latestBulkStatus', v_bulk_status,
    'freshPriceAssets', v_price_ready,
    'history252Assets', v_history_252,
    'freshTechnicalScoreAssets', v_technical_scores,
    'fundamentalAssets', v_fundamentals_current,
    'freshFundamentalAssets', v_fundamentals_fresh,
    'warningFundamentalAssets', v_fundamentals_warning,
    'staleFundamentalAssets', v_fundamentals_stale,
    'twoPeriodStatementAssets', v_two_period_statements,
    'currentStatementAssets', v_current_statements,
    'pendingBackfillDates', v_pending_backfill,
    'failedBackfillDates', v_failed_backfill,
    'regions', v_regions,
    'providerMappings', jsonb_build_object(
      'eodhdMappedAssets', v_eodhd_mapped,
      'fmpMappedAssets', v_fmp_mapped,
      'fmpVerifiedAssets', v_fmp_verified,
      'twelveDataMappedAssets', v_twelve_mapped
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_opportunity_radar_health() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_opportunity_radar_health() TO service_role;
