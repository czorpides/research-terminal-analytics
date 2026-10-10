# Phase 2 — Financial and earnings data recovery

## Production evidence snapshot (10 October 2026)

The real Lovable Cloud Supabase project (not Railway's staging database) contains:

- 3,000 active equities, most with prices through 9 October 2026.
- 32 canonical annual filing rows for just 8 equities and 416 associated facts.
- 405 latest fundamental metric rows for 32 equities; 788 recorded metric observations.
- 0 `fundamentals_annual` and 0 `fundamentals_quarterly` legacy statement rows. Those are distinct from the canonical filing/facts ledger.
- 0 `earnings_events` records and no acceptable forward EPS actual-versus-consensus history.
- 25 abandoned `ingestion_runs` in `running` state (many weeks old); the latest completed successful fundamentals run dates to August.
- FMP `key-metrics-ttm` recorded HTTP 402 entitlement denial on the current quota date.
- Alpha Vantage returns premium-access notices for certain endpoints; its earnings-calendar integration is already wired into `syncReleaseCalendar`, but no usable events have been persisted.

The **fundamentals cron job status "succeeded" is not a data-ingestion success**; `pg_cron` can succeed by enqueueing `net.http_post`, while the eventual HTTP handler can fail, time out or return a blocked summary.

## Phase 2A: implemented

- Add server-only `fundamentals_pipeline_health` view and a measured Data Health panel. Do not use 200 HTTP responses or a successful cron execution as a proxy for provider access.
- Fail the fundamentals API request with explicit 503 if the paid FMP metrics endpoint is blocked, 502 for all errors, 207 for partial batches, 424 for no usable records, and 200 only for an observed successful batch.
- Avoid expensive full-universe fundamental rescoring when zero records were ingested.
- Suppress subsequent calls to the same paid FMP endpoint after its HTTP 402 is documented for the current quota date. Do **not** block unrelated FMP endpoints.
- Reconcile only stale six-hour-old incomplete fundamentals run markers, without rewriting any financial observations.
- Unit-test failure statuses and leave security, market prices, legacy ingestion schedules and previous trading scores untouched.

## Phase 2B: required before claiming recovered data

1. Establish an **eligible** financial-data source. Verify entitlement and rate limits explicitly for canonical income statement, balance sheet and cash flow histories. FMP paid endpoints require a supported plan; do not work around a provider paywall.
2. Prefer free official SEC EDGAR XBRL/CompanyFacts for covered US filers, conditional on a valid contact User-Agent and conservative report-aware parsing. Map CIK and `accession` to the internal company identity. Never backdate late restatements; keep immutable first-known timestamps.
3. If a supplementary paid provider is needed for overseas listings or forward analyst estimates, document account costs, universe coverage and permitted use before subscribing. Do not synthesize analyst estimates or earnings dates from unrelated figures.
4. For upcoming earnings events, prefer first-party issuer/exchange calendars or a licensed provider; validate publication date, timezone/date precision, active stock identity and completeness. The existing Alpha Vantage calendar path remains unavailable until its entitlement is fixed.
5. Introduce bounded provider-independent ingestion with retry ceilings, IDempotent filing keys, as-of timestamps, verified source URLs, and reconciled terminal run statuses. Measure coverage *before and after* and ensure unsupported metrics remain unknown rather than normalised to 50/100 scores.
6. Backtest point-in-time earnings and filings only when original ingestion/known-at provenance is available. Avoid attributing new signals to dates before they could have been observed.

## Acceptance gates

- Measured improvement in canonical filing coverage, not just an increase in API calls.
- 0 long-abandoned `running` records after cleanup, provider denials clearly shown, and earnings-event count accurately reported.
- New SEC filings show official acceptance/accession data, with audited sample values.
- Any future dates or surprises must be provider-backed, no fabricated EPS forecasts.
- Swing/Opportunity Radars continue loading and rank calculations remain unchanged unless separately validated.
