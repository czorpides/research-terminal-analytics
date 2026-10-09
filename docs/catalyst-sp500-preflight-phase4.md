# Phase 4 — Source-backed S&P 500 potential inclusion preflight (staging)

Implements an explicit, auditable standards-based **eligibility pre-screen**, not a predicted S&P committee decision and not a Swing score bonus.

Official source: https://www.spglobal.com/spdji/en/documents/methodologies/methodology-sp-us-indices.pdf (July 2026, pages 7–12).

## Screened requirements
- Verified company-level non-membership (avoid mistaking a second ticker/share class for a non-member).
- U.S. domicile, eligible common equity organisation/share type, qualifying U.S. listing, domestic-issuer SEC periodic reporting and at least 12 months' exchange history OR a separately documented exception such as an eligible spin-off.
- Company market cap at least USD 22.7 billion; security float-adjusted market cap at least USD 11.35 billion; investable-weight factor at least 0.10.
- At least 250,000 shares traded in EACH of the six preceding calendar months, and annual float-adjusted liquidity ratio at least 0.75.
- Positive GAAP net income from continuing operations in BOTH the latest quarter and aggregate of the latest four quarters.

Dollar threshold guidelines are reviewed by S&P quarterly. Supply methodologyReviewedAt only after checking the current official version/notice, never by blindly reusing the July rulebook. The screen will withhold market-cap gates if the review is more than 90 days old. Quarterly S&P 1500 index migrations and corporate transactions can involve exceptions; these must be handled by a reviewer, never inferred.

### POST API — no autonomous data feed
Endpoint: /api/public/catalysts/anticipations/screen-sp500.
Requires a server-only INTERNAL_JOB_TOKEN. Payload contains 1–20 sourced facts packets with these keys:
symbol, methodologyVersion (2026-07), methodologyReviewedAt, currentMember, usDomicile, eligibleUsListing, eligibleSecurityType, secDomesticReporting, ipoSeasoningOrExemption, companyMarketCapUsd, securityFloatMarketCapUsd, investableWeightFactor, lastSixMonthlySharesTraded, annualFloatAdjustedLiquidityRatio, gaapContinuingNetIncomeLatestQuarterUsd, gaapContinuingNetIncomeTrailingFourQuartersUsd.

For every non-null fact supply a value (boolean, numeric, or six-element numeric array), sourceUrl (HTTPS), sourceName, sourcePublishedAt and observedAt (complete ISO timestamp). Null facts stay unknown. Values MUST be sourced to authoritative official documents, a permitted index-membership feed, SEC filings, or licensed fundamentals: a price chart alone cannot establish eligibility. Company-level share-class treatment, GAAP continuing operations and currency conversions require reviewer diligence.

A new source-packet may create only an unverified candidate in catalyst_anticipations when membership is known to be absent and at least partial eligibility is documented. A confirmed member, any verified failure, stale/missing membership or out-of-date methodology is excluded or withheld with explanations. Each original evidence snapshot is immutable. New issuer facts create a new revision key. Candidates require the separate CATALYST_REVIEW_TOKEN to be independently verified via /api/public/catalysts/anticipations/review.

### Activation requirements
1. Apply PR62 and Phase 4 migrations to the isolated staging instance, with independent credential checks.
2. Connect an authorised, reliable point-in-time S&P membership dataset. The official announcement RSS feed previously returned HTTP 403; do not evade that block.
3. Map company-level free float, quarterly continuing GAAP income, traded monthly share volume and listing/IPO age, with reconciled USD denominators. None is assumed available from the existing generic FUND_MARKET_CAP metric.
4. Manually invoke a small test batch, independently review generated candidates, and check for false positives. Enable a scheduled feed only after data and access validation.
5. Score contribution remains 0. Research only until measured calibration demonstrates incremental benefit beyond Swing technicals.

**As shipped:** deterministic detector, authenticated source-packet interface, deduped unverified candidate storage and tests. **Not shipped:** licensed data, automatic live scanning, index committee probability or claims of real-world upcoming inclusions.
