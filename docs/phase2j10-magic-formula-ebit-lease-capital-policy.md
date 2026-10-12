# Phase 2J10 — Versioned SEC-backed Magic Formula accounting policy (DRAFT, NOT SCORED)

## Decision

**A single source tag does not make EBIT, enterprise value, or operating capital comparable.** The legacy `computeMagicFormulaRaw` in `src/lib/opportunity/fundamental-models.ts` currently uses `capitalEmployed = currentAssets - currentLiabilities + netFixedAssets` and `EV = marketCap + totalDebt - cash`. It does not explicitly remove nonoperating cash and financing from net working capital, nor reconcile finance leases, preferred capital or noncontrolling interests. It also permits an `industryCode: null` through the three-value sector exclusion rule. These are *pre-existing definitions*, not errors repaired in live scoring by this PR. Its `opportunity.magic-formula.v0.1` version remains unchanged.

This phase **does not** enable `STMT_EBIT`, `STMT_TOTAL_DEBT` or SEC-derived scores. It implements `sec.magic_formula.operating_capital.draft.v1.0.0` as an **isolated, deterministic, non-persisting policy evaluator**. It produces only diagnostic arithmetic and missing/invalid-input reasons from issuer-original SEC evidence. The issuer's 10-K and disclosure notes still need independent review; the runtime merely checks supplied values and context, not the source text. This is a candidate specification for subsequent model approval, not an approved investment methodology.

Source: `src/lib/ingestion/sec/magic-formula-policy-draft.ts`.
Test: `src/lib/ingestion/sec/magic-formula-policy-draft.test.ts`.

## Explicit v1 draft scope and definitions

### 1. Numerator — consolidated GAAP operating-income proxy, not generic EBIT

**Baseline operating earnings** = exact *original fiscal-year* `us-gaap:OperatingIncomeLoss`, subject to original issuer statement confirmation (annual duration, original 10-K accession and consolidated parent basis). This is the **unadjusted reported operating profit** numerator. It is **not certified Greenblatt EBIT**, normalised EBIT, EBITA or EBITDA. Share-based compensation, restructuring charges and other income/expense **included in reported operating income remain included**. No selective add-back of exceptional costs without a separately reviewed alternative revision.

**Diagnostic** = reported pretax profit + positive interest expense. The difference from GAAP operating income must remain visible and not silently replace the numerator. Nonoperating investment income (e.g. Amazon) changes pretax-plus-interest significantly. A later normalisation policy may need sector-specific notes, special gains/losses and unusual charge review, with a new version.

### 2. Borrowing and lease perimeter (all balance sheet figures at original FY end)

- `BorrowingsExcludingAllLeases` = independently source-note reconciled carrying-value current + noncurrent interest-bearing loans, notes and separate paper, **no overlaps**, excluding BOTH finance and operating leases. An aggregate XBRL `LongTermDebt`, gross bond principal, `LongTermDebtAndCapitalLeaseObligations` or raw calendar maturity schedule cannot automatically supply this field. Debt amortised-cost/fair-value-hedge adjustments are part of carrying amounts where applicable.
- **Finance lease liability** = current + noncurrent finance lease obligations **added once to enterprise value**; they cannot already be included in the above borrowing figure.
- **Operating lease liability** = current + noncurrent obligations **disclosed diagnostically but not added to EV** under the baseline rent-inclusive, unadjusted GAAP operating earnings. Current operating lease liability, to the extent included in reported current liabilities, is **removed from operating current liabilities** (non-trade financing-like balance), and operating lease ROU assets are not added to net PPE.
- **Finance lease ROU capital** = the balance of finance lease ROU assets **not already in reported net PP&E**; this is added to the operating-capital fixed-asset denominator exactly once, to maintain consistency with finance lease funding in EV. If finance ROU assets are already within net PPE, the source-verified extra amount must be explicitly **zero**. No automatic detection of asset presentation.
- **No default-zero**: missing finance or operating lease disclosures produce unavailable relevant outputs; zero claims must be explicitly source supported. Sale-leaseback financings, securitisation, supplier financing, hybrid and nonrecourse instruments are not resolved by this generic policy and require bespoke source review.

A *fully operating-lease capitalised* alternative (operating lease debt + operating lease asset and rent/interest reclassification) is **not** silently blended with this baseline. It would require a wholly separate version and comparable earnings bridge.

### 3. Net operating working capital and capital employed

```text
Operating current assets
  = current assets
    - cash and cash equivalents reported within current assets
    - identified nonoperating current investments
    - other identified nonoperating current assets

Nonfinancing current liabilities
  = current liabilities
    - current interest-bearing borrowings INCLUDED in current liabilities
    - current finance lease liabilities INCLUDED in current liabilities
    - current operating lease liabilities INCLUDED in current liabilities

Operating working capital
  = operating current assets - nonfinancing current liabilities

Operating capital employed (Greenblatt-style working capital + fixed capital)
  = operating working capital + net property, plant & equipment
    + finance lease ROU asset NOT ALREADY included in net PPE

Draft return on operating capital = GAAP operating income proxy / operating capital employed
```

Disclosed current components added back to liabilities must correspond to amounts **actually included** in the issuer's total current liabilities; do not automatically use the total current debt/lease liability if presentation is different. Unrestricted cash available for EV may be less than cash excluded from operating assets (e.g. restricted balance): the definition assumes cash as nonoperating, which needs documented issuer review when restricted cash supports operations. Current receivables, inventory, payables, deferred revenue, customer advances and accrued operating expenses remain; measurement/quality differences require additional policy or sector exclusions. **Goodwill and intangibles** are not automatically added to Greenblatt's tangible fixed capital: this ratio is not IFRS/GAAP invested capital ROIC and must not be labelled as such.

### 4. Enterprise value / financing claims

```text
Draft enterprise value
  = equity market capitalisation at a timestamp not earlier than source availability
    + carrying-value borrowings excluding all leases
    + finance lease current and noncurrent liabilities
    + preferred equity claims
    + noncontrolling interest
    - unrestricted cash available to enterprise investors
    - separately verified nonoperating liquid investments

Draft earnings yield = GAAP operating income proxy / draft enterprise value
```

No blind inclusion of operating leases, principal maturity figures, total liabilities or equity net book value. Preferred and NCI must be *affirmatively checked as zero or valued* (and price vs carrying amount documented where material). Investments removed from EV must be genuinely nonoperating and not already captured in cash. Equity market cap must use contemporaneous price/share-class coverage; a current market cap paired to historically unavailable financial statements is forbidden in point-in-time backtests.

### 5. Sector, provenance, error and score gates

- Only **independently classified nonfinancial industrial operating issuers** may enter this draft policy. `financial`, `reit`, `utility`, `unclassified` reject rather than attempt sector-agnostic substitutions. Classification must not be a mere user-input string in eventual production.
- Require CIK, accession, fiscal-end, original filing date, SEC original URL, source-first-observed timestamp and market-as-of timestamp. Reject impossible issuer/URL/date or *market-as-of before known source*.
- Inputs use exact USD integer strings / BigInt, not binary floating-point money. Incomplete inputs stay `null`, and reasons are reported. Reject negative borrowing/lease/cash counts, exclusion components exceeding balance-sheet totals, excessive current financing add-backs, impossible cash available, and nonpositive denominators. ROC and yield are rounded to **basis points** only as a display convenience; future ranking should compare exact unrounded fractions.
- `reviewBasis` is a label, **not an approval or user role**. The evaluator never uses it to permit scoring. Its output has `modelEligible=false`, `scoringEligible=false`, and `approval=draft_needs_original_note_accounting_review` in every status; not used or imported by the existing `computeMagicFormulaRaw` or the Radar.
- Once a reviewed interpretation differs from this definition (capitalised operating leases, IFRS revenue assets, R&D capitalisation, sector alternatives etc.), issue a **new immutable version**. Never revise an old historical score in place.

## Sample reconciliation and distinction from fabricated model data

| Original issuer 10-K | Consolidated operating income (USD m) | Pretax + interest (USD m) | Differential (USD m) | Borrowings ex leases (USD m) | Full ROC / EV yield? |
|---|---:|---:|---:|---:|---|
| AMZN FY2025 `0001018724-26-000004` | 79,975 | 99,585 | 19,610 | 68,396 | **Unavailable:** no fully reviewed lease/working-capital/price perimeter in this phase |
| ADBE FY2025 `0000796343-26-000003` | 8,706 | 8,997 | 291 | 6,210 | **Unavailable:** no fully reviewed lease/working-capital/price perimeter in this phase |
| COST FY2026 `0000909832-26-000093` | 11,685 | Not established in these fixtures | Not established | 6,162 | **Unavailable:** outstanding capital and lease review |

The above figures come from the original issuer 10-K reconciliation already documented in `docs/phase2j8-original-sec-accounting-note-reconciliation.md` and `docs/phase2j7-live-sec-xbrl-original-preview.md`; **no source evidence is automatically stored by the draft evaluator**.

Amazon original https://www.sec.gov/Archives/edgar/data/1018724/000101872426000004/amzn-20251231.htm

Adobe original https://www.sec.gov/Archives/edgar/data/796343/000079634326000003/adbe-20251128.htm

Costco original https://www.sec.gov/Archives/edgar/data/909832/000090983226000093/cost-20260830.htm

A separate **synthetic/fabricated full-data fixture** demonstrates the entire denominator and EV arithmetic. This is a contract test, **not** a claim about any real company's balance sheet. It has GAAP operating income 1,000m, original CA 4,000m, CL 2,200m, nonoperating CA excluded 650m, current financing/lease CL excluded 450m, net PPE 3,000m, additional unduplicated finance lease ROU asset 250m. Operating NWC = **1,600m**; capital employed = **4,850m**; ROC = **20.62%**. Market cap 8,000m, borrowed money 2,400m, finance leases 500m, preferred 100m, NCI 50m, qualifying cash 450m, investments 150m gives EV **10,450m**, earnings yield **9.57%**. Operating lease liability 700m is disclosed but not added to EV. Pretax-plus-interest 1,500m is explicitly NOT substituted for 1,000m GAAP operating income.

## Next acceptance and limits

**Phase 2J11:** create an authenticated **read-only model *candidate* preview** using independently source-note checked AMZN/ADBE/COST or additional diverse issuers; record original XBRL/manual-note provenance for **every** input and consistent market-cap timestamp. Do not infer zeros. Require a two-pass independent source review and issuer-specific note reconciliations, controlled industry mapping and fit-for-purpose bank/REIT/utility exclusion. Compare the results and ranking sensitivity against legacy `opportunity.magic-formula.v0.1`. No live model consumer, `STMT_EBIT` backfill, new score, auto approval, queue work, or issuer-history overwrite without separate explicit release review.
