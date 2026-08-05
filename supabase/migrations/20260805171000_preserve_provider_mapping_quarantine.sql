-- Keep verified and failed provider mappings stable across managed-universe
-- refreshes when the canonical symbol/exchange pair has not changed.

ALTER TABLE public.asset_provider_symbols
  DROP CONSTRAINT IF EXISTS asset_provider_symbols_provider_code_check;
ALTER TABLE public.asset_provider_symbols
  ADD CONSTRAINT asset_provider_symbols_provider_code_check
  CHECK (provider_code IN ('eodhd', 'fmp', 'twelvedata', 'tiingo', 'alphavantage'));

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
          AND public.asset_provider_symbols.mapping_status IN ('verified', 'failed')
        THEN public.asset_provider_symbols.mapping_status
        ELSE 'derived'
      END,
      last_verified_at = CASE
        WHEN public.asset_provider_symbols.provider_symbol = EXCLUDED.provider_symbol
          AND public.asset_provider_symbols.mapping_status = 'verified'
        THEN public.asset_provider_symbols.last_verified_at
        ELSE NULL
      END,
      last_error = CASE
        WHEN public.asset_provider_symbols.provider_symbol = EXCLUDED.provider_symbol
          AND public.asset_provider_symbols.mapping_status = 'failed'
        THEN public.asset_provider_symbols.last_error
        ELSE NULL
      END,
      metadata = EXCLUDED.metadata,
      updated_at = now();
  END LOOP;

  RETURN NEW;
END;
$$;
