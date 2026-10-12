# Phase 2J8 — Original SEC 10-K accounting-note reconciliation (source-only)

## Decision and boundaries

Phase 2J7 and 2J7a are **candidate extractors**, not valid automated Greenblatt EBIT, enterprise-value total-debt or Piotroski share-issuance inputs. This phase provides a **reusable arithmetic contract** for **manually transcribed original 10-K financial statements and debt-note disclosures**. It cannot prove the transcribed quantities genuinely appear in the linked SEC 10-K; a reviewer must verify them against the source. There are **no runtime SEC requests, stored changes, migrations, issuer jobs, score changes or model approvals**.

The pure function `reconcileOriginalSecNote` in `src/lib/ingestion/sec/original-note-reconciliation.ts` validates exact original EDGAR issuer/accession URL identity, fiscal/filing dates, declared nonfinancial sector, integer precision using BigInt, current plus noncurrent debt against a separately stated carrying-value total, optional debt face-to-carrying bridge (signed discounts, issuance costs, hedge adjustments), optional other non-operating income bridge, and exact fiscal-end shares. It permanently returns `modelEligible=false`, `scoringEligible=false`. Output status `arithmetic_consistent_source_only` **is not an accounting approval**.

## Verified independent SEC annual reports (USD millions unless shares)

| Original FY 10-K | Consolidated GAAP operating income | PBT | Interest expense (positive) | PBT + interest | Difference from operating income | Carrying debt: current + noncurrent = total | FY-end shares |
|---|---:|---:|---:|---:|---:|---|---:|
| **AMZN 2025-12-31** | 79,975 | 97,311 | 2,274 | 99,585 | +19,610 | 2,748 + 65,648 = **68,396** | 10,731,000,000 |
| **ADBE 2025-11-28** | 8,706 | 8,734 | 263 | 8,997 | +291 | 0 + 6,210 = **6,210** | 413,000,000 |

### Amazon — original Form 10-K, accession 0001018724-26-000004, filed 2026-02-06

Source: https://www.sec.gov/Archives/edgar/data/1018724/000101872426000004/amzn-20251231.htm

- Consolidated statements of operations: GAAP operating income **79,975**; pretax profit **97,311**; interest expense **2,274**; interest income **4,381**; other income, net **15,229**. Reconcile `97,311 + 2,274 - 79,975 = 4,381 + 15,229 = 19,610`. Most of the difference is non-operating; calling the pretax-plus-interest sum identical to operating income would distort profitability comparisons. In particular, the non-operating amount contains investment revaluations; this is not a normalised recurring operating earnings certification.
- Note 6 Debt: total face value **68,836**, net unamortised discounts/costs **(440)**, current portion **2,748**, noncurrent carrying balance **65,648**. Reconcile `68,836 - 440 = 2,748 + 65,648 = 68,396`. The cash borrowing total excludes finance and operating lease obligations. Management confirms no revolving-credit or commercial paper program borrowing outstanding at year end. The preliminary concept preview correctly refused to infer total debt from ambiguous overlapping tags.
- Consolidated balance sheet shares outstanding at December 31, 2025: **10,731 million**; cover-page observation as of January 28, 2026 is **10,734,920,870**. These dates are not interchangeable.

### Adobe — original Form 10-K, accession 0000796343-26-000003, filed 2026-01-15

Source: https://www.sec.gov/Archives/edgar/data/796343/000079634326000003/adbe-20251128.htm

- Consolidated statements of income: operating income **8,706**, pretax profit **8,734**, interest expense **263**, investment gains **43**, other income **248**. Reconcile `8,734 + 263 - 8,706 = 43 + 248 = 291`.
- Balance sheet and debt note: current debt **0**, noncurrent debt **6,210**. Face amount **6,150** plus fair-value hedge adjustment **86** less discount/issue costs **26** = carrying value **6,210**. The CompanyFacts holdout does not supply the direct `LongTermDebtNoncurrent` tag at this original accession; the existing extractor correctly declines to invent one, but the original issuer **note** permits an independently reviewed bridge.
- Consolidated balance sheet common stock outstanding at fiscal year-end: **413 million**. This is not the weighted-average EPS denominator.

### Costco — earlier independently source-matched original 10-K

Original 2026-08-30 source: https://www.sec.gov/Archives/edgar/data/909832/000090983226000093/cost-20260830.htm . Operating income **11,685**, borrowing carrying values **2,248 current + 3,914 noncurrent = 6,162**, fiscal year-end common shares **443,266,000**. Previously verified as source facts, still **not automatically** an EBIT, total enterprise-value debt or split-adjusted issuance figure.

## Proposed versioned policies for later review (not implemented as model inputs)

1. **Operating earnings policy (`greenblatt_operating_income_candidate_v1`):** use consolidated GAAP operating income for an **operating-earnings** numerator, with unusual operating items included unless separately displayed as adjustments. Do **not** silently relabel it EBIT, and do not use `pretax income + gross interest expense` as an interchangeable input: Amazon's difference is **19.610bn**, Adobe's **0.291bn**. Final Magic Formula EBIT definition, exceptional-item policy and comparable year-over-year treatment require explicit sign-off. The pure function deliberately computes both figures but promotes neither.
2. **Financing debt (`borrowed_money_carrying_ex_leases_v1`):** current + noncurrent interest-bearing loans/notes/short-term paper **only when no duplication and complete perimeter are proved from original debt note**; carrying value, not principal face value and not gross contractual maturities. No generic mixing of `LongTermDebt` aggregates, lease-inclusive tags, commercial paper and current debt. A face-to-carrying bridge may include hedge accounting adjustments as in Adobe. Separately label finance leases, operating leases, financing obligations, minority interests, preferred securities, restricted cash and other enterprise-value adjustments. **Do not** feed this subset into `STMT_TOTAL_DEBT` or enterprise value yet.
3. **Shares (`fiscal_end_common_outstanding_v1`):** end-of-fiscal-year common shares, exactly original balance-sheet/as-of date, separated from issued shares, treasury shares, diluted-weighted-average EPS shares and later DEI cover-page shares. For Piotroski's issuance check, compare two original period-end snapshots only after normalising share splits at each point-in-time information date and assessing multi-class structures. `STMT_WEIGHTED_AVG_SHARES` remains unsuitable and issue #100 stays open.
4. **Sector exclusion:** banks, financial firms, REITs, utilities and unmapped issuers cannot use an unmodified industrial operating-income / invested-capital approach without separate policy. Exact URL, accession, date and arithmetic checks do not substitute for sector classification.
5. **Data trust:** an arithmetic pass never proves genuine original-note extraction. Reviewer confirmation, source-context match, immutable provenance, policy revision ID, evidence of later restatement/amendment and look-ahead control are separate gates.

## Tests and next release gate

`src/lib/ingestion/sec/original-note-reconciliation.test.ts` exercises the AMZN and ADBE audited annual statement examples as **manually sourced fixtures**, compares operating earnings alternatives, debt bridge including Adobe fair-value hedge adjustment, share/date distinctions, adverse debt face mismatches, incomplete nonoperating bridges, invalid EDGAR identity, blocked sectors, invalid/negative amounts and missing share counts. These tests certify deterministic arithmetic and guardrails, not independent live network extraction.

**Next:** Review whether the existing **two** SEC candidate extractors (`xbrl-operating-preview.ts` and `reusable-concept-extractor.ts`) should be converged into one policy-driven pipeline. In particular, `LongTermDebtAndCapitalLeaseObligations` is not a lease-excluding substitute for `LongTermDebtNoncurrent`, and an aggregate `LongTermDebt` tag needs original issuer context. Add a separate **owner-only, read-only source-note review interface** with explicit policy/version identifiers and independent evidence sign-off, then test six heterogeneous original issuers before proposing any SEC-driven modelling integration. Do not authorise Radar scores as part of that work.
