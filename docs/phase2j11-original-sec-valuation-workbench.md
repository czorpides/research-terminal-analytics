# Phase 2J11 — Owner-only original SEC Magic Formula valuation workbench

## Scope and outcome

This is a real *interactive* owner-only, read-only research page, not a live investment score. It wires the independently documented Phase 2J7–2J10 original-10-K accounting anchors to the **versioned Phase 2J10 draft evaluator**, permits typed supplementary statement/note figures (with an individual original-10-K location for each), and displays missing inputs, arithmetic statuses and a labelled, **not semantically identical** reconstruction of the pre-existing v0.1 formulas.

**UI:** `/sec-valuation-workbench` (platform navigation). **API:** `GET/POST /api/public/research/sec-valuation-preview`, requiring bearer-verified owner identity. **Policy:** `sec.magic_formula.operating_capital.draft.v1.0.0`. **Original model:** `opportunity.magic-formula.v0.1`, unchanged.

No ingestion worker, provider fetch, automatic market-cap source, stored manual facts, DB migration, approval workflow, Radar scoring change, model-promotion path, periodic job or bulk issuer processing is introduced. Every response carries `permittedForScoring=false`, `permittedForModels=false`, `storedChanges=0`. The typed note values and market-source claims are NOT verified by the endpoint; it checks format, arithmetic, declared provenance and original SEC issuer identity.

### Grounded (only) original-10-K anchors

| Ticker | Original fiscal end | Original SEC accession | GAAP operating income (USD m) | Pretax + interest expense diagnostic (USD m) | Borrowings carrying value, excluding leases (USD m) |
|---|---|---|---:|---:|---:|
| AMZN | 2025-12-31 | `0001018724-26-000004` | 79,975 | 99,585 | 68,396 |
| ADBE | 2025-11-28 | `0000796343-26-000003` | 8,706 | 8,997 | 6,210 |
| COST | 2026-08-30 | `0000909832-26-000093` | 11,685 | **unavailable in the current reviewed case file** | 6,162 |

Source anchors are from the prior manually reviewed official original issuer statements and notes. The fixed allowlist is **not** an issuer discovery service:

- Amazon https://www.sec.gov/Archives/edgar/data/1018724/000101872426000004/amzn-20251231.htm
- Adobe https://www.sec.gov/Archives/edgar/data/796343/000079634326000003/adbe-20251128.htm
- Costco https://www.sec.gov/Archives/edgar/data/909832/000090983226000093/cost-20260830.htm

Original SEC issuer identity is cross-checked at runtime against the *existing SEC provider*, original `fundamental_filings` record with exact fiscal end/accession/CIK/original 10-K source URL, `revision_no=1`, non-restatement status, first-observed timestamp and securities master. The API never trusts the caller to supply/accession-correct original identity or update an anchored figure. If the original SEC ledger is unavailable or differs, the endpoint fails closed.

### What the user can do

1. Select an original annual filer, inspect the locked earnings/debt source anchors and original 10-K evidence link.
2. Open relevant sections for supplementary original current-asset/current-liability/cash/PPE, finance- and operating-lease, funding-equity, cash-to-EV and finance-lease right-of-use disclosures. Each explicitly entered **whole or decimal USD million** amount converts to exact integer dollars; a blank remains `null`, including finance leases, preferred equity and NCI. Entry of **zero** still requires an explicit original-10-K note location.
3. Enter a separately cited, dated equity market-cap snapshot in USD millions, at or after original filing first-observed availability. No price feed or share class market cap is invented.
4. Click **Calculate read-only provisional ratios**. The server recomputes the original bounded source identity and invokes the *same* `evaluateSecMagicFormulaDraft` used by Phase 2J10. It displays operating working capital, capital employed, EV, return on capital, earnings yield, original PBT-plus-interest difference, missing inputs, provenance problems and why a candidate cannot be scored.
5. Inspect the **legacy-style diagnostic**: `current assets-current liabilities+net PPE` and `market cap+reviewed non-lease borrowing subset-cash`, on the very same transcribed figures. This is **not** actual legacy model output: original `STMT_TOTAL_DEBT` is not proven equivalent to the reviewed borrowing subset, and no historical legacy score is loaded or asserted. This diagnostic is solely to display *sensitivity to accounting perimeter*; actual old vs new scored rank comparisons are a later gate.

### Provenance, safety and accounting boundaries

- The `18` manually entered balance/financing inputs require **per-field** original section information (min 5 characters) and the exact original 10-K URL; invented values with plausible section descriptions cannot be detected without a human reviewer. No approval toggle is provided.
- Explicit no-scores / no-model-use booleans are required by the UI. Cross-ticker stored/parallel inputs are not accepted; changing ticker clears temporary input.
- The API uses a single explicit bounded issuer and existing database read. It never makes a live SEC CompanyFacts request, writes to the database, imports prices or persists reviewed inputs. `GET` returns source-only anchors; `POST` is an ephemeral arithmetic preview and does **not** submit an approval.
- Existing classification is an explicitly bounded, issuer-reviewed nonfinancial *pilot*; broad sector/industry mapping remains open. No REIT/bank/utility calculation.
- The policy's operating lease treatment remains **uncapitalised EV** with rent-inclusive GAAP operating earnings; finance leases are separate funding capital. Changes require a new reviewed calculation version, not a data patch.
- No automated security/market quote collection. Price timestamp is owner-entered and citation-only; a hyperlink alone is not independent verification of trading price or share-count coverage.
- The `known_at` timestamp is read from the existing ledger, never backdated to report end. Current market value can be used as of its supplied timestamp for a **current diagnostic only**; doing a historical as-of screening model will require true point-in-time historical price and filing-date checks.
- The synthetic complete-worksheet regression cases use **invented balance and market input amounts** with a real pinned issuer identity solely to test calculation/negative cases; they are *not* representations of Amazon's or Adobe's actual balance sheet and cannot become verified issuer examples.
- A complete `arithmetic_only` response is a mechanical consistency check, **not** evidence that a material lease, nonoperating asset or financial-instrument classification is correctly mapped. The original accounting notes require independent second-pass review.

## Acceptance and remaining work

CI must pass frontend build+TS, SEC regression tests, Python tests and standalone container smoke before PR merge. Cases cover isolated pinned AMZN/ADBE/COST original anchors, precise source statuses, missing-vs-zero, exclusion perimeters, forbidden caller override of source fields, invalid note/price citations, original CIK/period/accession rejection, look-ahead market price, false-score gate and synthetic legacy-style sensitivities.

**Phase 2J12 handoff:** perform an independent second source-extraction and accounting-review pass for complete lease, operating capital, nonoperating cash and market-share class disclosures of two or three real original issuers, with contemporaneous price evidence; inspect 2J10 operating-lease/current-liability treatment and model comparability; then consider reviewed source records and an explicitly separate model-consumption authorization. Do not label the current workbench an automated stock-ranking engine.
