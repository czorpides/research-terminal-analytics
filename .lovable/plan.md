# Phase 3 — Equity universe, daily prices, and the first real scores

Phase 1 laid the foundation. Phase 2 proved the ingestion → reliability → verify pipeline works end-to-end on FRED macro data. Phase 3 extends that same pipeline to **equities**: a curated asset universe, daily prices, and the first deterministic scores that light up the Opportunity Radar and Screeners sections with real, auditable numbers.

We stay on free, reliable data (Stooq for daily EOD prices — no key, no rate-limit drama) so we can prove the pattern before paying for anything. Fundamentals, intraday, and news come in later phases.

## What Phase 3 delivers

1. **Curated equity universe** — seed ~50–100 liquid US tickers (large-cap + a few ETFs like SPY/QQQ/IWM) into `assets`, linked to industries and countries. This becomes the working set for radar/screeners.
2. **Stooq price ingestion (Tier 2 source)** — a resilient server-side client that fetches daily OHLCV per ticker, appends to `prices_daily` with per-row confidence, and logs to `ingestion_runs`. Cron runs after US close.
3. **Deterministic scoring engine** — first three scores computed from `prices_daily` only (no fundamentals yet):
   - **Momentum** (12-1 month return, risk-adjusted)
   - **Trend** (price vs 50/200 MA, MA slope)
   - **Volatility regime** (realised vol vs 1y median, drawdown from 52w high)
   Every score is stamped with `calc_version`, inputs, and a confidence penalty from missing/stale data.
4. **Opportunity Radar goes live** — the `/radar` page reads real scores, ranks the universe, and renders one `ResearchPanel` per top candidate with metrics, evidence rows (Tier 2 Stooq), positives/deductions, and an auto-verify chain (e.g. "trend up on both 50 and 200 MA", "price within 5% of 52w high").
5. **Screeners v1** — the `/screeners` page gets 3 saved deterministic screens: "Momentum leaders", "Oversold quality", "Fresh 52w highs on volume". Each row is a live scored asset with a confidence badge.
6. **Verify chain extended to equities** — new `verify_check_definitions` for the price-based checks; the existing algo → api → AI executor runs them on ingest and on the 30-min cron.
7. **Data Health picks up the new source** — Stooq appears alongside FRED with its own freshness policy, run history, and error rate.

Out of scope for Phase 3 (still later): auth, fundamentals, intraday, news, alerts firing, alt-data, historical event engine, thesis workflow, Command Centre synthesis.

## Technical details

**New source**: Stooq daily CSV (`https://stooq.com/q/d/l/?s=<ticker>.us&i=d`) — no API key, Tier 2 (public aggregator).

**New files**
- `src/lib/ingestion/stooq/client.server.ts` — CSV fetcher with retry, UA header, empty-response detection.
- `src/lib/ingestion/stooq/universe.ts` — curated ticker list with industry/country mapping.
- `src/lib/ingestion/stooq/ingest.server.ts` + `ingest.functions.ts` — per-ticker ingest, diff against last `as_of`, append to `prices_daily`, close `ingestion_runs`, trigger verify.
- `src/routes/api/public/ingest/stooq.ts` — public anon-key endpoint (`?ticker=AAPL` or full-universe run).
- `src/lib/scoring/momentum.server.ts`, `trend.server.ts`, `volatility.server.ts` — pure deterministic functions taking a price series and returning `{ value, inputs, calcVersion, confidencePenalties }`.
- `src/lib/scoring/run.server.ts` + `run.functions.ts` — scores every asset in the universe, upserts into `scores` with `as_of`, `calc_version`, `confidence`.
- `src/lib/panels/radar.functions.ts` — top-N ranked panels for `/radar`.
- `src/lib/panels/screeners.functions.ts` — three saved screens.
- `src/routes/radar.tsx`, `src/routes/screeners.tsx` — swap mocks for live queries.

**New migration**
- Insert `data_sources` row for Stooq (Tier 2, `provider_code='stooq'`).
- Insert `source_freshness_policies` for `equity_price_daily`.
- Seed ~50–100 `assets` rows + link to `industries`.
- Add `verify_check_definitions` for the new equity checks (trend, MA cross, 52w-high proximity, vol regime).
- pg_cron: `stooq-daily-ingest` at 22:30 UTC (after US close) and `scores-daily-recompute` at 23:00 UTC.

## Verification before hand-off

- `bun run build` passes.
- Hitting `POST /api/public/ingest/stooq?ticker=AAPL` inserts rows into `prices_daily` and closes an `ingestion_runs` row with `status='success'`.
- The scoring runner produces `scores` rows for every asset with non-null `confidence` and a `calc_version` stamp.
- `/radar` renders at least 10 ranked panels with real metrics, Tier 2 Stooq evidence rows, and at least one verify check that has flipped from pending to pass/fail.
- `/screeners` shows the three screens with live ranked rows.
- `/data-health` shows Stooq as active with a recent successful run and rows_ingested > 0, and the Verifier audit trail includes equity-check runs.

## What to prepare on your side

Nothing — Stooq needs no key. Just approve the plan and I'll ship it.
