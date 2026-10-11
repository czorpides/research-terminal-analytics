# Phase 2G — Controlled SEC historical recovery and new-issuer expansion

## Release baseline (11 October 2026; verified against **Lovable Cloud production**)

- Canonical **all-source** ledger: 62 annual filing rows and 711 facts across 16 issuers.
- Official SEC original 10-K source: **30 reports / 295 direct facts / 11 companies**.
- **Nine** issuers have consecutive original 10-K histories for three years. **JPM (1)** and **META (2)** remain incomplete. This is an observed coverage gap, not proof the SEC has no older filings.
- Phase 2F's service-role-only `sec_original_10k_integrity` query found zero structural flags in these 30 filings. This does not establish the accuracy of reported financial values.

## Controlled workflow: preview before any SEC call

Data Health → Official-source recovery:

1. Sign in with the owner session and click **Preview SEC repair & expansion**. This makes only read-only internal database requests; it does not contact the SEC or mutate records.
2. The separate **Historical repairs** plan selects at most **two** partially imported US issuers in the approved curated 100-name pilot. These include companies with fewer than three original 10-Ks or three nonconsecutive years; complete and untouched issuers are excluded.
3. The **Untouched-company expansion** plan selects at most **ten** eligible verified US companies with **zero** original SEC filings. Previously imported partial companies do not consume new-name slots.
4. Inspect tickers and counts, then explicitly click the relevant **Run up to 2 history repairs** or **Import up to 10 new issuers** action. The client re-reads the plan and refuses an unexpected change in asset identity or coverage before issuing the first provider request.
5. Provider requests remain **at most two assets each**, sequential, with the existing 500ms pause for individual SEC HTTP calls. The owner must keep the browser open. Data Health shows the *observed before/after fiscal-year count per issuer* from its protected DB views, not just API status or attempted calls.
6. If a source fails, an issuer identity changes, integrity becomes flagged, or source response is inconsistent, the manual run pauses without trying the next pair. A later run requires another preview, and historical saved facts are not backdated or rewritten.
7. No automatic scheduler, queue activation, 100-name unattended backfill, score calculation, earnings assumption or provider subscription change.

## Guards

- Both read-only modes require revalidated owner Supabase JWT; the existing SEC POST still independently enforces owner authorization and validates supplied UUIDs.
- Only exact, unique, active, USD equity identities on XNYS/XNAS/XASE and in the curated 100-name pilot can be planned. Ambiguous, missing or incompatible identities are not guessed.
- The source's FY original-report provenance is used to identify existing history. The integrity view blocks candidates with structural problems; missing/unavailable integrity telemetry causes the planner to fail closed.
- A running, failed or zero-progress attempt within 30 minutes excludes that issuer from the next plan. Retrying after provider failures should be deliberate, not a request storm.
- If an SEC importer fails after some preceding filing inserts completed, the failure run now reports the *actual already-inserted* filing/fact totals, not zero.
- Counts displayed as `3-year history available` mean at least three roughly consecutive period ends, not full balance sheet / income statement / cash flow coverage or investment-model fitness.

## Release sequence and acceptance

1. Review PR / CI: production JS build, generated route typing, parser and controlled-wave regressions, Python analytics and Docker startup smoke.
2. Merge only if tests pass. This phase has **no new SQL migration**.
3. Publish Lovable with the matching Git commit and verify browser Data Health hydration and preflight plans while logged in as owner. Confirm unauthenticated GET `/api/public/ingest/sec-pilot-candidates?mode=repair` rejects with 401; invalid mode rejects with 400 for verified owner.
4. **Do not claim the historical repair ran simply because it was deployed.** Owner must trigger the historical repair manually, observing JPM/META and the SEC source returns. Record before/after 10-K years, new facts and source run status. Review each new accession, `filedDate`, fiscal-period, fact tag, USD/shares unit and actual `known_at` against the original SEC filing.
5. Stop for review on unverifiable or discrepant numerical values; do not promote its numbers into any Radar ranks. Sample a non-calendar-fiscal issuer and a financial institution when extending to the next expansion wave.
6. After this validation, evaluate a persisted, **opt-in** backend queue for sustained 100+ issuer ingestion. Do not enable recurring provider calls without a separate release decision.

## Explicit exclusions

No unattended imports, fabricated historical-as-of backtest timestamps, automatic SEC scoring, 20-F or 10-K/A normalization, or inferred forward earnings announcements. EODHD fundamentals and earnings endpoints remain outside current entitlement.
