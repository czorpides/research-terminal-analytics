# Phase 2J7 — Reusable original SEC concept extraction, candidate-only

## Scope

Source: original SEC EDGAR **CompanyFacts** US-GAAP concepts and independently validated **original fiscal-year 10-K accession**, not a later comparative accession and not restated amendments. The reusable pure function `extractSecOperatingModelCandidates(gaap, context)` operates **entirely in memory**, makes no provider requests, performs no inserts and cannot modify existing `fundamental_facts`, scores or issuer-reconciliation records.

This pass implements an explicitly **fail-closed candidate extractor**, not a generic issuer financial statements engine. An extraction candidate does not have permission to become the existing `STMT_EBIT` or `STMT_TOTAL_DEBT` or a Piotroski share-count input.

### Proposed mappings and outstanding definitions

| Extracted candidate | Exact initial XBRL concept | Important exclusion |
|---|---|---|
| GAAP operating income | `OperatingIncomeLoss`, annual-duration USD fact | Not necessarily EBIT, requires nonoperating earnings/interest reconciliation |
| Noncurrent borrowings | `LongTermDebtNoncurrent` OR `LongTermDebtAndCapitalLeaseObligations` | Alternative tags with conflicting amounts are ambiguous; lease-inclusive alternatives demand careful review |
| Current borrowings | `LongTermDebtCurrent`, `LongTermDebtAndCapitalLeaseObligationsCurrent`, `ShortTermBorrowings`, `ShortTermDebtCurrent`, `CommercialPaper` | Alternative tags are **not** blindly additive; presence of both current notes and commercial paper with different amounts makes amount ambiguous. Missing component is NOT zero |
| End-of-fiscal-year shares | `CommonStockSharesOutstanding` original exact year-end instant `shares` | Not diluted weighted average, not post-year-end DEI cover-page observation, and not approved without class/split review |

Sector classification must be independently provided as `nonfinancial`; unknown/missing sector, banks, REITs and utilities are blocked. The source extraction does not infer industry from company name, ticker or uncited labels.

The extraction verifies: exact original accession, original `10-K` form, fiscal period end, annual income duration 330–400 days or end-of-period instant, filed date not after original filing, USD/shares unit, safe integer values, conflicting same-tag/alternative-tag facts. Returned output includes metric basis, raw tag components, value as exact integer string, reason for accounting review and **permanently false** model/scoring eligibility.

### Accounting-policy restriction

This first implementation deliberately **does not** overwrite the verified Phase 2J6 issuer-specific source ledger, initiate SEC API calls, run unattended ingestion, or change the FMP-only Piotroski/Magic Formula scoring isolation. Some original issuer debt definitions are issuer-specific and cannot be inferred reliably from one universal tag pair. The pilot examples show the importance of notes and current/commercial-paper composition; no value is silently computed if tags overlap.

### Regression coverage

- Three controlled fixture reconstructions of the known MSFT FY2025, GOOGL FY2025 and NVDA FY2026 pilot amounts, while preserving no-scoring decisions.
- Separate COST FY2026 *synthetic/contract* fixture, testing exact accession and rejecting later accession comparative contamination. **This is NOT yet a live SEC CompanyFacts out-of-sample acceptance test** and must not be presented as such.
- Bank/REIT/utility/unclassified sector rejection.
- Conflicting current-borrowing concepts, absent current debt, absent common shares, 10-K/A, quarterly facts and unsafe numeric precision fail closed.

## Next gate before expansion

Run an explicitly owner-approved, rate-limited and authenticated **read-only live SEC CompanyFacts preview** of three pilot issuers and independent new issuers, using SEC EDGAR's configured user-agent, and compare candidate concept values with the original issuer FY annual statements. Preserve discrepancies including borrowing scope and safe-integer limits. Do not persist candidates or enable scoring. An owner-visible preview and live sample run should be a distinct release/validation step. Successful synthetic fixtures prove parser behaviour, **not** correctness of a real-world novel issuer's financial definitions.

Current business-facing measurable milestone: first no-side-effect reusable extractor and negative-test suite ready. Second live independent sample and confirmed EBIT/EV debt policy still outstanding.
