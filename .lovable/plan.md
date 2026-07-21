
## Why this is needed

Diagnosis of the live database (today = 2026-07-21):

- Only **2 of 13 scheduled refresh jobs** actually ran in the past week — `verify-runner-every-30m` and one `ingest-commodities-daily`. Every other job (FRED, Stooq prices, fundamentals, alt-data, ECB/BoE/ONS/HMRC, scores, undervaluation refresh) has **no run history at all**. That is why charts trail off in older months: the pipeline is silently stalled.
- `commodity_prices`, `alt_data_signals`, and `fundamentals_quarterly` tables currently hold **0 rows**, even though the ingest endpoints exist — data is being written to `data_points` only, so the dedicated tables (and any chart that reads them) look empty.
- Chart series use `slice(-tail)` on whatever is in the DB, so they honestly represent the latest observation. The issue isn't the chart — it's that the latest observation is stale because the crons aren't firing.
- There is no watchdog: if a job dies, nothing surfaces it until a user notices a flat line.

## What to build

### 1. Repair the scheduler (root cause)

- Re-register all 13 cron jobs with a single idempotent migration/insert so they exist against the current `pg_cron` schema, using the stable `project--<id>.lovable.app` URL (no preview URLs, which have been observed to churn).
- Add a `heartbeat` job (`*/5 * * * *`) that writes to a new `cron_heartbeat` table. If we ever see the same silent-drop pattern again, this table proves whether `pg_cron` itself stopped or whether individual jobs failed.
- Add explicit `EXCEPTION` capture in each cron command so failures land in `cron.job_run_details.return_message` instead of vanishing.

### 2. Per-source refresh cadences

Wire each source to the cadence that matches its true update frequency, not a blanket daily job.

| Source | Cadence | Cron |
| --- | --- | --- |
| Equity prices (Stooq/Tiingo/FMP intraday) | Every 15 min during US market hours | `*/15 13-21 * * 1-5` |
| Equity prices end-of-day reconciliation | Daily 22:30 UTC weekdays | `30 22 * * 1-5` |
| Commodity spot prices | Hourly 24/7 | `0 * * * *` |
| FX rates | Hourly | `5 * * * *` |
| FRED macro (daily series) | Daily 07:15 UTC | existing |
| ECB / BoE / ONS native macro | Daily 06:00–06:20 UTC | existing |
| HMRC receipts | Monthly 15th 06:30 UTC | existing |
| Fundamentals (quarterly filings) | Daily 06:15 UTC (cheap, only writes on new filing) | existing |
| Wikipedia attention | Daily 06:15 UTC | existing |
| Scores composite | Every 30 min | `*/30 * * * *` |
| Undervaluation / overvaluation refresh | Every 6 h | `0 */6 * * *` |
| Verify runner | Every 30 min | existing |

### 3. Fix the empty dedicated tables

- Update `ingest/commodities`, `ingest/altdata`, and `ingest/fundamentals` to write to their **dedicated tables** (`commodity_prices`, `alt_data_signals`, `fundamentals_quarterly`) in addition to the generic `data_points` mirror. Panels that read these tables will then populate.
- Backfill with a one-shot `POST /api/public/ingest/backfill?source=…` call per source, invoked immediately after deploy.

### 4. Guarantee charts extend to today

- Add a shared helper `extendSeriesToToday(points, cadence)` used by every panel builder. For daily series it forward-fills with the last observed value (marked `stale=true`) up to today so the x-axis always ends at "today"; for quarterly series it extends to the current quarter-end. Stale-filled points render as a lighter dashed segment so the visual doesn't lie about freshness.
- Update `TrendChart` to render that dashed "stale tail" style and to always compute `xDomain[1] = today`.

### 5. Freshness watchdog + surfaced in Data Health

- New table `source_freshness_expectations(source_code, max_lag_minutes, cadence)`.
- New server function `computeFreshness()` that joins each source's latest `as_of` against expectations and returns `fresh | lagging | stale | dead`.
- Data Health page adds a "Freshness" panel with a row per source, its expected cadence, actual lag, and last successful cron run — so silent failures are immediately visible.
- Alerts: any source in `stale` or `dead` state auto-creates an alert row.

### 6. Verification after deploy

- Trigger every ingest endpoint once via `net.http_post` from a supabase insert to backfill immediately.
- Read `MAX(as_of)` per source and confirm all are within their expected lag window.
- Load `/macro`, `/radar`, `/data-health` and confirm every chart line reaches today.

## Technical notes

- Files touched: `src/lib/panels/contract.ts` (add `stale` flag on points), `src/components/research/TrendChart.tsx` (dashed stale tail, today-anchored xDomain), `src/lib/freshness/*` (new), `src/routes/_authenticated/data-health.tsx`, all `src/lib/ingestion/*/ingest.server.ts` (dual-write to dedicated tables), one new migration for `cron_heartbeat` + `source_freshness_expectations`, and one Supabase insert re-registering every cron job against the stable prod URL.
- No schema-breaking changes; existing `data_points` writes are preserved.
- Intraday equity refresh will consume more provider quota — the existing `provider_quotas` gate already caps FMP/Tiingo, so we stay within free tiers.
