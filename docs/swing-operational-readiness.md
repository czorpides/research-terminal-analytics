# Swing engine operational readiness

The Swing engine must fail closed. A rendered screen or a successful calculation is not enough to call the engine operational.

## Required runtime gates

The Swing tab may display **Operational** only when all required checks pass:

1. **Managed universe** — at least 2,950 active equities against the 3,000-name target.
2. **Fresh technical coverage** — at least 95% of active equities have 90+ completed OHLCV bars through the latest required business date.
3. **Outcome tracker schema** — setup and price-snapshot tables are queryable.
4. **Monitor heartbeat** — a successful Swing monitor run exists within the expected schedule window.
5. **Tracked quote freshness** — during the weekday monitor window, active frozen setups have a successful quote within two hours.
6. **Full-universe EOD pipeline** — a recent successful bulk EOD ingestion run exists.

If any required gate fails, the engine reports **Degraded** or **Offline** and the UI says signals should not be treated as fully live.

## Scalable price architecture

The old rotating per-symbol ingestion remains a bounded fallback, but it cannot keep a 3,000-name Swing universe current by itself. The operational path uses FMP's stable EOD Bulk endpoint to ingest one completed market date across the active population in a single provider request, followed by a database-native technical pre-screen.

Historical bootstrap dates are queued in `equity_eod_backfill_queue`. Small scheduled batches build enough history for the 90-session deep scan without one enormous serverless request.

If the configured FMP plan does not expose EOD Bulk, the ingestion records the provider error, the per-symbol fallback can still update a bounded slice, and the operational health gate remains **Degraded** rather than presenting partial coverage as healthy.

## Full-universe first pass

`equity_technical_screen` stores cheap, deterministic nomination evidence for every covered active equity:

- 5-session and 20-session returns
- MA20 and MA50 position
- 90-session high/low range
- relative volume
- current completed close

This layer only decides which securities deserve the more expensive Swing calculation. It does not alter the raw Setup Score.

The deep scan then evaluates up to 200 diverse candidates with the existing RSI, momentum, support/resistance, ATR, volume, confirmation and reward/risk model.

## Deployment acceptance

After merge, publish the connected Lovable deployment so the database migration and schedules are applied. Do not call the engine operational until the Swing tab's Runtime Trust Gate itself reports **Operational**.
