# Phase 2J7 — Bounded, original SEC CompanyFacts extraction

## Implemented boundary

This phase turns six original SEC 10-K examples into a repeatable **source-only**, manually initiated preview. It does **not** manufacture EBIT, interest-bearing total enterprise-value debt, split-normalised share issuance or scoring inputs. The existing FMP-only annual-score source embargo and Phase 2J4 owner-research approval system remain unchanged.

- Original three-company calibration cohort: Microsoft FY2025, Alphabet FY2025, NVIDIA FY2026.
- Independent, previously unseen holdout cohort: Costco FY2026, Adobe FY2025, Texas Instruments FY2025.
- Input is the issuer's **actual live SEC CompanyFacts** endpoint, checked again at execution (one owner-initiated fetch). The source contact email stays server-side; issuer/CIK/filing/period must agree with existing immutable original filing evidence. Exact original 10-K accession and period only, no 10-K/A or later-filed comparatives. Annual duration must be 330–380 days.
- No SEC source job, scheduled provider call, new financial statement facts, scoring run, model approval or historical first-observed timestamp edit.
- The extraction code is pure and exercised by six **offline source-snapshot tests** captured from SEC original XBRL for repeatable CI. Live pilot has a read-only owner GET endpoint and individual explicit Data Health preview button.

## First results from SEC CompanyFacts, 12 October 2026

All numbers USD millions except common shares.

| Original 10-K | OperatingIncomeLoss (NOT certified EBIT) | Current borrowing | Noncurrent borrowing | Commercial paper | Borrowing subset excluding leases | Year-end common shares |
|---|---:|---:|---:|---:|---:|---:|
| MSFT FY2025 | 128,528 | 2,999 | 40,152 | 0 | 43,151 | 7,434,000,000 |
| GOOGL FY2025 | 129,039 | 1,996 | 46,547 | 0 | 48,543 | 12,088,000,000 |
| NVDA FY2026 | 130,387 | 999 | 7,469 | not tagged | 8,468 | 24,304,000,000 |
| COST FY2026 | 11,685 | 2,248 | 3,914 | not tagged | 6,162 | 443,266,000 |
| TXN FY2025 | 6,023 | 500 | 13,548 | 0 | 14,048 | **unavailable in original us-gaap tag** |
| ADBE FY2025 | 8,706 | 0 | **not separately tagged** | not tagged | **incomplete — no total inferred** | 413,000,000 |

**Important out-of-sample falsification:** Adobe's original 10-K CompanyFacts reports an aggregate `LongTermDebt` of $6.210bn and current carrying value zero but does **not** have the required original-10-K `LongTermDebtNoncurrent` tag. The extractor refuses to repurpose that aggregate as an inferred component; manual financial-statement/source-taxonomy reconciliation is still required.

**Overlapping tags:** Costco's current carrying-value debt is $2.248bn, whereas its next-12-month principal repayment tag is $2.250bn. These describe different measurement bases and are **never added**. Microsoft and Alphabet similarly have gross/current maturity tags different from carrying values. `LongTermDebt` is a parent, not an extra component.

**Actual share-basis counterexamples:** Microsoft FY2025 has 7.434bn shares at June 30, 2025 vs 7,433,166,379 on its later July 24, 2025 DEI cover-date. Costco FY2026 has 443,266,000 at August 30 vs 443,129,349 at September 29. Adobe FY2025 has 413m at November 28 vs 410.5m on January 9, 2026. Texas Instruments has later DEI January 27, 2026 cover shares but **no exact original FY-end `CommonStockSharesOutstanding` us-gaap tag**; the extractor refuses to fill one from the later count. Diluted weighted-average EPS shares do not measure end-of-period issuance.

## Concrete tag/sector policies

- GAAP operating income: `us-gaap.OperatingIncomeLoss`, USD, original fiscal-year duration. It is **not auto-equivalent to EBIT**. The required EBIT adjustment policy (other income and interest expense net, unusual operating/nonoperating items) remains an independent accounting decision; no candidate output is auto-approved for Greenblatt.
- Current debt: `us-gaap.LongTermDebtCurrent`, reported USD carrying value at exact fiscal date; noncurrent `us-gaap.LongTermDebtNoncurrent` likewise. `CommercialPaper`/separate `ShortTermBorrowings` included **only when direct original tags exist**, rejecting simultaneous positive tags that can overlap. The subtotal is an *observed borrowing subset*, never a certified complete EV interest-bearing debt measure.
- Lease-liability source tags (operating and finance, current and noncurrent) reported separately, never silently assumed zero or added. Finance lease policy must be separately chosen.
- Parent or aggregate `LongTermDebt` and gross `LongTermDebtMaturitiesRepaymentsOfPrincipalInNextTwelveMonths` are information, never additions.
- Period-end shares: `us-gaap.CommonStockSharesOutstanding` at **exact fiscal year-end**, instant fact. DEI `EntityCommonStockSharesOutstanding` with a later cover-page date appears separately and never replaces FY-end; even a direct FY-end share tag needs class/split review.
- Sector: fixed six nonfinancial issuers for this pilot, **not universal industry identification**. No model/score authorisation, including nonfinancial operating companies. Unknown sector mapping blocks automatic expansion.

## Original filing audit references

- Microsoft FY2025 https://www.sec.gov/Archives/edgar/data/789019/000095017025100235/msft-20250630.htm
- Alphabet FY2025 https://www.sec.gov/Archives/edgar/data/1652044/000165204426000018/goog-20251231.htm
- NVIDIA FY2026 https://www.sec.gov/Archives/edgar/data/1045810/000104581026000021/nvda-20260125.htm
- Costco FY2026 https://www.sec.gov/Archives/edgar/data/909832/000090983226000093/cost-20260830.htm
- Adobe FY2025 https://www.sec.gov/Archives/edgar/data/796343/000079634326000003/adbe-20251128.htm
- Texas Instruments FY2025 https://www.sec.gov/Archives/edgar/data/97476/000009747626000059/txn-20251231.htm

XBRL API format: `https://data.sec.gov/api/xbrl/companyfacts/CIKxxxxxxxxxx.json`; read-only six controlled issuer requests were made during development with configured SEC organisation contact and returned 200. Do not call in a recurring or public batch.

## Tests and release

1. Six fixtures: original operating income and debt match known reported issuer statement figures in three calibration cases and two complete independent holdouts; one Adobe holdout is deliberately incomplete, not forced to pass.
2. Fiscal-end shares vs later cover-date; TXN missing year-end tag; missing facts, wrong issuer, wrong exact accession, 10-K/A and conflicting SEC contexts all fail closed.
3. Original debt parent and principal maturity tags cannot be double-counted; overlap between positive short-term borrowing and commercial-paper concepts blocks subtotal.
4. Runtime owner-authenticated one-company GET only; constant CIK/period/accession allowlist, original SEC filing and source provider validation, SEC ID and contact, outbound HTTPS+official hostname, no automatic refresh or write. Public access denied.
5. CI, TypeScript, Python, standalone container smoke and production published health endpoint check. No existing scores or queue modifications.

### Next acceptable scope

Before any SEC EBIT/total debt score input: separately review the exact EBIT economic calculation and full EV debt including finance leases, cross-check current debt, non-operating income and excluded entities on at least six diverse issuers. Then version the metric definitions and propose a read-only model calculation preview; live Radar scoring remains a distinct, gated release.
