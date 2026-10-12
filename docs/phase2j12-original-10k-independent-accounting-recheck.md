# Phase 2J12 — Independent original SEC account recheck and borrowing-perimeter correction

**Status:** source-statement arithmetic check complete for **AMZN FY2025**, **ADBE FY2025** and **COST FY2026**. **No independent second human attestation and no contemporaneous, fully sourced market capitalisation**. Findings are research evidence only: no model promotion, no ranking, no API scoring writes and no approval state changes. This phase specifically corrects a substantive earlier Amazon debt omission.

## Material accounting correction — Amazon

Amazon's original 2025 Note 6 shows **long-term borrowing carrying value** = 2,748m current + 65,648m noncurrent = **68,396m**, but ALSO **455m of borrowing outstanding under separate short-term credit facilities** (included in balance sheet accrued expenses/other). Its CP, usual unsecured revolver and separate 364-day revolver were undrawn at year end.

Therefore **68,396m was NOT complete nonlease borrowed money**. The identifiable total of reported LT notes + short-term facilities is **at least 68,851m**, before bespoke review of financing obligations. The original SEC Note 7 separately discloses **358m current** and **approximately 7.8bn noncurrent** financing obligations for fulfilment/data-centre facilities (not conventional notes; economic lease-like financing scope is unresolved). Do not blindly add contractual payments including interest, and do not pretend these are zero.

**Implementation:** preserve the valid **68,396m long-term note** source anchor but label it `source.longTermDebtCarryingOnlyUsd`. Display 455m additional credit facilities and the **68,851m identifiable borrowing subtotal** separately. Set the actual Phase 2J10 `financing.borrowingsExcludingAllLeasesUsd` to **null**, and prohibit the legacy-style reconstruction from treating 68,396m as comprehensive enterprise-value borrowed money. The original source record and previous raw fields are NOT mutated.

Sources:
- Amazon original FY2025 https://www.sec.gov/Archives/edgar/data/1018724/000101872426000004/amzn-20251231.htm — Consolidated Balance Sheets p39; Note 3 PPE p54; Note 4 Leases p55; Note 6 Debt pp58-59; Note 7 Commitments p59.

## Original issuer accounting observations, USD millions

| Source item / fiscal year | AMZN 2025 | ADBE 2025 | COST 2026 |
|---|---:|---:|---:|
| GAAP operating income | 79,975 | 8,706 | 11,685 |
| Total current assets | 229,083 | 10,163 | 46,582 |
| Total current liabilities | 218,005 | 10,200 | 43,952 |
| Cash and equivalents in current assets | 86,810 | 5,431 | 20,207 |
| Short-term marketable investments (reported, **NOT yet EV-eligible**) | 36,219 | 1,164 | 1,094 |
| Net PPE | 357,025 | 1,873 | 35,633 |
| Current part LT carrying-value debt | 2,748 | 0 | 2,248 |
| Noncurrent LT carrying-value debt | 65,648 | 6,210 | 3,914 |
| Additional separately disclosed short-term credit facilities | **455** | Not separately observed | Not separately observed |
| Identified long-term + separately disclosed short-term borrowing subtotal | **68,851** | 6,210 | 6,162 |
| Finance lease liabilities — current | 1,544 | **Not observed** | 94 |
| Finance lease liabilities — noncurrent | 10,742 | **Not observed** | 1,319 |
| Operating lease liabilities — current | 12,655 | 77 | 192 |
| Operating lease liabilities — noncurrent | 76,597 | 361 | 2,414 |
| Finance lease ROU assets **not already in net PPE** | **0 (included in Amazon PPE)** | Not observed | **1,413 (included in other long-term assets)** |

Sources:
- Adobe original FY2025 https://www.sec.gov/Archives/edgar/data/796343/000079634326000003/adbe-20251128.htm — Consolidated Balance Sheets p47, PPE Note 6 p68 and operating lease Note 7 p69. 2025 cash 5,431; short-term investments 1,164; CA 10,163, CL 10,200; PPE 1,873; operating lease liability 77 + 361 = 438. Preferred stock **none issued** (thus claims = 0). **No separate finance-lease amount observed**: do not infer zero. Adobe's debt hedging bridge 6,150m gross principal + 86m hedge adjustments − 26m deferred costs = 6,210m carrying.
- Costco original FY2026 https://www.sec.gov/Archives/edgar/data/909832/000090983226000093/cost-20260830.htm — Consolidated Statements of Income p37; Balance Sheets p39; Note 4 Debt p52; Note 5 Leases pp53-54. Current asset component subtotal 20,207 + 1,094 + 3,959 + 19,324 + 1,998 = **46,582**. Current liability components 22,591 + 5,641 + 3,037 + 3,006 + 2,248 + 7,429 = **43,952**. Finance lease 94 + 1,319 = **1,413**; operating 192 + 2,414 = **2,606**. Lease note locates current leases within *other current liabilities* and **finance ROU assets within other long-term assets**, not net PP&E. Its 2026 PBT **12,251** and gross interest expense **145** imply a **12,396** diagnostic, versus 11,685 operating income; difference **711** is non-operating income and **not** approved EBIT.
- Amazon original notes: CA 86,810 + 36,219 + 38,325 + 67,729 = 229,083; CL 121,909 + 75,520 + 20,576 = 218,005. 2025 finance leases 1,544 + 10,742 = **12,286**; operating leases 12,655 + 76,597 = **89,252**. Finance lease assets explicitly included within *net PP&E* (therefore do not add again).

## Implemented checks and workbench

- The new read-only `independent-original-10k-review.ts` groups each original line into direct balance sheet, original debt/lease note or a specifically labelled policy interpretation. **Exact source note sections, amounts, CIK-specific original 10-K URL and accession** are fixed in source control.
- Deterministic arithmetic cross-footing asserts **six original bridges for Amazon**, **three for Adobe**, **six for Costco**, including debt, leases, cash/current-asset and current-liability composition. In case of a discrepancy, `arithmeticPass=false`; it must not be treated as independently reviewer-attested.
- The owner valuation page now shows every observed original SEC line with provenance and unresolved questions. **Populate reported 10-K amounts into empty fields** copies only *explicitly observed* values and note references, never zero-fills nonoperating investments, unrestricted cash, market price, missing finance leases or minority interest. It does not store changes.
- The Phase 2J11 owner-only API **keeps the same authentication boundary** and responds with source-review evidence as part of its existing bounded GET/POST. The original restricted company allowlist and original evidence-ledger checks remain unchanged.
- **No contemporaneous market-value evidence is added**. FY2025 vs FY2026 share count/market value comparability is not established; EV earnings yields and ranking remain blocked without a verified price timestamp, total share-class cap, freely available EV cash, all financing claims and reviewed sector classification.
- Review-state is explicitly `reviewerAttestation=not_performed`; numeric cross-footing cannot impersonate an independent account reviewer.
- Original FY2025 Amazon current borrowing cross-classification and finance obligations must be evaluated on a separate policy revision before any production debt total can be asserted.

## Gates / remaining work

1. Frontend build, TypeScript, SEC arithmetic tests, Python analytics tests and container smoke must pass. A source-evidence fixture does not guarantee production route/authentication availability; perform browser verification after deployment.
2. Commission an **independent second accounting reviewer** or distinctly repeated extraction/reconciliation on the source data for financial classifications, rather than merely trusting our matched SEC line numbers and sums.
3. For actual Magic Formula **EV** and earnings yield, establish timestamped historical price and share-class total equity cap and verify restricted/unrestricted cash, marketable security liquidity, noncontrolling interests and preferred equity.
4. For actual **return on capital**, determine nonoperating vs working current assets, financing obligations and the corresponding finance lease ROU presentation for each issuer. Avoid setting zero merely for convenience. No cross-issuer ranks or live scores before versioned methodology decision and held-out model comparison.

**Verdict:** substantive source corrections + 3 issuer original SEC amount / arithmetic review; accounting comparability still **not validated**. This is a bounded genuine progress stage, **not a declaration that every Magic Formula field is ready**.
