# Phase 2J5 — Model-dependent SEC accounting reconciliation priorities

## Decision: reconcile actual model inputs first

The Research Terminal source collector now holds **97 / 100** curated US SEC-covered issuers, **95 / 97** with three consecutive original annual 10-Ks (verified 2026-10-12). Three issuer exceptions remain separately tracked: BLK legal-filer lineage, SPGI accession-matched FY2024 parser gap, XOM missing issuer import.

The 2J4 owner review and raw issuer-document reconciliation controls remain separate and unchanged. This stage adds a protected, **read-only** financial model dependency audit. It does NOT recalculate Piotroski, Magic Formula, valuation, quality, DCF or Radar scores, or enable a single SEC source value in those scores.

### Exact code examined

- `src/lib/opportunity/fundamental-models.ts`: `STATEMENT_METRICS`, `computePiotroski`, `computeMagicFormulaRaw`.
- `src/lib/scoring/run.server.ts`: `runFundamentalScoresForAllAssets` wiring to the above models and to `computeValuationScore`, `computeQualityScore`.
- `src/lib/opportunity/fundamental-history.server.ts`: Phase 2J2 *FMP-only* source embargo remains.
- `src/lib/scoring/valuation.server.ts`, `src/lib/ingestion/fundamentals/metrics.ts`: valuation/quality currently consume **pre-calculated** `FUND_*` ratios, not direct annual SEC 10-K facts.
- A functioning, source-fed discounted-cash-flow model **is not part of these scoring dependencies**. Do NOT claim SEC filing coverage creates DCF readiness.

## Priorities grounded in the current code and source gaps

**P0** — remove model-critical blockers before broader line-by-line reconciliation:
- `STMT_EBIT`: required for Greenblatt ROC and earnings yield, **zero original SEC 10-K values** mapped across 97 issuers. Need officially supported tag mapping / original income statement reconciliation. Never assume operating income, pretax earnings or EBITDA universally equals EBIT.
- `STMT_TOTAL_DEBT`: required for EV and Magic Formula, **zero original SEC values** mapped. Define interest-bearing short-/long-term financing debt, leases if policy includes them, prevent double counts with debt component tags.
- `STMT_NET_INCOME`: Piotroski current+prior annual profit; requires consolidated vs parent-attributable semantics. PNC and AVGO have separate 3-year checked observations, but raw missing tags remain missing.
- `STMT_OPERATING_CASH_FLOW`: positive CFO and cash earnings quality; source coverage strong but numerical/continuing-operations basis not reconciled.
- `STMT_TOTAL_ASSETS`: 3 consecutive annual periods needed for current and prior asset returns and turnover denominators. Present tag is NOT source audit.
- `STMT_REVENUE`: 3 years for changes in asset turnover. Four banks have issuer-level 3-year net revenue evidence but sector-specific accounting precludes treating it as industrial net sales.

**P1** — complete Piotroski and Magic Formula denominators:
- `STMT_GROSS_PROFIT`: only **27 of 97** issuers have sufficient original SEC-year observations for two-year gross-margin comparisons; many financial firms have no conceptually comparable gross profit at all. Sector validation before backfill.
- `STMT_LONG_TERM_DEBT`: 2 years of original long-term leverage.
- `STMT_CURRENT_ASSETS`, `STMT_CURRENT_LIABILITIES`: 2 years for liquidity test, 1 for Magic Formula working capital; current/noncurrent classified balance sheet required.
- `STMT_WEIGHTED_AVG_SHARES`: present at most issuers but this is **diluted weighted-average**, not the precise year-end common shares outstanding normally used to test equity issuance. Splits compound that error. The existing computation uses it for "no new shares", and this is an accounting-definition/model mismatch to correct before SEC model eligibility.
- `STMT_CASH_AND_EQUIVALENTS`, `STMT_NET_PROPERTY_PLANT_EQUIPMENT`: enterprise value / return on operating capital; restricted cash, leases, assets under construction, capex and capital employed scope need policy.

**Non-goals**: Expanding 97 issuers to an arbitrarily greater universe, retroactively changing as-observed SEC filing timestamps, treating 2J4 research-only approvals as permission to score, re-running original SEC provider jobs without reviewed exception plans, or reconstructing FMP-provided historical multiples from unsuitable SEC tags.

### True dependency counts

15 explicit model × metric rows (9 Piotroski, 6 Magic Formula), representing 13 distinct source tags. Expected annual observations reflect actual model operations: NI current/prior 2, CFO current 1, assets/revenue 3, LT debt/current balance sheet/shares/gross profit 2, and one latest FY for each Magic input. These requirements are **minimal mechanical inputs**, not peer comparability or regulatory fitness.

The whole-universe view `sec_model_metric_readiness` covers all 97 issuer×15 model dependencies and distinguishes direct original-year source tags, separately checked issuer-accounted evidence, no eligible tag, missing history, share-denominator mismatch, sector exclusions, industry mapping gaps and still-unreconciled values. `sec_model_metric_priorities` aggregates these by model/metric and is service-role-only. Every model and score permission remains **false**.

The new owner-only GET `/api/public/ingest/sec-model-priorities` and Data Health panel show P0/P1, exact required annual observations, source coverage, issuer-checked coverage and accounting risk for each input. GET has no write handlers, cannot trigger a scoring pass, and does not enqueue source provider requests.

## Proposed Phase 2J6 limited scope

1. Establish industry/sector identities for the curated SEC pool; exclude banks/REITs/utilities from the generic Magic Formula and reconcile financial sector net revenues separately.
2. Choose **a small industrial issuer validation sample** (not all 97) and map exact original 10-K **EBIT/operating income** reporting, **interest-bearing debt** and gross profit in original filings with an explicit versioned taxonomy and a second numerical extraction check.
3. Fix the year-end common-share outstanding vs diluted weighted-average basis, including split-effective and original-report-known-as-of dates. Do not silently rewrite legacy Piotroski scores or use later-filed split-adjusted comparatives in backtests.
4. After passing tests on selected issuers, expand the issuer-specific mapping to sectors with homogeneous accounting definitions. Only then propose consumption via the existing 2J4 separate approval workflow and a new explicit scoring code review.

## Validation

- SQL migration dry-run with `BEGIN; ... ROLLBACK;` on actual Lovable Cloud.
- Compare actual model-dependent source coverage: EBIT and total debt mapped for **zero** issuers; gross profit threshold limited; NI, CFO and assets more populated.
- Test actual model behaviour when EBIT/debt/gross profit missing and when financials excluded.
- CI TS/React build, Python analytics and standalone Docker smoke.
- Merge, install service-role-only SQL views, verify no prior source records or scores touched and anonymous/authenticated reads blocked; publish updated owner Data Health.
