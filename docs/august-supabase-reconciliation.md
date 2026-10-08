# August 2026 database reconciliation — no cutover

## Current state (verified 8 October 2026)

| Table | Original Lovable DB (reported) | External Supabase (queried) |
| --- | ---: | ---: |
| assets | 3,016 | 3,016 |
| scores | 43,208 | 23,011 |
| prices_daily | 972,396 | 963,394 |
| raw_observations | 151,711 | 149,158 |
| fundamental_filings | 32 | 32 |

External price maximum: 8 August 2026 (only one price row that day).
External equity_technical_screen: 3,004 rows; 2,997 dated 7 August.
External score history uses multiple calculation versions. The count difference is
**not** a count of technical assets needing rescoring.

External readiness checks (8 October 2026): **0 users in auth.users**, **0
registered cron jobs**, **0 fresh technical-score assets** according to
`get_opportunity_radar_health()`. Last successful bulk price run was dated
8 August (for 7 August market data). The original's reported 13 August price
maximum is itself almost two months behind today's date; recovery of the
August difference does **not** constitute a current-data deployment.

Neither production traffic nor original Lovable Cloud must be redirected during
this exercise. No schema migrations, filtering changes, score deletions, or
unverified provider substitutions are part of this work.

## Before running

1. Obtain a **read-only PostgreSQL connection** to the original Lovable-managed
   project `itfwojimxuxwmxjcolzt`. Do not use an app/browser publishable key.
   If the platform cannot supply direct DB access, first export the required
   differential rows and preserve their IDs/metadata; do not claim this script
   has run. Do not pay for or invoke Lovable builds to obtain access.
2. Obtain a Postgres connection to external Supabase
   `sythouvmvdhxwbmzwpxy`. Store both connection strings in local environment
   variables, **never** GitHub, code, issue comments, PR logs or frontend env.
   Both connections should use TLS; prefer scoped roles and a disposable
   operator environment. Use a Supabase session pooler if IPv4 is required.
3. Record a fresh, restorable external-database backup/snapshot and confirm
   available storage. The tool cannot itself create a Supabase backup.
4. Install Python 3.11+ and an approved pinned psycopg 3 release in a secure
   local environment (e.g., `python -m pip install 'psycopg[binary]==3.2.9'`).

## Controlled procedure

Run `python scripts/reconcile_august_snapshot.py --since 2026-08-01` with
`RT_ORIGINAL_DATABASE_URL` and `RT_EXTERNAL_DATABASE_URL` set in the process.
This is a **read-only dry run** and prints comparison counts only, not secrets.
It verifies common parent UUIDs (assets, indicators, data sources), table
columns/types, overlapping values and date-by-date counts before 1 August.

A reported older date-bucket mismatch means widen `--since` to include that
date and run the audit again. Date-bucket counts do not prove byte-level equality
for all older prices; inspect independent hashes/checksums and important asset
samples before any eventual production switch. For raw observations, confirm
all needed `data_vintages` rows are present. Other related datasets may also
have changed: check counts and foreign keys for model outputs, ingestion runs,
fundamental facts and user-owned tables independently.

If there are **zero conflicts, zero external-only records, and zero older
date-bucket mismatches**, the insert-only stage can be executed intentionally:

```bash
python scripts/reconcile_august_snapshot.py --since 2026-08-01 \
  --apply --confirm-external=sythouvmvdhxwbmzwpxy
```

There is no `UPDATE`, `DELETE`, truncation or schema DDL. All inserted rows
are verified within a single destination transaction. Insert collisions or
verification errors roll back the transaction. Destination credentials must
have sufficient write access for the four specific tables; source must remain
read-only. Do **not** set `--apply` until you have confirmed the dry-run diff.

## After data is complete — separate authorisation/operations

1. Re-run counts and maximum trade/observation dates **against both DBs**.
   Compare source/destination prices over the overlap, sample adjusted OHLCV,
   verify model provenance and vintage chains, then assess any untracked tables.
2. Refresh `public.refresh_equity_technical_screen()` in external Supabase
   **only after** prices are complete. This function rewrites the cache and
   deletes screen entries outside the active equity universe; it is intentionally
   excluded from the insert-only script.
3. Refresh current price-derived Momentum, Trend, Stage-1 and Volatility scores
   for assets with newly arrived bars. Preserve copied historical score rows.
   Existing `get_opportunity_score_batch` keys on the latest successful bulk
   ingestion timestamp; an out-of-band DB insert does **not** automatically
   trigger its selection. Arrange a deliberately scoped rescore using existing
   scoring code and a verifiable completion record rather than fabricating
   ingestion success or modifying the Radar's investment thresholds.
4. Independently deploy the existing Docker build to a Railway **staging**
   domain connected only to external Supabase. Test login/signup/reset,
   session/RLS isolation, 3,016 assets, Radar coverage and candidate ordering,
   freshness warnings, ingest endpoints, idempotent jobs and scheduled crons.
   Ensure only one scheduler is active and all service-role secrets remain
   runtime-only. Audit public POST endpoint authentication before internet
   exposure: current `/api/public/scores/run` compares its `apikey` header
   with a publishable Supabase key, which is not a privileged secret. Verify
   ingestion routes have appropriate independent server-side protection.
5. Confirm the original project's actual user identities and auth requirements.\n   External `auth.users` has zero rows: establish secure user migration or a\n   deliberate new-account/recovery procedure and test the end-to-end flow.\n   Register and verify the required scheduled jobs; external `cron.job` is empty.\n   Resume ingestion from the last available market date through the current\n   market session and monitor provider quotas/failures before declaring\n   scores fresh. Do not create jobs while the production scheduler could\n   compete with them.\n6. **No traffic/domain cutover** until the operator explicitly authorises it
   after evidence from the above checks. Leave Lovable Cloud available as the
   rollback route.

**Known limitation:** This script requires both live PostgreSQL connections and
does not presently have them in the GitHub repository or in ChatGPT's Railway
connection. Creating the branch and script does not mean rows were synchronised.
