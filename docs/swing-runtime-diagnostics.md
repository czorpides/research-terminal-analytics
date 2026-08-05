# Swing runtime diagnostics

Use the authenticated runtime diagnostic endpoint after deploying this branch/PR to distinguish database deployment faults from FMP provider limitations.

`POST /api/public/swing/diagnostics`

Required header: the same Supabase publishable `apikey` used by the existing public ingestion jobs.

Optional query parameters:

- `exchanges=NASDAQ,NYSE,LSE` to choose screener probes. The default is NASDAQ, NYSE and LSE.
- `probeBulk=1` to make one FMP EOD Bulk entitlement probe for the previous UTC business date.

The response reports:

- active equity count in `assets`
- availability and row counts for `equity_technical_screen`
- availability and row counts for Swing tracker setup/snapshot tables
- availability and row counts for `swing_monitor_runs`
- availability and row counts for `equity_eod_backfill_queue`
- FMP company-screener HTTP status and returned row count per exchange using the production universe filters and a requested limit of 1,000
- optional FMP EOD Bulk HTTP status and returned row count
- plain-language interpretation of likely deployment/provider faults

Do not log or return either the Supabase publishable key or FMP API key in diagnostics.