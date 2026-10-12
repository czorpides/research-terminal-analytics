# Phase 2J14 — Market-date-consistent earnings, financing and cash-policy gates

**Research as-of:** 2026-10-09, 16:00 EDT (20:00 UTC). **Calculation version:** `sec.research.ttm_financing_cash_scope.draft.v1.0.0`.

**Outcome:** Compared the most recent **publicly filed** financial reporting available *at the October 9, 2026 market close* against the frozen Phase 2J13 market-price/share snapshots. For Adobe, FY2025-only earnings and debt are stale; replace them in a **separate latest-as-of preview**, not in any original FY2025 records. For Costco, the annual FY2026 filing is sufficiently recent but the cash/investment total includes settled-in-days *unsettled card receivables*. These are not approved operating-capital, enterprise-value, discounted cash-flow or Radar model figures. Source arithmetic can be validated; policy, economic cash, unseen financing and exact equity cap still cannot.

## Source availability

- **Adobe FY2025 original 10-K**, FY ending 2025-11-28, accession `0000796343-26-000003`: https://www.sec.gov/Archives/edgar/data/796343/000079634326000003/adbe-20251128.htm .
- **Adobe Q3 FY2026 original 10-Q**, period ending 2026-08-28, filed 2026-09-22, accession `0000796343-26-000156`: https://www.sec.gov/Archives/edgar/data/796343/000079634326000156/adbe-20260828.htm . SEC index: https://www.sec.gov/Archives/edgar/data/796343/000079634326000156/0000796343-26-000156-index.htm . Pages 3–4 balance/income statement; Note 14 Debt; Item 2 Liquidity/Capital Resources; original quarter also includes prior nine-month operating income comparative.
- **Costco FY2026 original 10-K**, FY ending 2026-08-30, accession `0000909832-26-000093`, **filed 2026-10-07** (SEC filing index shows accepted October 6 at 21:13 UTC): https://www.sec.gov/Archives/edgar/data/909832/000090983226000093/cost-20260830.htm and https://www.sec.gov/Archives/edgar/data/909832/000090983226000093/0000909832-26-000093-index.htm . Annual statements, Note 4 Debt, Note 5 Leases, Item 7 Liquidity. **Correction to Phase 2J13:** prior source-snapshot metadata incorrectly labelled Costco's shares-publication date 2026-10-08; official SEC index says filing date **2026-10-07**; corrected in the shared snapshot.

The quoted 2026-10-09 close and September cover-page share-count products remain *static dated research proxies* from 2J13; not exact tick-by-tick market caps. No provider call is introduced. An as-of date check only establishes that the selected filings/share disclosures were publicly available before the chosen cutoff, **not** independent verification of price completeness or of unfiled corporate actions.

## Adobe: genuine TTM earnings update

| Period/source line | Consolidated operating income, USD m |
|---|---:|
| FY2025 10-K, year ended Nov 28 2025 | 8,706 |
| FY2026 10-Q, nine months to Aug 28 2026 | +7,010 |
| FY2025 comparative in *same Q3 FY2026 10-Q*, nine months to Aug 29 2025 | −6,445 |
| **TTM to Aug 28 2026** | **9,271** |

The source-quarter statement cross-foot: 2026 nine-month revenue **19,776** less cost of sales **2,142** = gross profit **17,634**; less GAAP operating expenses **10,624** = operating income **7,010**. The 2025 comparative nine-month gross profit **15,673** less operating expenses **9,228** = **6,445**. These are **GAAP operating-income proxy**, not adjusted EBITDA or automatically scored EBIT. August 2026 results include separately presented impairment/loss contingency effects; they are **not** silently added back.

### Adobe's CURRENT quarter-end carrying-value financing and cash

Latest Q3 FY2026 balance sheet and Note 14 (all USD m):

| Item | Amount | Exact reconciliation |
|---|---:|---|
| Current senior notes, carrying | 1,349 | 1,350 face less 1 issuance cost |
| Commercial paper, carrying | **248** | CP 250 face less discount; **already inside current BS debt** |
| **Reported current BS debt** | **1,597** | 1,349 + 248 |
| Noncurrent senior notes, carrying | 4,766 | 4,800 remaining face less (14) swap adjustment and (20) costs |
| **Reported total borrowing carrying value** | **6,363** | 1,597 current + 4,766 noncurrent |
| Cash/equivalents | 4,359 | Aug 2026 balance sheet |
| Short investments | 1,280 | Aug 2026 balance sheet |
| **Total observed liquid-asset book amounts** | **5,639** | 4,359 + 1,280 |
| Operating lease current / noncurrent | 89 / 310 | Liability total **399**; excluded from baseline EV |
| Current deferred revenue | **7,094** | Operating liability funding in negative-working-capital software |

Revolving credit facility explicitly undrawn in Note 14. Senior note face total 6,150 must not be summed with the current and noncurrent carrying values. The 2026 borrowing carrying balance of 6,363 **supersedes FY2025 6,210 at the October 2026 as-of date**, but original FY2025 still exists unchanged for history.

**Material model risk:** Adobe Q3 FY2026 book capital under the naive industrial capital formula, without unquantified finance lease/R&D intangible capital, would equal 826m if cash is retained, **(3,533)m** after removing cash, and **(4,813)m** after excluding both cash and short investments. Even 826m would yield a misleading enormous return on tangible capital. **All generic industrial ROC calculations are deliberately null for Adobe** in 2J14. A software-/asset-light-specific policy would require R&D expenditure capitalisation/amortisation conventions, deferred-revenue/contract acquisition cost treatment, acquired intangibles and point-in-time comparability before issuing ROC or ranking.

## Costco: reported card receivables limit cash-to-EV assumptions

The latest FY2026 source reconciles:
- Operating income **11,685m** (the latest annual income statement before 2026-10-09). No invented FY2027 quarterly earnings.
- Cash/equivalents **20,207m** + short-term investments **1,094m** = combined liquidity **21,301m**.
- MD&A liquidity expressly states **2,842m** of that combined balance consists of unsettled credit/debit card receivables (generally settle within four days). Therefore under a conservative policy that treats these as *operating receivables*, do not classify more than **18,459m** (= 21,301 − 2,842) as potentially EV-deductible cash/investments. Actual necessary operating cash may make the deductible amount **lower**.
- Original current/noncurrent carrying-value debt **6,162m**, finance-lease liabilities **1,413m** separately included in the conditional debt perimeter; baseline excludes operating lease 2,606m from EV while using rent-inclusive GAAP operating earnings. Preferred shares none outstanding.
- Noncontrolling interest and other financing liabilities still need a source-note decision before actual EV policy approval.

The previous *FY-source* 2J13 preview includes a **full-cash** deduction and a hypothetical cash+short-investment deduction. Those older figures are preserved for traceability but are explicitly labelled **archived, superseded** on the owner workbench. 2J14 **does not** present cash-only deduction of 20,207m as a supported scenario, because it exceeds the 18,459m cap after treating unsettled card receivables as operational assets.

## Conditional cash/EV yield sensitivity, NOT actual EV

Market proxies (2J13 frozen Oct 9 closing quotes times the latest already-public but earlier share snapshot) remain $419.608bn COST and $94.291bn ADBE. Unknown financing interests are assumed zero **only** for arithmetic, and are **not** source-certified.

| Scenario | COST conditional EV, USD bn | COST conditional TTM GAAP operating-earnings yield | ADBE conditional EV, USD bn | ADBE conditional TTM GAAP operating-earnings yield |
|---|---:|---:|---:|---:|
| No liquid assets deducted | 427.183 | 2.74% | 100.654 | 9.21% |
| Full cash deducted | **not permitted under card-receivable constraint** | — | 96.295 | 9.63% |
| Cash and short investments deducted | **not permitted under card-receivable constraint** | — | 95.015 | 9.76% |
| Costco card-receivable-adjusted *upper* liquidity deduction of 18,459m | **408.724** | **2.86%** | — | — |

The above figures depend on unresolved NCI, financing scope, lease treatment, working cash needs, contemporaneous equity share count and *future* operating earnings normalisations. Do not feed these values into a Magic Formula rank, generic ROIC, price target, Radar, or database metric. They are conditional comparisons designed to expose material valuation/definition differences.

## Implementation, verification and release gate

- Pure `src/lib/ingestion/sec/latest-asof-reconciliation.ts` with source URL/accession/report date, original numerator + quarter comparatives, Q3 2026 current/noncurrent commercial paper composition, current assets/liabilities cross-foot, material cash disclosures, Costco card ceiling, hypothetical EV and ROC ineligibility. No original facts altered.
- `src/components/research/SecLatestAsOfReconciliation.tsx` rendered *above* the old 2J13 scenario in the existing authenticated SEC Valuation Workbench; legacy component labels its old data as superseded and for audit only.
- New exact integer/regression tests for 2026 Adobe TTM 9,271, debt 6,363 (no CP double count), Costco liquidity 18,459, negative Adobe cash-adjusted tangible capital, missing financing classifications, frozen market date and hard-scored `false` flags.
- All source example numbers are manual SEC-document transcription checked by statement/note arithmetic, not independently authenticated by the runtime or reviewed by a separate accountant. There are zero outbound source requests, writes, jobs, migrations, new approval paths or model score changes.
- Must pass existing frontend build/TypeScript/source tests, Python analytics tests and standalone container smoke before PR merge. Live deployment/browser acceptance is a separate control.

**Remaining:** detailed economic working-cash policy, software-sector alternative capital recognition, fully reconciled lease/NCI/financial claims, a price/share-count data product with point-in-time provenance, and independent second reviewer before a model-integration PR is justified.
