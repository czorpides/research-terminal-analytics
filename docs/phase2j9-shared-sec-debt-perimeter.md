# Phase 2J9 — Shared original-SEC borrowing-subtotal policy

## Reason for this change

The existing owner-only SEC previews used **two different accounting interpretations**:

- `src/lib/ingestion/sec/xbrl-operating-preview.ts` summed **direct** `LongTermDebtCurrent` + `LongTermDebtNoncurrent` but also blindly added positive `CommercialPaper` and `ShortTermBorrowings` when an individual tag appeared, even though overlaps with current borrowing were not proven.
- `src/lib/ingestion/sec/reusable-concept-extractor.ts` used `LongTermDebtAndCapitalLeaseObligations` as an alternative to `LongTermDebtNoncurrent` while labelling the candidate **excluding leases**. It also chose one of `ShortTermBorrowings`, `ShortTermDebtCurrent`, `CommercialPaper` and `LongTermDebtCurrent` as though they were interchangeable components, even where borrowing scope might differ.

These are semantic issues that can invalidate enterprise value, independent of whether the XBRL facts were extracted correctly.

## Implementation

**One shared, pure function:** `assessSecBorrowingSubset` in `src/lib/ingestion/sec/debt-perimeter-policy.ts`. Both existing preview extractors delegate to the shared arithmetic decision:

- Eligible *source-only subtotal* = direct `us-gaap:LongTermDebtCurrent` + direct `us-gaap:LongTermDebtNoncurrent`, **at the same original period end and original 10-K accession**, and only when both have been observed and the candidates have valid nonnegative integer values.
- Missing current or noncurrent direct tag **never** means zero. This intentionally keeps Adobe FY2025 and Amazon FY2025 incomplete at the automated CompanyFacts layer until original-note accounting review.
- Positive `CommercialPaper`, `ShortTermBorrowings`, `ShortTermDebtCurrent`, or invalid/conflicting overlapping concepts **block** the automatic subtotal. These balances may be *additional* financing or overlap with an existing component. The original issuer debt note and exact tag definition are required to decide.
- `LongTermDebtAndCapitalLeaseObligations` and `LongTermDebtAndCapitalLeaseObligationsCurrent` are **lease-inclusive** indicators only and **cannot substitute** for or be added to the direct lease-excluding borrowing amounts.
- The `LongTermDebt` parent and the principal repayment maturity schedule remain informational only; finance/operating lease obligations, unusual financing liabilities and EV cash adjustments are separate accounting decisions.
- The shared decision returns exact integer string, `components_match | incomplete | ambiguous`, detailed caveats, and permanent `modelEligible=false`, `scoringEligible=false`. The two **publicly unchanged** endpoint shapes map these statuses to their existing UI contracts, so no automatic scores or model exposure are created.

### Calibration and negative tests

`debt-perimeter-policy.test.ts` covers:

1. Costco FY2026 candidate **$6.162bn** = current $2.248bn + noncurrent $3.914bn; no unsafe aggregate additions.
2. Positive separately tagged short borrowings/commercial paper and conflicting data block the subtotal, even if the individual values are accurate.
3. Lease-inclusive-only tags do not fill a missing noncurrent direct tag.
4. Existing finance-lease-inclusive indicators remain observable, without double-counting them in the observed debt subset.
5. Both independent preview extractors return **the same numeric result** on matching source concept fixtures and both refuse overlapping and lease-inclusive-only cases.
6. All source candidates remain non-scoring and non-modelling.

### Unchanged boundaries

No SEC provider calls, ingestion schedules, DB writes, migrations, stored facts, model formula changes, Radar scores or automatic approvals. No new expenses. This fix specifically resolves a **source-candidate semantic inconsistency**, not full interest-bearing debt/enterprise value policy. Read-only original SEC 10-K Note 6/17 manual reconciliation (Phase 2J8) is a separate evidence layer.

## Remaining release gates

- Pass TypeScript, SEC tests, Python analytics suite, application build and standalone container smoke.
- Validate current owner-only previews remain accessible without client behaviour changes.
- **Before model consumption**, define and sign off a single versioned EBIT and cash/debt/lease/working-capital policy suitable for the Magic Formula. Preserve original filing, source date and sector, and prevent look-ahead bias in retrospective scoring. Do not merge approved-source evidence and this candidate layer merely because its arithmetic balances.
