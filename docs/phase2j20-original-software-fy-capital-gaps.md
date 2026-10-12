# Phase 2J20 — Original SEC liquidity, current funding, contract location and lease-expense evidence

**Scope:** Research FY evidence for Adobe FY2025, Autodesk FY2026 and ServiceNow FY2025, using the original SEC 10-Ks dated before the frozen 9 October 2026 valuation cutoff. Version `sec.research.original_fy_gap_closure.draft.v1.0.0`. Pure read-only calculations, manually sourced from issuer statements/notes and independently cross-footed in tests. **Not independently second-human signed**, not contemporaneous October 2026 TTM balance, not live scoring.

This phase addresses the remaining 2J19 accounting gaps individually. It distinguishes (1) original-source availability, (2) classification/accounting completeness and (3) actual economic approval. **A reported numeric field is not necessarily an investable economic figure.**

## Source-first material correction

**Adobe's FY2025 original SEC 10-K explicitly states that the company has NO finance leases.** The prior Phase 2J18 original SEC fixture had `null` for Adobe's finance leases despite this affirmative note. Its original FY evidence record now reflects **0 as explicitly absent**, and the original 2J18 regression test is updated accordingly. Autodesk's FY2026 lease note does **not** provide an equivalent issuer-specific finance-lease absence for this review: **null remains null**. ServiceNow FY2025 already explicitly discloses no finance leases.

Source Adobe https://www.sec.gov/Archives/edgar/data/796343/000079634326000003/adbe-20251128.htm , leasing accounting policy and Note 7. Source Autodesk https://www.sec.gov/Archives/edgar/data/769397/000076939726000015/adsk-20260131.htm , Note 9 and leases. ServiceNow https://www.sec.gov/Archives/edgar/data/1373715/000137371526000007/now-20251231.htm , Note 12 and leases policy.

**Scope restriction:** This verified absence is **Adobe FY2025**, not assumed for any later period without original quarter note examination. Earlier Phase 2J12/2J15 text remains a historical audit record and is superseded only for this FY2025 original source evidence.

## 1. Original reported cash vs economic operating cash

| USD millions, original issuer 10-K | Adobe FY2025 | Autodesk FY2026 | ServiceNow FY2025 |
|---|---:|---:|---:|
| Cash and cash equivalents in CURRENT assets | 5,431 | 2,249 | 3,726 |
| Short-term marketable investments in CURRENT assets | 1,164 | 348 | 2,558 |
| **Cash + current securities** | **6,595** | **2,597** | **6,284** |
| Other reported current assets (remaining components) | 3,568 | 2,345 | 4,187 |
| **Total reported current assets cross-foot** | **10,163** | **4,942** | **10,471** |
| Separately reported noncurrent securities | Not independently sourced in this phase | 376 | 3,771 |
| Restricted cash booked OUTSIDE cash and equivalents | Not independently quantified | Not independently quantified | **6 in prepaid/other current assets** |
| Approved freely available surplus cash | **Unavailable** | **Unavailable** | **Unavailable** |

Original facts and source locations:
- Adobe original FY2025 10-K, consolidated balance sheet and Note 3 short-term securities (FY2025 cash 5,431 + short investments 1,164; other assets 2,344 trade and 1,224 prepaid). Adobe reports that cash is used for operations, vendor/data-centre obligations, taxes, investment, repurchases and acquisitions; it does **not** quantify a minimum operating-cash reserve.
- Autodesk original FY2026 10-K consolidated balance sheet: cash 2,249, marketable securities current 348, receivables 1,439 and prepaid/other 906; noncurrent marketable securities 376. FY2026 reporting is not the same as July 2026 interim or October 2026 free cash.
- ServiceNow original FY2025 10-K consolidated balance sheet and cash-flow reconciliation: cash 3,726 and marketable current securities 2,558; receivables 2,627, current deferred commissions 590, prepaid/other 970. **Restricted cash 6** is already **within prepaid and other CURRENT assets**, outside cash/cash equivalents, and is part of the cash-flow statement total 3,732. **Never deduct the 6 twice from cash or pretend it is part of 3,726.** Noncurrent marketable securities 3,771 are outside current assets and not included in a current-cash subtraction.

**Operating-capital sensitivity:** start with the deliberately **INCOMPLETE** Phase 2J19 partial book bridge and display three alternative adjustments: retain all cash, remove cash equivalents, remove cash plus current securities. These are not approved nonoperating-asset classifications. Adobe: 2,377 / (3,054) / (4,218) USD m. ServiceNow: 3,543 / (183) / (2,741) USD m. Autodesk remains **null in all cases** because its 913m commission asset cannot be apportioned between current and noncurrent from the reviewed original FY note. The calculations illustrate how sensitive an incomplete denominator is to cash classification; they are NOT returns on invested capital.

## 2. Current non-lease funding and finance lease distinctions

| Original FY source line, USD millions | Adobe | Autodesk | ServiceNow |
|---|---:|---:|---:|
| Current portion of interest-bearing notes, explicit original balance-sheet zero | **0** | **0** | **Not independently confirmed as complete total** |
| Noncurrent notes/borrowings, carrying | **6,210** | **2,483** | **1,491** |
| Finance leases | **Explicitly none** | **Unverified** | **Explicitly none** |
| Operating lease liability, current | 77 | 52 | 112 |
| Operating lease liability, noncurrent | 361 | 199 | 800 |

Adobe FY2025 debt Note: carrying value long-term 6,210, nil current long-term borrowing and no outstanding revolving-credit drawings at fiscal end. Autodesk FY2026 original balance sheet: current portion long-term notes nil, noncurrent notes 2,483. This **must not** be confused with Autodesk FY2027 Q2 interim short-term funding from another period. ServiceNow 2025 balance sheet reports long-term notes net 1,491, but without an independently comprehensive instrument-by-instrument current finance perimeter; there is no basis to certify that all funding short-term obligations equal zero. Even for companies with zero current notes, supplier finance, cash guarantees and hybrid claims are not independently cleared.

## 3. Operating leases: FY expense observation is NOT compatible lease EBIT

| Original SEC FY expense, USD millions | Adobe | Autodesk | ServiceNow |
|---|---:|---:|---:|
| Operating lease costs (issuer described) | 92 | **68 = 58 fixed + 10 variable** | 147 |
| Cash paid for operating leases | 95 | 89 | 107 |
| GAAP operating income | 8,706 | 1,578 | 1,824 |
| Mechanical income **before disclosed lease cost** | 8,798 | 1,646 | 1,971 |
| Separately verified operating ROU amortisation/depreciation | **Unavailable** | **Unavailable** | **Unavailable** |
| Separately verified operating lease financing interest | **Unavailable** | **Unavailable** | **Unavailable** |
| **Compatible capitalised-lease EBIT / ROC** | **Unavailable** | **Unavailable** | **Unavailable** |

Source Adobe Note 7: operating lease cost 92 FY2025 and 95 cash paid; variable components and sublease income not material, but does not report a full lease-adjusted EBIT bridge. Source Autodesk lease note: 58 FY2026 cost by function + 10 variable; 89 cash paid includes variable payments, with cash-flow presentation differing from expense recognition. Source ServiceNow Note 17: operating lease costs 147 and cash payments 107.

**Policy:** it is valid to compute `GAAP FY operating income + reported FY lease expenses` as an explicitly descriptive **pre-cost subtotal**. It is NOT valid to call that **lease-capitalised EBIT** or divide it by `CA−CL+PPE+ROU`. ASC 842 operating lease accounting uses a single lease cost presentation; isolating ROU amortisation and lease interest would require additional source / model assumptions, as would consistent treatment of variable rent. The 2J19 capitalised lease scenario must therefore continue to return **null adjusted operating earnings**.

## 4. Contract assets and sales commissions

Adobe: total contract assets **241** FY2025 but reviewed original filing does NOT give a reliable current/noncurrent portion. Adobe deferred selling commissions **721 = 257 current + 464 noncurrent** are already recorded within original current/other assets. Autodesk: total capitalised commissions 913, related commission liabilities 550; the original fiscal-year source states they are classified partly in prepaid/current and other long-term assets without a quantified split. Its FY2026 amortisation of **536** is recognised in marketing/sales expense—not R&D amortisation and not a new current asset. ServiceNow: deferred commissions **590 current + 1,114 noncurrent** already recognised in source balance. No company earns an internally comparable investment return merely by adding or excluding these assets.

## Implementation and acceptance controls

- `software-fy-source-gap-closure.ts`: three bounded issuer original SEC source cases; original balance-sheet current component crossfoot; observed cash, current investments, noncurrent securities where disclosed, restricted cash location, original debt/current funding, finance lease zero only when explicitly stated, operating lease annual expense and cash paid, unavailable depreciation/lease-interest, unchanged 2J19 baseline and three **labelled, hypothetical** cash stress outcomes. All original statement sums BigInt; original-period and 2J18 source identity assertions. Not a live SEC fetcher.
- `software-operating-capital-perimeter.ts`: issuer-specific correct FY2025 Adobe finance-lease *explicitly none* classification (previously null); original 2J18 test updated.
- `SecSoftwareFYGapReview.tsx`: bounded three-company source comparisons and source links, added to existing authenticated owner SEC Valuation Workbench **above** Phase 2J19. No new routes or access control.
- `software-fy-source-gap-closure.test.ts`: cross-foot three actual source current-asset statements, no double-deduct ServiceNow restricted amount, explicit Adobe/Autodesk current zero vs ServiceNow unresolved, finance lease explicit absence, amortisation/interest null, three cash-treatment scenarios and across-the-board no-eligibility guards.
- No SQL migrations, writes, historical source rewrites beyond correcting one FY source fixture, scorer or Radar model changes, provider subscriptions, automated source fetching or score promotion. Other older research scenario records intentionally remain historical methodology versions with their caveats.

## Next evidence required to calculate genuine software return on invested capital

1. **Minimum operating cash** by issuer across multiple fiscal years, including restrictions, committed acquisitions and the actual recurring servicing/payroll/vendor liquidity buffer. Value should be distinguished from marketable securities and strategic/nonoperating holdings.
2. **Full original FY/interim current borrowing/supplier-finance/financing-lease** line classification, and asset/financing perimeter consistency.
3. **Current vs long-term contract-asset and commission cost** allocation for Autodesk and Adobe where issuer notes are unavailable; escalate as qualitative blocker if not reasonably obtainable.
4. **Bilateral operating lease earnings bridge:** actual recurring lease expenses, variable services, ROU depreciation equivalent and embedded financing interest, with versioned analytical assumptions if original GAAP alone cannot supply an IAS 17/IFRS 16-like split.
5. **Independent second human source/accounting review** and properly paired annual-period/TTM invested-capital numerator/denominator across software issuers, before any score or production selection.

**Release gate:** frontend build, TS, original SEC test suite, Python analytics and container smoke green; browser acceptance and deployment separate. **ROI, cash, scoring remain unapproved**.
