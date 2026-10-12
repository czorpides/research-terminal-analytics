# Phase 2J2 — SEC accounting-basis layer and scoring quarantine

## Independent concern discovered in code audit

Original SEC 10-K ingestion did not itself trigger score recomputation, but `loadAnnualFinancialHistory()` historically selected **all** annual filing sources. `runFundamentalScoresForAllAssets()` passes this loader into Piotroski and Magic Formula. Once SEC was collected, a future scoring run could therefore consume **unreviewed original SEC figures**, even if the importer never explicitly recalculated scores. This was a latent, real code integration issue.

Production verification 2026-10-12: last stored Piotroski and Magic Formula runs were 2026-10-10 06:15 UTC, before the recent SEC mass ingestion; no evidence of newly produced SEC-derived score rows at the time checked.

### Safeguard

The annual historical scoring loader now explicitly resolves the **existing legacy FMP provider** from the source registry and restricts its `fundamental_filings` SELECT to that provider. SEC and any newly onboarded statement providers are **not eligible by default**, even when annual filings and facts exist. This does **not** retroactively remove any scores, change the legacy FMP policy, or imply FMP accounting data has itself been certified under Phase 2J.

Scoring all-source fundamentals from `data_points` remains governed by the separate ingestion/quality policies, outside this explicit annual historical source embargo.

### Original fact semantics (version `sec.original.basis.v1`)

Add service-only, read-only `sec_original_fact_basis_audit` over actual original SEC `fundamental_facts` joined to their original 10-K filing. Per raw fact display: ticker, period end, accession, true legal-filer CIK, direct `us-gaap` tag, exact numeric source value, unit, actual system first-observed timestamps and original SEC document URL.

The derived `observed_basis` is a **definition label, not another number**:

| Existing raw tag / situation | Observed basis | Scoring |
|---|---|---|
| WMT FY2026 `RevenueFromContractWithCustomerExcludingAssessedTax` | Issuer statement net sales; NOT total revenue | Blocked |
| Other `RevenueFromContractWithCustomerExcludingAssessedTax` | Contract revenue; may differ from issuer total revenue | Blocked |
| `SalesRevenueNet` | Net sales, not necessarily total issuer revenues | Blocked |
| `Revenues` | Composition/industry context must be reviewed; banks especially | Blocked |
| `NetIncomeLoss` | Consolidated vs attributable scope must be checked in original statements | Blocked |
| `WeightedAverageNumberOfDilutedSharesOutstanding` | Direct unadjusted weighted shares, not a split-normalized comparative | Blocked |
| `Assets` / `NetCashProvidedByUsedInOperatingActivities` | Direct US-GAAP tag, numeric reconciliation still required | Blocked |

All rows have `source_value_reconciled=false`, `peer_comparable=false`, `scoring_eligible=false`. No SEC facts are rewritten, added, backdated or normalized. Missing PNC/AVGO income remains missing; missing WFC/GS/MS bank net revenues remain missing; BLK/SPGI legal-filer/fact exceptions remain open. No inferred share-split factors are applied.

Owner-protected Data Health presents high-priority original source links and accounting-basis interpretation, alongside Phase 2J1's missing metric quality counts.

### Backfill isolation

Phase 2I finite one-time batch was owner-approved while this phase was implemented. At inspection the backend held one 47-issuer finite campaign; the new semantic view is purely SELECT and does not lock, update, cancel, retry or slow any persisted SEC queue job. Existing worker, pg_cron and manual wave controls remain unchanged.

### Acceptance

1. Test source selection with SEC+FMP and with only SEC/unknown source: SEC is never eligible for Piotroski/Magic Formula.
2. Validate SQL view on Lovable production: exact filing-fact accession, source URL and first-observed lineage; WMT FY2026 is labelled `net_sales_issuer_specific`; AVGO raw shares are unchanged; all source observations remain score-ineligible.
3. Confirm anon/authenticated SQL SELECT forbidden; service_role allowed; `security_invoker=true`.
4. CI TypeScript/Vite, SEC tests, Python analytics, Docker smoke.
5. Merge and publish Data Health. Authenticate as owner to inspect source evidence. No automatic score rerun or financial fact adjustment.
6. Subsequent work: explicit fact-by-fact issuer reporting reconciliation, sector-aware metric selection, stock-split corporate-action records and controlled model eligibility approval only after soundness testing.

Official filing exemplars: SEC WMT original 10-K https://www.sec.gov/Archives/edgar/data/104169/000010416926000055/wmt-20260131.htm; issuer-specific BLK, SPGI, PNC, AVGO etc tracked in Issues #83, #86–90.
