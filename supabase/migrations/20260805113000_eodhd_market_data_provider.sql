-- Register EODHD as the primary scalable market-data source while leaving the
-- production universe/EOD jobs paused until the live capability diagnostic has
-- confirmed that the configured key has the paid All World EOD entitlement.
-- Swing monitoring remains active and continues to use the existing quote path.

INSERT INTO public.data_sources (
  name,
  provider_code,
  tier,
  base_url,
  api_docs_url,
  active,
  notes
)
VALUES (
  'EOD Historical Data',
  'eodhd',
  'tier3_reputable',
  'https://eodhd.com/api',
  'https://eodhd.com/financial-apis',
  true,
  'Primary managed-equity reference and whole-exchange EOD/history provider. Production schedules stay gated until entitlement diagnostics pass.'
)
ON CONFLICT (provider_code) DO UPDATE SET
  name = EXCLUDED.name,
  tier = EXCLUDED.tier,
  base_url = EXCLUDED.base_url,
  api_docs_url = EXCLUDED.api_docs_url,
  active = EXCLUDED.active,
  notes = EXCLUDED.notes;

-- The previous repair migration may have recreated FMP-oriented market-data
-- schedules. Keep all universe/bulk maintenance paused until the EODHD account
-- diagnostic confirms dailyRateLimit and the bulk endpoint entitlement.
DO $$
DECLARE
  existing_job RECORD;
BEGIN
  FOR existing_job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN (
      'equity-universe-refresh',
      'equity-universe-monday-recovery',
      'equity-eod-bulk-refresh',
      'equity-eod-bulk-backfill'
    )
  LOOP
    PERFORM cron.unschedule(existing_job.jobid);
  END LOOP;
END $$;

-- Keep the existing runtime tables reproducible and explicitly accessible to
-- the server-side service role even if older migrations were only partially
-- applied in another environment.
GRANT ALL ON public.swing_trade_setups TO service_role;
GRANT ALL ON public.swing_trade_price_snapshots TO service_role;
GRANT ALL ON public.swing_monitor_runs TO service_role;
GRANT ALL ON public.equity_technical_screen TO service_role;
GRANT ALL ON public.equity_eod_backfill_queue TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.swing_trade_price_snapshots_id_seq TO service_role;

REVOKE EXECUTE ON FUNCTION public.refresh_equity_technical_screen() FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_equity_technical_screen() TO service_role;