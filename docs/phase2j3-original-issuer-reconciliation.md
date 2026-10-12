# Phase 2J3 — Official-source issuer statement reconciliation

## Scope / production safety

Separate **17 original SEC financial evidence observations** into an append-only, service-role-only ledger, never the original `fundamental_filings`, `fundamental_facts`, `data_points` or `scores`. An original filing and exact SEC accession are required for every record. Any subsequent cross-year comparative is explicitly identified with BOTH original-period and later evidence-filed accession; **first observed is actual insertion time, never backdated**. `model_eligible=false` and `score_eligible=false` are SQL CHECK constraints that cannot be flipped by a later data write.

### Confirmed official-source original income statement observations (USD millions)

| Company | 2025 | 2024 | 2023 | Accounting definition |
| --- | ---: | ---: | ---: | --- |
| PNC | 6,997 | 5,953 | 5,647 | Consolidated **net income**, before non-controlling interests and preferred dividends; not PNC net income attributable to common holders |
| AVGO | 23,126 | 5,895 | 14,082 | Consolidated GAAP **net income**; FY2024 includes discontinued operations loss and differs from continuing operations income |

Every amount individually anchors to the ORIGINAL FY 10-K's existing `source_filing_id` in the database, not a 2025 comparative masquerading as an original FY2023 filing. Original SEC URLs:
- PNC FY2025 https://www.sec.gov/Archives/edgar/data/713676/000071367626000020/pnc-20251231.htm
- PNC FY2024 https://www.sec.gov/Archives/edgar/data/713676/000071367625000027/pnc-20241231.htm
- PNC FY2023 https://www.sec.gov/Archives/edgar/data/713676/000071367624000028/pnc-20231231.htm
- AVGO FY2025 https://www.sec.gov/Archives/edgar/data/1730168/000173016825000121/avgo-20251102.htm
- AVGO FY2024 https://www.sec.gov/Archives/edgar/data/1730168/000173016824000139/avgo-20241103.htm
- AVGO FY2023 https://www.sec.gov/Archives/edgar/data/1730168/000173016823000096/avgo-20231029.htm

## Financial-sector issuer net revenue (FY2025, USD millions)

| Original issuer | Net interest income | Noninterest income | Net revenues | Result |
| --- | ---: | ---: | ---: | --- |
| PNC | 14,410 | 8,689 | 23,099 | Direct sum matches |
| WFC | 47,484 | 36,215 | 83,699 | Direct sum matches |
| GS | 13,559 | 44,724 | 58,283 | Direct sum matches |
| MS | Not yet separately classified | Not yet separately classified | 70,645 | **Incomplete bridge** |

Each line is from the company's original FY2025 annual SEC 10-K and has a clear issuer-accounting-specific metric basis; WFC and GS revenues were previously **missing** in the generic `STMT_REVENUE` source ledger but are now available here without altering that source. MS total net revenues are direct issuer reported; do not pretend to have verified a component bridge or substitute WM segment figures. Do not treat gross interest income as net revenue.

Links: PNC, WFC https://www.sec.gov/Archives/edgar/data/72971/000007297126000133/wfc-20251231_d2.htm, GS https://www.sec.gov/Archives/edgar/data/886982/000088698226000091/gs-20251231.htm, MS https://www.sec.gov/Archives/edgar/data/895421/000089542126000086/ms-20251231.htm

## Broadcom original vs split-adjusted comparatives

The original FY2023 10-K reported **427 million diluted weighted average shares** (rounded millions as reported). The FY2024 10-K retroactively restated this same FY2023 comparative to **4,272 million**, following a **ten-for-one forward split on 12 July 2024**. Multiplying the rounded 427m by ten yields 4,270m, which is *not* the later FY2024 reported value. Store both, referencing different actual filings, rather than false precision or historical backdating.

- `sec_corporate_action_evidence`: AVGO 2024-07-12 event, factor 10/1, original FY2024 SEC evidence accession.
- `sec_issuer_reconciliations`: 2023 split-adjusted later comparative = 4,272m shares, links to FY2023 original 10-K **and** FY2024 comparative. Raw 2023 original 427m fact remains untouched.
- Never treat an after-the-event comparative as a value known in 2023 backtests.

## Controls / no inference

1. Insert trigger validates active original FY source, exact source accession, true registrant asset match, SEC source provider, cross-year comparative chronology, unit and any linked raw fact **exact equality**. SQL UPDATE or DELETE always rejected (including service role).
2. Direct original filing amount verification is a **source check** performed during this research pass, not a formal financial data sign-off, model approval, independent audit of the entire statement or automatic quality certification.
3. All 17 rows + the share split are versioned source evidence. A SQL release assertion checks full 17-record coverage, 2023 original raw share preservation, 4.272bn comparative, and exact bank bridge sums. Safe reapplication uses unique keys / ON CONFLICT DO NOTHING.
4. Browser sees SEC links and source line definitions only via owner-JWT checked server function. No public table SELECT/UPDATE/DELETE privileges; no API can grant source facts scoring eligibility.
5. The existing backfill and its pg_cron worker are untouched.

## Remaining work

The following are **still open**: FY2024/FY2023 bank revenue components and issuer-specific mapping beyond the initial original FY2025 sample; MS component bridge; full SEC numerical reconciliations across all 100 curated firms; legal-filer continuity BLK (#86); SPGI FY2024 accession-matched fact extraction (#88); and the decisions regarding which basis is suitable for particular company-type valuations.

The next acceptance gate before any score permission is *versioned issuer/sector metrics with a documented reconciliation policy and independent review*, including share-split as-of eligibility. Phase 2J3 does not activate SEC facts in Piotroski or Radar.
