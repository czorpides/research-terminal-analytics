
# Phase 2 — First live data source: FRED (US macro)

Auth is deferred as agreed. Phase 2 wires the **first real data provider** — the St. Louis Fed's FRED — through the Phase 1 reliability framework and lights up the Macro section with live, auditable numbers. This proves the whole pipeline end-to-end (source → ingestion → `data_points` → panel contract → confidence) on the cheapest, most reliable dataset we can get.

Also picks up the small change you just asked for: **"Verify next" is now a first-class typed check** with a verifier (algo / api / ai / manual) and a status (pending / pass / fail / stale / unavailable). Every future check plugs into the same shape.

## What Phase 2 delivers

1. **FRED integration** — a Tier 1 provider registered in `data_sources`, with an `INGEST_FRED_API_KEY` secret and a resilient fetch client (retries, rate-limit handling, structured errors).
2. **Ingestion server functions** for a curated starter set of ~12 series (10Y, 2Y, real 10Y, DGS3MO, CPIAUCSL, CPILFESL, UNRATE, PAYEMS, INDPRO, UMCSENT, DFF, T10Y2Y). Each ingestion writes to `economic_releases` + append-only `data_points` with source_id, `as_of`, `ingested_at`, and per-row confidence via `computeConfidence(...)`.
3. **Ingestion runs logged** in `ingestion_runs` (started/finished/status/rows/error) so Data Health shows real activity.
4. **Cron scheduling** — a public `POST /api/public/ingest/fred` route (HMAC-signed) plus pg_cron entries kicking each series on its natural cadence (daily for yields, monthly for CPI/UNRATE, etc.).
5. **Live Macro panels** — Growth pulse, Inflation pulse, Yield-curve monitor, and Release surprise monitor now read `data_points` and populate metrics, evidence rows, positives/deductions, and calculation traces. Confidence is real, not mocked.
6. **First real verify-next checks** — deterministic algo checks (e.g. "10Y > 60-day MA", "yield-curve inversion holds") and API checks ("next scheduled release within 24h") run against `data_points` and stamp `status` + `checkedAt` on each panel load.
7. **Data Health section** goes live — Sources table shows FRED with last successful run, freshness, error rate; Ingestion runs list is real; Freshness policies show which categories are currently in-policy.

Out of scope (later phases): auth, equity prices, fundamentals, news, scoring, opportunity radar, historical event engine, alerts, alt-data, AI commentary.

## Technical details

**Secret**: `INGEST_FRED_API_KEY` — requested via the secret tool at the start of the phase. Free from fred.stlouisfed.org (you register, paste the key, we store it server-side).

**New files**
- `src/lib/ingestion/fred/client.server.ts` — typed FRED client (`fetchSeriesObservations`, `fetchSeriesMeta`) with retry + 429 backoff.
- `src/lib/ingestion/fred/series.ts` — curated series catalog (code, indicator_id, category, cadence).
- `src/lib/ingestion/fred/ingest.functions.ts` — `ingestFredSeries({ seriesId })` server function: fetch → diff against last `as_of` → insert new `data_points` + `economic_releases` → close `ingestion_runs` row.
- `src/routes/api/public/ingest/fred.ts` — public HMAC-verified endpoint that fans out to `ingestFredSeries` for scheduled series; also supports `?series=DGS10` for manual runs.
- `src/lib/panels/macro.functions.ts` — server functions reading `data_points` for each Macro panel and returning `PanelData` with real evidence and confidence.
- `src/lib/verify/checks.ts` + `src/lib/verify/runners.server.ts` — deterministic algo/API verify-check runners; each returns `VerifyCheck` results the panels attach.
- `src/routes/data-health.tsx` — rewritten to read `data_sources`, `ingestion_runs`, `source_freshness_policies` live.
- `src/routes/macro.tsx` — swap from mocks to server-function-loaded panels.

**New migration**
- Insert `economic_indicators` rows for the ~12 series, mapped to the FRED series codes.
- `source_freshness_policies` rows for `macro_release_daily`, `macro_release_monthly`, `macro_release_intraday`.
- pg_cron schedule rows calling the public ingestion endpoint on cadence.

**Panel data shape**
Macro panels now return `PanelData` with:
- `metrics` from the latest `data_points`,
- `evidence` = the source rows used (with FRED tier badge and real `as_of`),
- `positives`/`deductions` from small deterministic classifier functions,
- `verifyNext` populated by algo/api runners with real `status` + `checkedAt`,
- `calculation` stamped via `stampCalculation(...)` so every value is traceable.

## Verification before hand-off

- `bun run build` passes.
- With `INGEST_FRED_API_KEY` set, hitting `POST /api/public/ingest/fred?series=DGS10` inserts rows into `data_points` and closes an `ingestion_runs` row with `status='success'`.
- `/macro` renders 3–4 panels with real numbers, real timestamps, T1 FRED evidence rows, non-zero confidence, and at least one verify-check flipped from "pending" to "pass" or "fail".
- `/data-health` shows FRED as active with a recent successful run and rows_ingested > 0.
- Killing the API key and re-running shows an `ingestion_runs` row with `status='error'`, and Macro panels degrade to lower confidence with a visible penalty — no crash.

## What to prepare on your side

Get a free FRED API key at https://fredaccount.stlouisfed.org/apikeys (takes ~1 minute) and paste it when I ask — I'll store it as `INGEST_FRED_API_KEY` server-side.
