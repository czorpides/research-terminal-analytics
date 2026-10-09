# Catalyst Intelligence — Staging source integration

This work extends, rather than replaces, the macro/industry catalyst engine, Swing catalyst context, Release Calendar and Historical Event Studies.

## Current state

- Standalone **/catalysts** page reads the company-specific `catalyst_events` ledger through a server-only client.
- Anonymous browser access is read-only. New event intake is authorised with `INTERNAL_JOB_TOKEN`; verifying/rejecting an event requires a **different** `CATALYST_REVIEW_TOKEN`.
- Events are categorised as index inclusion, earnings expectations, earnings results, government contracts, or political statements.
- Each event stores a canonical key, SEC/official link, initial publication/knowledge time, first ingested time, source tier, verification, direction, materiality, novelty and expiry.
- Verified-only **shadow** scores do **not** change existing Swing or Opportunity Radar rankings. Missing information is **unknown**, not an automatic catalyst score of 50.
- Source freshness: short, event-specific decay, and no look-ahead at times earlier than public knowledge and verification.
- As of this migration, no invented seed events and no implied production live feed.

## SEC EDGAR earnings filing provider (available after configuration)

The first read-only source is the **SEC's official submissions API**. It polls up to eight US symbols per run and classifies only `8-K` filings that explicitly contain Item `2.02`. These are **unverified candidates** indicating an announcement of earnings/operating results, **not earnings beats, upward revisions or government contract awards**.

EDGAR docs: https://www.sec.gov/search-filings/edgar-application-programming-interfaces

The SEC requires an identifying User-Agent and fair-access use. Add this **server-only** Railway staging variable directly in the Railway dashboard:

`SEC_EDGAR_USER_AGENT=ResearchTerminal/1.0 (real-reachable-contact@your-domain)`

Use a real, reachable contact; do not copy the example address. This value is not a password but should not be exposed to browser bundles. The worker refuses to run if missing. No API subscription is required. The worker polls sequentially with at least a 650 ms gap between company submissions requests, well below the SEC's total 10/s access guideline.

Run the token-protected endpoint:

`POST /api/public/catalysts/ingest-sec`

Body example:

```json
{"symbols":["QCOM","PENG","BE","AAOI","INTC","NBIS"],"lookbackDays":45}
```

Header: `Authorization: Bearer <INTERNAL_JOB_TOKEN>` (never place the actual secret in this repository, frontend or logs).

Failures, unmapped symbols and withheld classifications are reported; ingestion never changes existing human review status.

## Independent review

To activate verification, configure `CATALYST_REVIEW_TOKEN` as a **separate**, randomly generated server-only token of at least 32 bytes. Don't reuse the ingest token.

`POST /api/public/catalysts/review` with that reviewer bearer token and a body:

```json
{"event_key":"sec:earnings:000080432826000123","decision":"verified","verification_note":"Reviewed actual SEC 8-K, EPS outcome and company announcement against verified sources"}
```

The example is **illustrative**, not an actual verified filing. Before approving any candidate, review the document and attach actual surprise/guidance evidence. `earnings_result` with unknown direction **cannot** create an upside signal even after a verification action, until the actual event record is correctly substantiated. Verification is an audited decision but not a guarantee of data quality. A separate admin UI and role-bound reviewer workflow is still planned.

## Not completed

1. Configure the SEC User-Agent; run and confirm the first genuine intake.
2. Connect official S&P DJI index announcements, reported/consensus estimates, government award systems (with entity matching), and public political statements with attribution. Each needs a dedicated source adapter and review tests.
3. Restore current market data, secure licensed analyst-consensus access and refresh the existing earnings release scheduler.
4. Create schedule/cron orchestration with bounded retries and rate-limit/backoff. The new worker is manually triggerable, **not yet scheduled**.
5. Measure feed completeness/latency, deduplication accuracy, analyst review quality and false positives; then run historical, time-of-knowledge shadow studies before changing the existing trade-rank formulas.
6. Reintroduce production login, role-based reviewer authorisation and backend rate/cost limits before opening any source or admin controls to external users.

**Scope:** additive staging migration and feature branch. Original Lovable cloud deployment and legacy production jobs remain untouched.
