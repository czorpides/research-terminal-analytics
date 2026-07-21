## Sequencing (per your answers)

1. **Native macro APIs** (this pass) — ONS, ECB SDW, HMRC.
2. **Ensemble nowcasts** (next pass) — AR(1) + Holt-Winters + drift with confidence bands.
3. **Auth + per-user zones** (pass after) — email/password + Google, then zone editor.

Only pass 1 ships in this build. Passes 2 and 3 are scoped here so you can approve the shape.

---

## Pass 1 — Native ONS / ECB SDW / HMRC ingestion

### Providers

- **ECB SDW** (`data-api.ecb.europa.eu/service/data/{flow}/{key}`). No key required. CSV/JSON. Replaces the FRED-mirrored EA rates, HICP, unemployment, 10Y yield.
- **ONS Beta API** (`api.beta.ons.gov.uk/v1/datasets/...`). No key required. Replaces UK CPI, unemployment, GDP.
- **BoE IADB** (`www.bankofengland.co.uk/boeapps/iadb/fromshowcolumns.asp?csv.x=yes&SeriesCodes=...`). No key. Replaces SONIA / Bank Rate / gilt yields.
- **HMRC** — real business-payments series come from HMRC's monthly bulletin (VAT receipts, PAYE, self-assessment) via HMRC's stats API (`www.gov.uk/government/statistics` JSON feeds). No key. New category previously flagged `partial_coverage`.

No new secrets needed — all four are public open-data endpoints.

### Provider abstraction

- New folder `src/lib/ingestion/macro-native/` with one client per source (`ecb.server.ts`, `ons.server.ts`, `boe.server.ts`, `hmrc.server.ts`). Each exports `fetchSeries(id, opts) → { date, value }[]` matching the FRED shape so the ingest runner is source-agnostic.
- Add `provider` and `provider_series_code` columns to a small registry (`macro_native_series`) so the same `economic_indicators` row can be sourced from any of the four providers.
- Migration adds one row per indicator with `provider = 'ecb' | 'ons' | 'boe' | 'hmrc'`. Existing FRED-sourced UK/EA rows are demoted to fallback (kept for backfill continuity, hidden from panel selection when a native row exists).

### Ingest runner + endpoint

- `src/lib/ingestion/macro-native/ingest.server.ts` — mirrors the FRED runner shape (dedupe on `(indicator_id, ts)`, writes `ingestion_runs`, respects freshness policies).
- Public route `POST /api/public/ingest/macro-native` with anon-key auth (same pattern as `fred.ts`).
- Register three pg_cron jobs:
  - `ecb-daily-06:00`
  - `ons-daily-06:10`
  - `boe-daily-06:20`
  - `hmrc-monthly-15th-06:30`

### Panel wiring

- `macro.functions.ts` prefers a native indicator when both exist; falls back to FRED silently.
- Each panel's evidence list picks up the native source name and Tier 1 badge automatically via the existing `data_sources` lookup.

### HMRC business-payments panel

- New `macro-business` panel becomes real (was `partial_coverage`): VAT receipts YoY, PAYE receipts YoY, self-assessment receipts. Includes 5-year chart + zone bands (`warn` at YoY < 0, `bad` at YoY < -5%).

### Verify chain

- Reuse the existing `algo → api → ai` executor. New algo runner: `nativeVsFredParity` — compares native and FRED values on overlapping dates and fails the check if divergence > 25 bps (rates) or > 0.3 pp (inflation/unemployment). Surfaces provenance drift automatically.

---

## Pass 2 — Ensemble nowcasts (deferred)

Replaces `linearProjection` in `TrendChart.tsx` with `src/lib/forecast/ensemble.ts`:

- `ar1(points)` — one-lag autoregressive with OLS fit
- `holtWinters(points, seasonLength)` — additive, α/β/γ chosen by grid-search minimising in-sample RMSE
- `drift(points)` — random-walk-with-drift baseline
- `ensemble(points, horizon)` → `{ mean: ChartPoint[], lo: ChartPoint[], hi: ChartPoint[] }` where lo/hi come from ±1σ across the three model outputs.

`TrendSeries.projection` stays a `ChartPoint[]` for compatibility; new optional `projectionBand: { lo, hi }` renders a shaded cone. Server-computed only.

---

## Pass 3 — Auth + per-user zones (deferred)

- Enable email/password + Google via `configure_auth` + `configure_social_auth`.
- Managed `_authenticated/route.tsx` layout, public `/auth` page, session-aware header.
- `profiles` table (display name, avatar) + trigger.
- `user_zone_overrides(user_id, indicator_id, zones jsonb)` with RLS `auth.uid() = user_id`.
- Zone editor sheet accessible from any `TrendChart`; falls back to registry defaults when no override.

---

## What ships this build

Pass 1 only: 4 native providers, migration, ingest runner, cron jobs, native-preferred panel wiring, HMRC business panel, parity verify runner. No changes to auth or the projection engine yet.
