# Phase 2E — Bounded SEC historical recovery and coverage scale-up

## Production baseline, 11 October 2026

- Real Lovable Cloud database (not Railway staging): 62 canonical annual filings, 711 financial facts across 16 issuers from all sources.
- The first ten-company SEC cohort delivered 27 original 10-Ks and 262 source facts. JPM had only one year and META two; neither is evidence of full statement coverage.
- The SEC archive contains original JPM 10-Ks for fiscal 2023 (accession 0000019617-24-000225) and fiscal 2024 (0000019617-25-000270). Existing SEC `submissions.filings.recent` may omit those high-volume issuer filings; the archive index metadata in `submissions.filings.files` points to older official JSON indexes.

## What changed

1. An SEC issuer with fewer than three usable original 10-K fiscal years in `filings.recent` can fetch **up to four allowlisted, same-CIK** historical JSON indexes from official data.sec.gov. The files must be declared in the parent's `filings.files` metadata and end within six years. Periods are parsed conservatively, sorted newest first and de-duplicated by reporting period. Still only three latest eligible annual reports are persisted; newer quarterly, amended, missing and conflicting financial data are not substituted.
2. Ingestion_run is now marked **partial** rather than a clean success when fewer than three eligible original years can be found. The error text explains missing historical evidence and archives checked. No historical timestamp is backdated; first known is actual import time.
3. The read-only `sec_original_10k_coverage` view presents three-year coverage, latest report period, fact count and how many of four directly observed tags (revenue, net income, total assets, operating cash flow) are present in the most recent year. A four-of-four outcome is **not** complete financial statements or a suitability certification for scores.
4. The original ten-per-click, owner-JWT-gated SEC action can now select from a **curated, diversified 100-ticker pool**; it still performs at most five sequential two-issuer calls. SEC CIK/ticker matching, supported US listing/currency, source provenance, duplicate prevention, owner-only controls and no automatic jobs remain unchanged. Unsupported or unavailable ticker identities are skipped.
5. A thirty-minute pause prevents continuously retrying an issuer whose most recent SEC attempt produced zero new facts. It is not a universal provider throttle; upstream rules and the 500 ms between HTTP requests still apply.
6. **No live ranking recalculation, provider purchase or broad unattended 100-company ingest.** The browser must remain open and the owner explicitly initiate each <=10-issuer batch.

## Quality gates for further scaling

- Check application CI, data-quality pure parser tests, owner-only 401 on planner, production page render and migration RLS grants.
- Manually rerun a ten-issuer batch to investigate JPM/META 2023–2024 gaps. Confirm any new accession and original filed date against SEC; verify all direct numerical facts and point-in-time timestamps.
- Verify view reports accurately distinguish 1/2/3 years and 1–4 latest core tags. No source metric is assumed where direct tag is unavailable.
- Sample bank, technology, industrial, retail, non-calendar fiscal year-end issuers. Bank revenues, deposits, cash flows and debt cannot be interpreted with industrial Piotroski assumptions; keep scores untouched.
- After another verified cohort, use an **asynchronous database-backed queue** for >=100 companies rather than a browser loop. Queue should enforce retries, independent execution, backpressure, and persisted checkpoints, with explicit authorization to turn on scheduled runs.
- Earnings announcements and forecasts require a separately sourced, permitted future calendar; existing EODHD entitlements are blocked. Do not fabricate earnings dates from 10-K periods.

SEC official sources: https://www.sec.gov/search-filings/edgar-application-programming-interfaces
JPM 2023: https://www.sec.gov/Archives/edgar/data/19617/000001961724000225/0000019617-24-000225-index.html
JPM 2024: https://www.sec.gov/Archives/edgar/data/19617/000001961725000270/0000019617-25-000270-index.html
