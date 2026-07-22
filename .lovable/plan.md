## Recurring US Growth pipeline — proposal (awaiting approval before activation)

### Cadence (release-calendar aware, UTC)

| Window | Cron | Indicators polled | Rationale |
|---|---|---|---|
| **Weekly claims window** | `30 12,13,14 * * 4` (Thu 12:30 / 13:30 / 14:30 UTC) | ICSA | ICSA releases Thu 08:30 ET (12:30/13:30 UTC seasonal). Three attempts covers DST + occasional delay. |
| **Monthly payrolls window** | `0 13,14,15 * * 5` on ISO week containing 1st Fri | PAYEMS | Nonfarm Payrolls first Friday 08:30 ET. Gate inside handler on `day_of_month ≤ 7`. |
| **Monthly mid-month window** | `0 13,14,15 13-20 * *` | INDPRO, RSAFS, HOUST | Retail Sales ~14-16th, Housing Starts ~17-19th, Industrial Production ~15-17th, all 08:30/09:15 ET. |
| **Daily safety poll** | `0 6 * * *` | all 5 | Cheap DB read + hash compare; only fires FRED calls if release calendar says an indicator is due but was missed. |
| **Weekly revision sweep** | `0 5 * * 0` | all 5, `years=2` | Detects late revisions to prior vintages (ALFRED-style revisions FRED backfills into latest series). |

All schedules call the existing `POST /api/public/ingest/us-growth-fred?pipeline=1` — no new endpoints. Manual admin trigger stays unchanged.

### Expected monthly volume

| Call type | FRED reads/mo | Fly.io Kalman calls/mo |
|---|---:|---:|
| Weekly ICSA (4-5 Thu × 3 attempts) | ~15 | 4-5 (hash changes once/week) |
| Monthly payrolls (1 Fri × 3 attempts) | 3 | 1 |
| Mid-month monthlies (8 days × 3 × 3 indicators) | 72 | 3 (one per indicator per month) |
| Daily safety poll | 150 (5 × 30, mostly no-op) | 0-2 (only on missed release) |
| Weekly revision sweep | 20 (5 × 4) | 0-2 (rare revision) |
| **Total** | **~260 FRED requests/mo** | **~10-13 Fly.io calls/mo** |

FRED is unmetered for personal keys. Fly.io analytics service usage stays negligible (<15 short calls/month).

### Correctness guarantees (already in `growth-pipeline.server.ts`)

- Deterministic input hash over `(indicator, date, value)` tuples.
- Kalman skipped when `inputHash === priorHash` (no duplicate `model_runs` / `model_outputs`).
- Per-indicator try/catch — one failure marks that indicator `skipped`, others continue; run status = `partial` or `success`.
- Vintage-aware writes to `raw_observations` + `data_vintages`, upsert on unique key prevents duplicate observations.
- Timings recorded per indicator into `model_runs.diagnostics` (`ingest_ms`, `transform_ms`, `kalman_ms`).

### Staleness / failure surfacing

Extend Stage 1 Health panel + new `data_health_alerts` view driven by:

- **Stale**: `max(observation_date)` older than release-calendar `expected_next + 48h grace`.
- **Failed run**: any `model_runs` row with `status='failed'` in the last 24h, or `status='partial'` where `indicators_skipped > 0`.
- **Silent cron**: no `model_runs` for `growth_engine.us.kalman_llt` in the last 26h.

Alerts render as amber (stale/partial) / red (failed/silent) badges on `/data-health` and at the top of every US Growth panel.

### Technical implementation

1. New `src/lib/analytics/cron-guard.server.ts` — release-calendar check that decides which indicators to poll for a given call, so the shared endpoint can be reused by all cron rows without wasteful full sweeps.
2. Extend `POST /api/public/ingest/us-growth-fred` with `?scope=weekly|monthly|payrolls|safety|revisions` — routes to the appropriate subset via the guard. Manual `?force=1` still runs everything.
3. Diagnostics: record `ingest_ms`, `transform_ms`, `kalman_ms` per indicator into `model_runs.diagnostics`.
4. Register 5 `pg_cron` jobs above using the stable dev URL until publish, then the production URL.
5. Migration adds `data_health_alerts` view (SELECT-only, `TO authenticated`) reading from `raw_observations`, `release_calendars`, `indicator_registry`, `model_runs`.
6. Wire alert badges into `/data-health` Stage 1 panel and `macro.growth.tsx` header.

### Not in scope
- PCA / HMM stay inactive.
- No new indicators, no new engines, no ALFRED point-in-time upgrade.
- No changes to manual admin controls.

### To activate after approval
Reply "activate" (or with cadence tweaks). Cron rows will be installed via `supabase--insert`, alerts view via migration, and I'll trigger one dry-run call per scope to confirm each fires cleanly.
