# Phase 2F — SEC ledger structural integrity gate

## Verified live baseline, 11 October 2026

Against the **actual Lovable Cloud production database**, not the unrelated external staging Supabase project:

- `sec_original_10k_coverage` is present with `security_invoker=true`; `anon` and `authenticated` SELECT denied, `service_role` allowed.
- 62 canonical annual filings and 711 facts across all providers and 16 issuers.
- 30 original SEC 10-K filings (295 SEC facts) across 11 issuers, all with original accession format, non-null actual first-observed timestamps, no artificial `published_at` and no duplicate accession.
- 9 issuers currently show **three consecutive annual SEC reports**. JPM currently has 1 report; META has 2. All 11 have four observed direct latest-period core metric tags. **This is only a presence check, not an audited statement.**
- No extra ingestion or data replacement was performed during this verification. The historical archive fallback has shipped but has not yet been verified on live JPM/META retrieval. Subsequent manual SEC imports must be deliberately owner-initiated.

## New read-only integrity view

`sec_original_10k_integrity` checks existing SEC ledger rows for:

1. Invalid original filing metadata: accession shape, 10-K form, FY/revision/restatement flags, period / accession provenance, filed-date format, and first-observed not preceding original SEC filed date.
2. Empty filings with zero facts.
3. Duplicate metric codes within a single filing.
4. Facts with inconsistent asset, source, period, first-observed time, revision/restatement or accession provenance.

The view is `security_invoker=true`, exposed to `service_role` only; no anonymous or authenticated SELECT. It is separate from the completeness view and **does not** modify observations, ingestion runs, Radar scores, jobs or recommendations.

The Data Health SEC grid now shows the number of issuers requiring structural review and individual per-issuer issue counts. `No structural flags` means internal consistency only; it does **not** certify original figures, fiscal-year applicability, accounting policy, completeness of balance sheet, or investability. Missing/malformed audit data must be labelled `unavailable`, never clean.

## Release order / acceptance checks

1. CI: production Vite build, TypeScript, analytics tests, new pure integrity-status regression tests, browser assets.
2. Apply the additive view migration on **Lovable Cloud production** before publishing code that queries it. Never apply this to `sythouvmvdhxwbmzwpxy` as a substitute for production.
3. Verify service-role-only privileges and confirm the new query returns 11 issuers with plausible numeric issue counts. Investigate every nonzero integrity flag; do not correct data with blind updates.
4. Publish the application and check hydrated Data Health with the new column; existing Radar/Catalyst/Opportunity routes must remain unchanged.
5. Keep SEC collection manually limited to <=10 issuers per click, <=2 per provider call; owner JWT enforced. Rerun controlled JPM/META historical recovery and verify original accessions and directly reported amounts against official SEC filings.
6. Do not activate automated 100-issuer queue, paid fundamentals/earnings, or ranking recalculation until source quality sampled and separately approved.

## Boundaries

Earnings calendar and consensus data remain unavailable under current provider entitlements. Core tag presence does not imply valuation-factor readiness. An internal QA view is not equivalent to independent financial statement reconciliation.
