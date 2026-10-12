# Phase 2J6 — Three original SEC 10-K operating-income and borrowing validation examples

## Decision

A reported **GAAP operating income** line is useful original SEC evidence, not a universal substitute for **EBIT** in the existing Magic Formula. A reconciled subset of **interest-bearing notes/current maturities/commercial paper, excluding leases**, is similarly not automatically the total enterprise-value debt for every company. **Do not write** either to `STMT_EBIT`, `STMT_TOTAL_DEBT`, `fundamental_facts`, `data_points`, `scores` or any DCF input.

A separate, append-only service-role-only `sec_operating_model_pilot` table preserves **six** original annual statement observations. Each record contains: verified eligible SEC original company identity, same-year accession and original 10-K source URL, specific fiscal period, observed metric basis, components and exact integer arithmetic, explicit excluded accounting scope, current checking timestamp, and permanent scoring/model false constraints.

## Original SEC sample (figures in USD millions)

| Company | Report end | Accession | Reported operating income | Debt notes & commercial paper excluding leases |
| --- | --- | --- | ---: | ---: |
| Microsoft | 2025-06-30 | 0000950170-25-100235 | 128,528 | 43,151 |
| Alphabet | 2025-12-31 | 0001652044-26-000018 | 129,039 | 48,543 |
| NVIDIA | 2026-01-25 | 0001045810-26-000021 | 130,387 | 8,468 |

Microsoft FY2025 debt (USD millions): **commercial paper 0** + **current portion of long-term debt 2,999** + **non-current debt 40,152** = 43,151. The company’s fiscal 2025 annual balance sheet and Note 10 explicitly identify the current and non-current portions. The FY2026 10-K is newer and is deliberately not substituted into the original FY2025 evidence record.

Alphabet FY2025: **current portion of long-term debt 1,996** + **noncurrent notes net of issuance costs 46,547** = 48,543. It reports no outstanding commercial paper at 31 December 2025. Total debt excludes leases and differs from gross principal face value (49,085) due to unamortised discount/issuance costs of (542).

NVIDIA FY2026: **short-term portion 999** + **noncurrent long-term debt 7,469** = 8,468. The original FY2026 10-K separately reports operating lease obligations. FY2026 operating income **130,387** is the consolidated profit line, NOT the segment total (139,297), which excludes corporate costs and share-based compensation; using segment totals would cause material misstatement.

### Source register (original issuer 10-Ks, NOT third-party models)

- MSFT original FY2025: https://www.sec.gov/Archives/edgar/data/789019/000095017025100235/msft-20250630.htm ; Microsoft investor official FY2025 annual report: https://www.microsoft.com/investor/reports/ar25/
- Alphabet original FY2025: https://www.sec.gov/Archives/edgar/data/1652044/000165204426000018/goog-20251231.htm ; consolidated income statement and Note 6 Debt.
- NVIDIA original FY2026: https://www.sec.gov/Archives/edgar/data/1045810/000104581026000021/nvda-20260125.htm ; consolidated statements of income, balance sheet and outstanding debt note.

### Accounting boundaries not yet resolved

1. **EBIT:** For nonfinancial entities, EBIT commonly derives from earnings before income taxes **plus net interest expense**, but classification of interest income, interest expense, other nonoperating items, share-based compensation and exceptional items is material. The direct *operating income* figure can diverge. Use a documented, versioned EBIT policy with original statement interest adjustments before approval.
2. **Enterprise-value debt:** Finance lease liabilities, non-recourse financing, convertible debt, cash restrictions, preferred instruments, and minority interests can alter enterprise value. A labelled borrowings-only amount must NOT be placed into the existing `STMT_TOTAL_DEBT` field without explicit model-policy sign-off.
3. **Piotroski issuance:** `STMT_WEIGHTED_AVG_SHARES` is **diluted weighted-average EPS shares**, not year-end common shares outstanding. SEC DEI cover-page shares may refer to an **after-year-end** count. The standalone policy test rejects both a direct diluted average proxy and an unadjusted end-of-year number. Existing legacy FMP scoring and all historic scores remain unchanged; issue #100 covers the downstream logic fix.
4. **Sector exclusions:** `industry_id` remains null for observed SEC pilot holdings, so the generic Magic Formula cannot prove issuer eligibility by classification. Sector mapping and accounting suitability must be independently validated before any model use.

### Protections & evidence

- All six source observations are append-only with exact original accession and issuer/period checks; UPDATE and DELETE rejected.
- Debt components must sum exactly to reported borrowed-money total in numeric arithmetic; duplicate, unknown or incomplete original-source component records fail closed.
- All records have `model_eligible=false` and `scoring_eligible=false` enforced in SQL. They cannot be used as live `STMT_EBIT`/`STMT_TOTAL_DEBT` input.
- Data Health shows source links, fiscal dates, reported metrics, debt component bridges and explicit accounting caveats. The server endpoint is GET-only and rechecks owner authentication; no scheduled SEC requests or extra provider subscriptions.
- Deployment verification: SQL `BEGIN…ROLLBACK` original six rows and negative tests, CI, standalone Docker smoke, protected view permissions, anonymous API 401, no changes to original source records or score timestamp.

## Measurable next action

Before scaling to 97 companies, choose a **single explicit economic definition** of EBIT and EV total debt, verify it against these three issuers' original statements and interest/debt note disclosures, and introduce a separate versioned valuation-only reconciliation. Select another three dissimilar nonfinancial companies as an out-of-sample check. Stop if accounting identity or model interpretation breaks. Approve consumption only via a reviewed separate PR; never promote source tags automatically.
