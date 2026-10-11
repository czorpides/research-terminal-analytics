# Phase 2I — Single-approval completion of curated SEC pilot

## Objective
Replace repetitive owner clicks for each ten-company background wave with **one finite, explicit owner authorisation** to process the *remaining eligible and untouched issuers* from the **same existing 100-symbol curated pool**. This is not an open-ended SEC scraper, a new security discovery job, or a green light for investment ranking. The existing one-issuer lease worker remains unchanged.

## Starting state
On 2026-10-12 Lovable production stored 51 SEC-covered issuers, 49 with three consecutive original FY 10-Ks, 152 original SEC filings and 1,351 direct source financial facts. BLK and SPGI have specific known history exceptions; semantic readiness issues (bank revenue, AVGO/PNC net income, Walmart total revenues) remain separately tracked. Two of the curated 100 were previously not verified to a unique active eligible equity identity and must not be guessed.

## One-time operator workflow
1. Data Health → **Phase 2I · one-time pilot completion** → **Preview remaining eligible SEC issuers**. This is read-only.
2. Review the exact tickers, number of unique eligible companies, already covered, partial history, cooldown, integrity exclusions and nonverified identities. Only untouched companies appear in this authorisation.
3. Explicitly click **Approve one-time N-company SEC backfill**. The owner JWT is revalidated and the backend recomputes the entire plan before accepting exact ordered asset IDs. A changed set returns 409, requiring another preview.
4. The PostgreSQL RPC transaction validates every asset independently: 1–100 unique active USD US exchange listings, unique equity identity, zero existing SEC original filings, zero active queue jobs, no structural issues, no active prior wave and no prior noncancelled one-time campaign by that owner. The transaction atomically writes one persisted, finite wave with N jobs, ordered 1..N.
5. The existing SEC worker runs **one issuer per minute at most** through its single-global lease and SEC request pacing. The ordinary due-approved-work dispatcher advances the exact jobs stored in the approved wave, whether or not the browser stays open.
6. The wave terminates as completed or completed_with_issues when the N jobs reach terminal states. No subsequent wave is auto-approved. Existing pause/resume/cancel UI controls remain functional and per-company results remain queryable.

## Separation of concerns
- **Collection**: The backfill stores original 10-Ks with actual first-observed timestamps and original SEC accession provenance, no substitutes or date fabrications.
- **Completeness**: Three consecutive years are a *coverage* criterion, not proof every line item is usable. BLK/SPGI are outside this untouched campaign and remain manual/root-cause exception investigations.
- **Valuation/scoring**: Do not enable direct SEC fact use in Radar or DCF rankings until a separate semantic reconciliation gate.
- **Scope**: If the verified eligible remainder is smaller than 49, record the exclusions. No unverified ticker, cross-CIK predecessor or unsupported report format will be fabricated to reach 100/100.

## Rollout gates
1. CI (TS, frontend build, Node SEC tests, Python analytics) and Docker green. Transactional production **BEGIN ... ROLLBACK** SQL test: schema extension, enqueue multiple known untouched assets, reject duplicate-wave authorisation, acquire and complete a mock lease, pause/resume, verify final status. No actual SEC fetches or persistent fake records during dry-run.
2. Merge to GitHub main, apply schema extension **to Lovable Cloud production**, verify function execute access only for service_role. Existing 2H cron remains unchanged.
3. Publish Lovable and smoke-test that GET preview is owner-protected and POST without bearer returns 401. Do not create any production wave automatically.
4. Owner explicitly previews and approves the finite batch. Monitor progress and exceptions; worker rate remains one asset per minute, up to three attempts for transient failures.
5. After completion, carry out distinct **Phase 2J: original filing semantic reconciliation and model-readiness** rather than endlessly widening source collection.

## Rollback
- Pause active wave from Data Health; if needed unschedule existing `sec-owner-queue-tick`. Keep persisted queue records for audit.
- The migration is additive except widening wave mode and job ordinal CHECK to 100; existing 2H ten-name APIs and worker continue to function.
- No nightly discovery, repetitive refresh, auto-enqueue or additional SEC scope activated.
