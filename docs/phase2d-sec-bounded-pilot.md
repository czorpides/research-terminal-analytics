# Phase 2D — SEC financial recovery: controlled ten-company pilot

## Confirmed baseline

- SEC CompanyFacts original 10-K import has been verified on the live Microsoft issuer: FY2024–FY2026, 3 original reports and 33 facts. A second run returned `unchanged` without duplicates. Do not treat an unchanged rerun as a failed initial import.
- EODHD annual statements and earnings-calendar entitlement probes returned "Not entitled under current EODHD subscription" for both endpoints. Keep this outside market-price entitlements; no subscription upgrade is authorized.
- 35 canonical financial filings and 449 facts existed after the initial Microsoft import. This pilot changes no Radar scores and creates no recurring collection task.

## Pilot operation

In the normal terminal, owner signs in and opens **Data Health → Official-source recovery → Import next 10 US SEC issuers**.

- Only the authenticated `owner@research.local` Supabase JWT, verified again server-side, may request pilot candidates or submit imports. The planner is read-only, including under anonymous access.
- The cohort contains 15 specifically reviewed major US tickers across technology, consumer, health care, financials and other sectors; it is **not** a random/backtest-representative sample. The planner validates active domestic USD exchange listings and distinct ticker identity; previously imported 3-year SEC issuers are excluded.
- Import executes at most **five sequential calls** to the existing two-issuer SEC ingestion operation, with up to 3 original 10-K reports per issuer and a 500ms minimum pause before each SEC HTTP request. Upstream redirects cannot follow arbitrary hosts. It returns source evidence and first-known timestamps.
- The browser displays completed issuer count, reports added, facts added, unchanged and unsupported outcomes. If an issuer fails, **stop immediately** and do not retry automatically. The owner can resume with the same button; completed 3-year issuers are skipped, while incomplete one/two-year imports remain eligible.
- This requires the user to **keep the page open** during the sequence. No silent backend scheduler or multi-minute Worker execution is introduced in this pass.

## Acceptance and later expansion

1. Verify full application CI (including pilot plan and SEC annual normalization tests), Docker smoke, production browser rendering and unauthenticated 401 on SEC pilot GET and import POST.
2. Confirm recent SEC ingestion runs and canonical 10-K filing/fact counts actually increase after the owner initiates the pilot. An HTTP 200 alone does not prove financial recovery.
3. Sample provenance across at least 3 issuers and different fiscal-year ends (e.g., AMZN, JPM, NVDA), checking direct US GAAP tags, period, accession, USD/shares and first known date.
4. Check zero duplicate reports on reruns and that both Radar scores stay unchanged.
5. Scale beyond 10 only after sampled quality and request limits are validated; build an asynchronous server job/queue for 100+ issuers rather than relying on a browser session.
6. Earnings dates and estimates remain missing. Do not infer announcement times from SEC periodic filing dates; use an issuer/regulated calendar with explicit source and date precision after verification. EODHD statements and calendars remain out of the current subscription.

## Risk boundaries

- Banks may have fewer usable direct annual XBRL tags than industrial businesses; represent missing figures explicitly.
- 10-K/A amendments, 20-F issuers, split-era ticker changes and conflicting concepts require separate conservative workflows.
- No score changes, new prices, cron scheduling, production database replacement or EODHD paid purchase.
