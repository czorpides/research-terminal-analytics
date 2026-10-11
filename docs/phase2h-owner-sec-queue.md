# Phase 2H — Durable, owner-approved SEC 10-K queue

## Prior production baseline (11 October 2026)

Following three controlled manual waves: **31 issuers**, **93 original 10-Ks**, **909 SEC facts**, each issuer with three consecutive fiscal periods and zero internal ledger structural flags. The SEC dataset still has model-semantic exceptions (see AVGO issue #83); the new queue does **not** release financial facts into any live trading scores.

## Design and security

**One approved ten-name wave at a time.** Owner visits Data Health, clicks the existing preview, then clicks **Queue up to 10 for background processing**. The server re-reads official SEC coverage, curated 100-symbol identities, cooldown and QA constraints, and **requires the exact current candidate IDs**, not client-chosen symbols/CIKs.

Transaction-scoped stored procedure `sec_queue_enqueue` validates 1–10 unique active USD US-listed issuers with **no existing original SEC filings**, no structural flags and no concurrent queued/running assets. It records an owner UUID, up to ten jobs, and ordered immutable asset IDs.

Worker authentication is a **random 256-bit token generated entirely inside the production database**, readable only by service-role code and PostgreSQL worker dispatcher, never embedded in Git or browser JavaScript. SEC jobs are not claimable via ordinary owner endpoints. The worker processes one asset per invocation via the existing, point-in-time-preserving `recoverSecAnnualFacts([assetId])` function.

`sec_queue_claim()` atomically:
- locks a global short transaction advisory mutex and selected job row,
- ensures at most one active nonexpired source lease,
- claims oldest due job with `FOR UPDATE SKIP LOCKED`,
- grants a five-minute lease and increments attempts (max three).

`sec_queue_complete()` requires the exact lease token and a still-live lease to persist outcome. A crashed worker is reclaimed after the lease expires, with a maximum of three attempts. Retries only transient SEC 429/5xx, fetch failures/timeouts; bounded backoff of 2 and 4 minutes. Semantic/data-quality faults terminate the issuer as `partial` or `failed` for operator review, never silently fabricate missing facts.

The run retains individual issuer counts, source errors, attempts, timestamps, final wave state and owner pause/resume/cancel decisions; completed original SEC filings are idempotently skipped. Cancel prevents future claims but cannot roll back an issuer already executing.

### Dispatcher is not a source schedule

A one-minute infrastructure cron tick is available in `supabase/operations/phase2h_activate_owner_queue.sql`, but it performs an HTTP request **only if owner-approved database jobs are due and no active lease exists**. No periodic SEC universe discovery, standing provider ingestion, automatic 100-name expansion or Radar recalculation is enabled. No app/browser needs to remain open after wave creation.

## Release order and smoke gates

1. Merge **only after green** GitHub CI, SEC parser/queue policy regression tests, Vite build/TS, analytics tests and Docker. Deploy application and independently confirm the new owner and worker endpoints resolve.
2. Apply **schema/storage** migration to Lovable Cloud production (NOT the separate staging Supabase project). Confirm both queue tables and service-only RPCs exist; `anon` and `authenticated` have no direct table/RPC privileges. Ensure the generated worker credential is never printed in tickets/logs or client responses.
3. Verify unauthenticated queue GET/POST rejected and worker POST requires exact worker token. Test a no-work worker call (no SEC fetch), preferably using authorized ops tooling. No owner batches are to be launched during smoke without an explicit approve action.
4. **Only then** execute `supabase/operations/phase2h_activate_owner_queue.sql` on Lovable Cloud production. Verify exactly one `sec-owner-queue-tick` cron job exists. Its query checks for due owner-approved work before any outbound HTTP dispatch.
5. Owner previews and explicitly queues up to 10 companies. Immediately close the browser if desired. Return after 5–15 minutes; verify each job progress, 3 original consecutive 10-K periods, actual first-observed timestamps, and no structural QA flags.
6. Pause/resume and forced transient-error lease recovery must be tested in a **transactional synthetic/isolated environment**, not by corrupting live filings. Confirm no double processing, orphaned locks, endless retries, or missing completion.
7. If reliable, owner may approve a second wave; never auto-queue subsequent waves. Address missing fiscal metrics separately from source ingestion.

## Failure controls / rollback

- Unpublish or disable `sec-owner-queue-tick` immediately with `SELECT cron.unschedule('sec-owner-queue-tick');`. Existing stored queue work and facts persist and are not overwritten.
- Previously leased workers may finish; pause/cancel active waves from Data Health and wait for lease expiry.
- Preserve tables and original filings for audit. Don't drop queue records or mutate financial facts to work around a failed rollout.
- No provider entitlement upgrades required. Serverless runtime must support a single SEC issuer request within the five-minute lease.
- This phase **does not** reconcile all financial statement figures nor activate valuation/quality score ingestion.
