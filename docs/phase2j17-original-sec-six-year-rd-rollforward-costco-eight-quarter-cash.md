# Phase 2J17 — Original SEC six-year R&D amortisation and Costco eight-quarter liquidity research

**Research date:** October 9, 2026 market-close observation (frozen historical cutoff). **Status:** manually extracted original SEC filings, source-linked; arithmetic checked in automated code. **NOT** independent second-person source attestation, GAAP-adjusted statements, accepted economic operating capital, issuer ranking or production scoring. No runtime SEC/price requests, migrations, price sync, backfill or changed model consumer.

## First result — complete earlier-year R&D history, three distinct software issuers

The user-requested 5-year R&D treatment was previously incomplete for Adobe and Autodesk, because only three historical FY cohorts were available. This phase adds 3 earlier FY years for both issuers from their separate original 10-Ks. It also uses **ServiceNow (NOW)** as a third original-issuer independent software holdout (not the 2J11 approved universe).

Every R&D figure comes directly from the issuer's consolidated operations statement, USD millions:

| Issuer | Six consecutive source FYs | Full-year R&D USD m, oldest to newest | Latest comparable FY operating income | Latest FY revenue |
|---|---|---|---:|---:|
| Adobe | FY2020–FY2025 | 2,188; 2,540; 2,987; 3,473; 3,944; 4,294 | FY2025 **8,706** | FY2025 **23,769** |
| Autodesk | FY2021–FY2026 | 932; 1,115; 1,219; 1,373; 1,485; 1,643 | FY2026 **1,578** | FY2026 **7,206** |
| ServiceNow | FY2020–FY2025 | 1,024; 1,397; 1,768; 2,124; 2,543; 2,960 | FY2025 **1,824** | FY2025 **13,278** |

Original official filings, with no non-primary-source input:
- Adobe FY2022 original 10-K `0000796343-23-000007`, FY2020/21/22 columns: https://www.sec.gov/Archives/edgar/data/796343/000079634323000007/adbe-20221202.htm
- Adobe FY2025 original 10-K `0000796343-26-000003`, FY2023/24/25 columns: https://www.sec.gov/Archives/edgar/data/796343/000079634326000003/adbe-20251128.htm
- Autodesk FY2023 original 10-K `0000769397-23-000036`, FY2021/22/23 columns: https://www.sec.gov/Archives/edgar/data/769397/000076939723000036/adsk-20230131.htm
- Autodesk FY2026 original 10-K `0000769397-26-000015`, FY2024/25/26 columns: https://www.sec.gov/Archives/edgar/data/769397/000076939726000015/adsk-20260131.htm
- ServiceNow FY2022 original 10-K `0001373715-23-000035`, FY2020/21/22 columns: https://www.sec.gov/Archives/edgar/data/1373715/000137371523000035/now-20221231.htm
- ServiceNow FY2025 original 10-K `0001373715-26-000007`, FY2023/24/25 columns: https://www.sec.gov/Archives/edgar/data/1373715/000137371526000007/now-20251231.htm

**Accounting convention for this test**: treat each full-year reported expensed R&D vintage as a hypothetical new economic intangible at the END of the FY, with zero first-year amortisation and equal L-year amortisation beginning the following FY. An older cohort incurs amortisation once in each of years 1 through L, before being fully removed. For the newest FY t, need all (L+1) annual periods t-L through t. A genuine six-year history is sufficient for 5-year lives and no earlier missing-value imputation.

```text
Opening economic R&D asset at beginning of FY t:
 sum for k=1..L [ R&D(t-k) × (L-k+1)/L ]

R&D added at end of FY t: original GAAP expense(t)

Annual amortisation during FY t:
 sum for k=1..L [ R&D(t-k)/L ]

Closing R&D asset:
 opening + current FY R&D - amortisation
 = sum for k=0..L-1 [ R&D(t-k) × (L-k)/L ]

Illustrative FY operating income:
 original GAAP FY operating income + original FY R&D - hypothetical annual amortisation

Illustrative FY operating margin: illustrative FY operating income / GAAP FY revenue.
```

The implementation reconciles all four numerical values exactly at USD millions with six decimal places, accounting for rounding, and checks the independently computed closing cohort sum. This is a *financial-analysis counterfactual*, NOT an approved adjusted EBIT. It is not based on the source company's capitalised development-asset balances (some software firms already capitalise qualifying software development costs), and therefore may double-count capital unless those accounts and acquired technology are reviewed.

### Exact research-only annual R&D rollforward examples

| Issuer | Assumed life | Opening R&D asset USD m | Current FY add USD m | FY amortisation USD m | Closing R&D asset USD m | Illustrative adjusted FY operating income USD m |
|---|---:|---:|---:|---:|---:|---:|
| Adobe | 2 years | 5,680.500 | 4,294 | 3,708.500 | 6,266.000 | 9,291.500 |
| Adobe | 3 years | 7,255.000 | 4,294 | 3,468.000 | 8,081.000 | 9,532.000 |
| Adobe | 5 years | 9,968.200 | 4,294 | 3,026.400 | 11,235.800 | 9,973.600 |
| Autodesk | 2 years | 2,171.500 | 1,643 | 1,429.000 | 2,385.500 | 1,792.000 |
| Autodesk | 3 years | 2,806.667 | 1,643 | 1,359.000 | 3,090.667 | 1,862.000 |
| Autodesk | 5 years | 3,947.200 | 1,643 | 1,224.800 | 4,365.400 | 1,996.200 |
| ServiceNow | 2 years | 3,605.000 | 2,960 | 2,333.500 | 4,231.500 | 2,450.500 |
| ServiceNow | 3 years | 4,548.333 | 2,960 | 2,145.000 | 5,363.333 | 2,639.000 |
| ServiceNow | 5 years | 6,066.600 | 2,960 | 1,771.200 | 7,255.400 | 3,012.800 |

**Not comparable as an annual score** without adjustments: Adobe and ServiceNow latest fiscal years end in 2025 while Autodesk ends January 2026. None is the corresponding TTM to October 9, 2026. The software 2J16 TTM data must not be treated as a new full-year R&D vintage; it overlaps FY cohort expenditure. No denominator/ROIC or price valuation is calculated. No sector approval or rankings can result from this research exercise.

## Second result — Costco two fiscal years of original quarterly cash observations

Original COST FY2024 base plus every FY2025 and FY2026 quarter/FY reporting date (USD millions):

| Period end | Cash + short investments | Unsettled card receivables in cash balance | Residual booked cash/investments after cards |
|---|---:|---:|---:|
| 2024-09-01 opening | 11,144 | 2,519 | 8,625 |
| 2024-11-24 | 11,827 | 2,789 | 9,038 |
| 2025-02-16 | 13,158 | 2,292 | 10,866 |
| 2025-05-11 | 14,850 | 2,587 | 12,263 |
| 2025-08-31 | 15,284 | 2,670 | 12,614 |
| 2025-11-23 | 17,183 | 3,095 | 14,088 |
| 2026-02-15 | 18,240 | 2,872 | 15,368 |
| 2026-05-10 | 19,996 | 3,078 | 16,918 |
| 2026-08-30 | 21,301 | 2,842 | 18,459 |

Each specific original 10-K or 10-Q note link is embedded per row in code and the owner UI:
- FY2024 original: https://www.sec.gov/Archives/edgar/data/909832/000090983224000049/cost-20240901.htm
- Q1 FY2025 original: https://www.sec.gov/Archives/edgar/data/909832/000090983224000079/cost-20241124.htm
- Q2 FY2025 original: https://www.sec.gov/Archives/edgar/data/909832/000090983225000015/cost-20250216.htm
- Q3 FY2025 original: https://www.sec.gov/Archives/edgar/data/909832/000090983225000033/cost-20250511.htm
- FY2025 original filing annual report attached to SEC filing: https://www.sec.gov/Archives/edgar/data/909832/000090983225000157/costannualreport2025.pdf
- Q1 FY2026 original: https://www.sec.gov/Archives/edgar/data/909832/000090983225000169/cost-20251123.htm
- Q2 FY2026 original: https://www.sec.gov/Archives/edgar/data/909832/000090983226000029/cost-20260215.htm
- Q3 FY2026 original: https://www.sec.gov/Archives/edgar/data/909832/000090983226000051/cost-20260510.htm
- FY2026 original: https://www.sec.gov/Archives/edgar/data/909832/000090983226000093/cost-20260830.htm

**Controlled inference:** this is precisely **nine period-end observations over eight consecutive FY2025/FY2026 intervals** (opening FY2024 + all eight quarter ends), NOT daily/weekly cash-flow or a statistically valid minimum operating cash threshold. Observed post-card cash after short settlements ranges from **8,625m to 18,459m**. The actual *operating liquidity requirement* is still unknown; supplier payment timing, inventory and credit/card merchant availability, leases, taxes and restricted offshore accounts are not measured. Do not interpret this book residual series as genuine surplus cash or assume it can be deducted from EV. The exact original SEC acceptance instant is not populated for every quarter; dated report period is NOT known-at time for historical backtests.

## Implementation and release criteria

- Pure SEC module `rd-rollforward-third-issuer.ts` contains original annual R&D source series and a correct beginning-asset/addition/amortisation/closing-asset schedule for 2/3/5-year years across Adobe, Autodesk and **third issuer ServiceNow**. Exact-decimal BigInt arithmetic; zero source gap-filling; no overlapping FY/TTM treatments.
- `costco-eight-quarter-cash-evidence.ts` supplies nine official row-level SEC annual and quarter source links and exact operating card-receivable subtractions, with prior 2J16 three-snapshot parity tests.
- `SecHistoricalEconomicsReview.tsx` displays reviewed R&D rollforwards for all three companies when Adobe is selected, and FY2024–FY2026 Costco period-end cash data when Costco is selected. Owner-only existing page access, no new endpoints or manual roles.
- SEC regression tests verify all nine original R&D schedules against hard expected opening/additions/amortisation/closing/operating earnings, cash series rows and dates, original source host, and all permanent no-scoring flags.
- No cross-company GAAP-earnings ranking, adjusted EBIT score, adjusted ROC, original financial statement alteration, or approval of an accounting policy. SEC only inputs transcribed from original filings; no independent second human review.

### Next independent review

Source-verify historical software capitalised development costs, contract acquisition capital, acquired technologies and goodwill, opening amortisation, lease ROUs, and stock-compensation dilution across issuers. Obtain original SEC filing acceptance instants for the Costco FY2025/FY2026 quarterly series, reconstruct operating working-capital cash needs rather than deduce a cash floor from quarter-end balances, and require a second human reviewer. Only then is an issuer out-of-sample capital *return* comparison justifiable.

**Safety assertion:** no external provider purchase, no stored data changes, no scoring, no model, no Radar integration. Production browser/deploy acceptance remains separate.
