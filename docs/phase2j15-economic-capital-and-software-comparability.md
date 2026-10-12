# Phase 2J15 — Economic operating cash, financing-claim overlap and software capital comparability

**Scope:** Research-as-of **9 October 2026, 16:00 EDT**. Pilot issuers **COST FY2026** and **ADBE FY2026 Q3**. Policy version `sec.research.economic_capital_comparability.draft.v1.0.0`. No write paths, migrations, source backfill, ticker expansion or new model consumer.

## Summary of policy outcomes

| Policy question | Rule implemented | Acceptance status |
|---|---|---|
| How much surplus cash belongs in enterprise value? | Published cash + short investments are a book **upper** amount, not verified distributable cash. Exclude identified operating settlement funds; require separately evidenced working-cash reserve. | **Unapproved**: actual reserve and cash availability unknown |
| What finance claims should EV add? | Reviewed borrowed-money carrying values + **separate** finance lease liabilities (if identified) + issued preferred capital + NCI + other economic finance claims, without overlaps. | **Unapproved**: NCI/other claims unknown; Adobe finance leases not independently established |
| Should operating leases be included as EV debt? | No under the rent-inclusive GAAP operating income proxy baseline. Capitalised lease alternative requires separately versioned earnings, asset and debt bridges. | Fixed draft treatment, not general approval |
| Can asset-light Adobe be ranked on Greenblatt tangible ROC? | **No.** Negative cash-excluded tangible capital makes generic ROC meaningless. Do not use 1,000%+ ROC when cash is retained just to avoid sign problems. | Excluded pending suitable software policy |
| What can substitute for ROC while reviewing software? | Descriptive **TTM GAAP operating margin, R&D intensity and operating cash-conversion diagnostics**, transparently separated from capital returns. | Descriptive source arithmetic only; cannot substitute into combined Magic Formula rank |

## 1. Surplus cash and minimum operating liquidity

Original-source liquid book amounts, USD millions:

| | Costco | Adobe |
|---|---:|---:|
| Cash and short investments | 21,301 | 5,639 |
| Separately identified operating card-settlement receivables included in reported cash-equivalent balances | 2,842 | **Not separately quantified (NOT verified zero)** |
| **Unprotected book-liquidity maximum for hypothetical scenarios** | 18,459 | 5,639 |
| Additional necessary operating cash / restricted liquidity / funding needs | **Not quantified** | **Not quantified** |
| **Verified distributable surplus for EV** | **Unavailable** | **Unavailable** |

Official issuer documentation:
- Costco original FY2026 10-K, Item 7 Liquidity and Capital Resources: https://www.sec.gov/Archives/edgar/data/909832/000090983226000093/cost-20260830.htm — $21,301m combined cash equivalents / short investments and $2,842m unsettled customer card settlements. Generally settled within four days.
- Adobe original Q3 FY2026 10-Q, Condensed Balance Sheet and Note 4 Short-Term Investments: https://www.sec.gov/Archives/edgar/data/796343/000079634326000156/adbe-20260828.htm — $4,359m cash/equivalents + $1,280m short investments.

**Decision:** Do NOT approve `surplusCash = cash + short-term investments`. A cash reserve and distributability review, plus restrictions/covenants and operational liquidity needs, is necessary before granting an actual EV cash deduction. Specifically, the recognized $2,842m Costco card settlement amount is counted as a protected operating balance for scenario upper limits, NOT an investment available for shareholder distribution.

The workbench illustrates 0%, 50% and 100% deduction of **only the unprotected book-liquidity ceiling**. This is deterministic *scenario stress*, not an asserted probability distribution, forecast or estimate of actual surplus cash. For Costco the deductions are 0 / 9,229 / 18,459 USD m; for Adobe, 0 / 2,819 / 5,639 USD m. Even the maximum may be materially overestimated; the actual validated distributable cash balance stays **null**, not 0.

## 2. Financing claims and balance sheet integrity

The new claim register makes **each economic instrument** explicit:

| Original instrument, USD m | Costco FY2026 | Adobe Aug 2026 | EV accounting |
|---|---:|---:|---|
| Interest-bearing borrowings at carrying value | 6,162 | 6,363 | Once |
| Commercial paper as a separate line | Not independently established | **248 (already within 6,363)** | **Never add again** for Adobe |
| Finance lease liabilities | 1,413 | **Unverified** | Costco once; Adobe null, assumed zero only in conditional illustrative EV |
| Operating lease liabilities | 2,606 | 399 | **Excluded** under rent-inclusive unadjusted GAAP operating earnings policy |
| Preferred issued capital | 0 (explicit issuer line) | 0 (explicit issuer line) | Zero only where verified |
| Noncontrolling interest | **Unverified** | **Unverified** | Cannot silently claim zero |
| Other finance instruments, sale-leaseback and hybrid instruments | **Unverified** | **Unverified** | Requires note-level legal/economic characterization |

Adobe Q3 10-Q debt Note 14 establishes $1,597m current including $248m paper + $4,766m noncurrent = $6,363m total. Do not add the paper to the current total. Finance-lease classification is an independent task; a filing which lists operating leases does not establish no finance leases. Costco original 10-K Notes 4–5 give $6,162m borrowing balance, $1,413m finance leases and $2,606m operating leases. Even where some claims are reviewed, **unknown NCI, credit enhancements, securitizations, sale-leasebacks and pensionlike finance adjustments mean full EV remains unapproved**.

### Conditional EV illustrations (NOT certified, as of October 9 price × earlier share-count proxies)

| Hypothetical cash deduction | Costco EV, USD bn | Costco operating earnings yield | Adobe EV, USD bn | Adobe TTM operating earnings yield |
|---|---:|---:|---:|---:|
| No book cash deducted | 427.183 | 2.74% | 100.654 | 9.21% |
| Half of unprotected book maximum | 417.954 | 2.80% | 97.835 | 9.48% |
| Entire unprotected book maximum | 408.724 | 2.86% | 95.015 | 9.76% |

The figures treat unobserved finance claims as zero **solely for reproducible counterfactual arithmetic**. These are not rigorous intervals or lower/upper bounds on actual EV: liabilities may remain unquantified, share counts are not exact at the market close, and asset availability is not established.

## 3. Software comparability — Adobe's FY2025 + Q3 FY2026 YTD bridge

Source audited original FY2025 10-K https://www.sec.gov/Archives/edgar/data/796343/000079634326000003/adbe-20251128.htm and original unaudited Q3 FY2026 10-Q https://www.sec.gov/Archives/edgar/data/796343/000079634326000156/adbe-20260828.htm .

`TTM = FY2025 + 9 months to Aug 2026 − 9 months to Aug 2025`. Each term is taken from the exact original consolidated source statement and checked arithmetically:

| GAAP source line, USD m | FY2025 | 9m FY2026 | 9m FY2025 | TTM to Aug 2026 |
|---|---:|---:|---:|---:|
| Revenue | 23,769 | 19,776 | (17,575) | **25,970** |
| Consolidated operating income | 8,706 | 7,010 | (6,445) | **9,271** |
| Research and development expense | 4,294 | 3,596 | (3,196) | **4,694** |
| Cash flow from operations | 10,031 | 7,646 | (6,871) | **10,806** |
| Stock compensation add-back in operating cash-flow statement | 1,942 | 1,582 | (1,453) | **2,071** |

Ratios:
- **TTM GAAP operating margin = 35.70%** (9,271/25,970). Standard descriptive operational profitability, **not** adjusted margin.
- **TTM R&D as share of revenue = 18.07%** (4,694/25,970). Expense remains in GAAP income; it is **not** added back in this phase.
- **Operating cash flow / operating income = 116.56%** (10,806/9,271). Compares an *after-tax cash-flow metric* to *pre-tax operating earnings*, **not** a like-for-like operating-profit conversion rate; interpret with care.
- **Operating cash flow less stock compensation add-back = $8,735m; / operating income = 94.22%**. This is a **quality sensitivity only**. It is *not* free cash flow (capex not deducted), nor a legitimate shareholder cash-return metric, and does not eliminate SBC dilution/buyback dynamics.

### Software operating-capital decision

**Reject generic tangible capital return for Adobe under the unmodified industrial formula.** Q3 2026 reported current assets 9,158m, current liabilities 11,888m (including deferred revenue 7,094m), current debt 1,597m, current operating lease liability 89m, PPE 1,870m => $826m cash-retained conditional capital, **negative $3,533m with cash excluded**, and **negative $4,813m** after also excluding short investments, before unverified finance ROU. A positive $826m denominator generating an enormous ROC is **not** evidence of a uniquely superior business. The accounting basis is incompatible with the industrial tangible-capital assumption.

A separately versioned R&D-adjusted *economic operating capital* methodology, if desirable, would require at minimum five-year R&D expense history, chosen economic useful life and amortisation profile, accumulated unamortised R&D asset, acquisition/intangible and goodwill rules, deferred-revenue/deferred selling commission treatment, same-period adjusted earnings and cash-flow conversion. **No arbitrary 3- or 5-year amortisation has been approved or silently used.**

Until then, display only standalone operating margin, R&D intensity and cash-flow quality diagnostics; block intersector Magic Formula ranking based on missing ROC. Costco industrial ROC still needs cash and lease/NCI review before becoming score-eligible. Do not combine standalone software margin with industrial ROC in the same formula as if it were equivalent.

## Implementation / governance

- `economic-capital-comparability-draft.ts`: pure immutable versioned policy reading latest 2J14 financial evidence, with explicit `null` economic cash reserve and surplus, bounded hypothetical cash deduction sensitivities, claim-by-claim financing register (including the embedded Adobe CP exclusion) and 4 original source-bridged Adobe economic-quality indicators. All exact USD integer arithmetic is BigInt.
- `economic-capital-comparability-draft.test.ts`: Costco cash cap and protective card settlement; Adobe CP double-count and unknown lease/NCI; comparative R&D/revenue/CFO/SBC TTM; capital return suppressed; no approved EV or scores in any scenario.
- `SecEconomicCapitalComparability.tsx` in the existing owner SEC Valuation Workbench, above archived 2J14 and earlier 2J13 views. No API changes, new privilege, external provider requests or persistence.
- All public financial figures remain **manually transcribed from SEC documents**, checked by arithmetic, and do not meet independent human second-signoff. The current source snapshot is October 9, 2026, not a live data feed.
- Model/scoring flags remain **false**, and there is no activation of live Radar, cross-industry models or historical backfills.

## Phase 2J16 recommendation

Acquire additional source years of GAAP R&D, cash flow, diluted/actual shares and deferred contract cost disclosures for an independently sourced *software vs software* issuer holdout; draft alternative software-capital amortisation treatments **as clearly numbered stress cases only**. For industrial names, establish company minimum working-cash reserve via documented working-capital seasonality and payments turnover, obtain a real debt/NCI/perimeter sign-off and complete point-in-time share and price coverage. After independent source reviewer sign-off, conduct explicit out-of-sample issuer model comparisons **before** any one-off score promotion.
