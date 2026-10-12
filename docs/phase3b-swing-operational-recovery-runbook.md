# Phase 3B — Swing operational recovery runbook

Date: 2026-10-12. Scope: safe code-level recovery controls; **no schedules, credentials, provider calls, deployment or price writes are performed by this pull request**.

## Read-only live diagnosis

| System | Verified finding |
|---|---|
| PostgreSQL pg_cron | **Zero scheduled jobs**; pg_cron and pg_net extensions installed |
| Price table | 963,394 rows for 3,016 assets; latest trade date 2026-08-08; zero October rows |
| Technical screen | 3,004 rows, dated only 2026-08-04 through 2026-08-07; **zero fresh** |
| Ingestion runs | Most recent started 2026-08-09; no October runs |
| Swing monitor | Most recent run started 2026-08-07; no October heartbeat |
| Backfill queue | 321 complete rows, most recent updated 2026-08-07, no newly queued October dates |
| Managed universe | 3,000 active equities and two commodity assets |
| Railway staging | Web service is online but deployed from feature/catalyst-intelligence-foundation at ecce20841a2fe53b7acc9472909d15047d205e20, not reviewed main |
| Market provider configuration | Railway staging has an INTERNAL_JOB_TOKEN variable name, but no EODHD_API_KEY or FMP_API_KEY variable names |
| Swing deep history | Railway logs for 9 and 11 October show PostgreSQL 57014 statement timeouts |
| RPC/index | Original get_swing_recent_price_bars RPC and prices_daily (asset_id,trade_date) index exist; a **bounded 45-bar AAOI read** succeeded |

The migrations from August 2026 contain scheduled callback commands targeting an older Lovable host and relying on a public Supabase publishable key. **Do not rerun those migrations for operational recovery.** They are not credential-safe or environment-aligned.

## Recovery stage 1: environment and credentials

1. Keep the older Railway catalyst-staging branch and its separate catalyst worker intact. Choose an approved deployment based on CI-reviewed main and record the exact immutable SHA.
2. Supply INTERNAL_JOB_TOKEN on the chosen **server**, with at least 24 private characters; the token is never stored in application source, logged, returned to a browser or passed in a URL. For future Supabase cron execution, store the *same* secret in Supabase Vault under a restricted secret name such as swing_internal_job_token, and retrieve it at invocation time. Never insert the token literal into cron.job.command.
3. Supply an entitled EODHD_API_KEY (or explicitly redesigned approved provider path) as a secure runtime variable. **No paid-provider account access was verified during Phase 3B.** Whole-market ingestion currently reserves up to 500 EODHD API units per market date across five exchange requests. Confirm the user's actual subscription and remaining quota first.
4. Deploy and check privileged callback authentication. Requests authenticated only with the Supabase publishable/anon key must return 401. Only server-to-server x-internal-job-token or Authorization Bearer with the private token is permitted on the two repaired Swing endpoints.
5. Use the existing diagnostics endpoint with the private header, starting without optional provider probes. Enabling probeEodhd or probeBulk may cause billable provider calls; confirm quota first.

## Recovery stage 2: one genuine market date, with *no automatic fallback*

Only after stage 1, manually send an authenticated POST to the reviewed runtime:

**Path:** /api/public/ingest/stooq?bulkEod=1&date=2026-10-09&fallbackLimit=0

The explicit fallbackLimit=0 suppresses the legacy default per-symbol fallback when a bulk provider call fails. This matters: transient bulk errors previously could trigger a bounded but undesirable additional 250-symbol ingestion pass. Do not invoke this call from the app or a public browser, and do not run it before provider entitlement and credential review. The endpoint is still a write-capable handler on successful verified source feeds.

Check the returned provider row totals, exchanges, ambiguous identity counts, EOD date and insertedRows. If status is failed or no_data, **do not reinterpret it as successful**. Original-date market price, close and volume need original exchange/corporate-action verification. Verify saved prices_daily source IDs and matching equity_technical_screen.as_of; never redatetime an old price. Be aware the configured EOD bulk provider may not offer arbitrary historical dates; test before promising backfill.

## Recovery stage 3: controlled catch-up and approved scheduling

- The queue currently has 321 historical completed dates and no new dates to process. After provider testing, add **only verified missing trading dates**, not weekends or hypothetical prices, under an explicitly approved bounded SQL migration. Preserve completed rows and avoid duplicated source observations.
- Process a small sequential batch, recording failures and daily API usage. The earlier 4 dates per 20 minutes may consume up to 6,000 API units per hour and should not be reactivated automatically.
- Rebuild the technical screen from verified original saved bars. Confirm at least 2,950 active equities and **95% or more** with 90+ completed bars through the required trading date.
- Only then establish one daily EOD refresh and one Swing monitor schedule, using **either** pg_cron or an approved Railway job, not both. The jobs must send the private callback token obtained from Vault/server secrets. Verify deployed host and TLS, cron execution history, HTTP results, source ingestion timestamps and the real monitor heartbeat.
- Never use old Lovable URLs or hard-coded publishable keys, and never count a configured cron row as proof that the task ran.

**Scheduling design (operator to approve, not applied by this PR):** daily EOD around 04:30 UTC Tuesday–Saturday for the previous completed trading day; Swing monitor approximately every 30 minutes during the weekday monitoring window. The exact provider publication times, session holidays, runtime and API quota must be checked before activation.

## Recovery stage 4: price-history timeout handling

The price-history reader now requests **8 symbols per RPC with up to 2 concurrent requests**. When PostgreSQL returns a verified 57014 statement timeout, only the unsuccessful group is split into smaller groups, down to one symbol; unknown/structural errors still surface. It cannot silently substitute a synthetic bar, model score or recent date. Confirm the actual 220-candidate scan on the *new deployment* before describing the runtime as healthy. Do not increase global statement timeouts as a substitute for query planning.

The pure operations-recovery-gates utility checks source credentials, entitlement, quota, private authentication, deployed SHA, bounded one-day ingest acceptance, rebuilt screen freshness, 95% coverage, scheduled jobs and fresh monitor heartbeat. The actual verified 12 October evidence fails its recovery gates. Passing CI verifies code quality only.

**Separate open work:** Swing operations [Issue #121](https://github.com/czorpides/research-terminal-analytics/issues/121); original SEC filing ledger [Issue #119](https://github.com/czorpides/research-terminal-analytics/issues/119). No live Swing/Radar score or price history was changed.
