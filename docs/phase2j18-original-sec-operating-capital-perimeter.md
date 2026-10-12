# Phase 2J18 — Original SEC software capital perimeter and anti-double-count control

**Original annual-report accounting only**: Adobe FY2025 (2025-11-28), Autodesk FY2026 (2026-01-31), ServiceNow FY2025 (2025-12-31). Analysis cut-off 2026-10-09 20:00 UTC. Version `sec.research.software_capital_perimeter.draft.v1.0.0`. **No claim of contemporaneous October 2026 invested capital**; Adobe and Autodesk already have more recent 10-Qs, and these are **original year-end comparables to Phase 2J17 annual R&D**. Data comes from issuer-published **original** SEC annual accounts and notes, and is manually read and arithmetically reconciled. No independent second HUMAN reviewer has signed off.

Sources:
- Adobe original FY2025 10-K: https://www.sec.gov/Archives/edgar/data/796343/000079634326000003/adbe-20251128.htm . Consolidated balance sheets; Notes 2 (Revenue/Contracts), 7 (Leases) and 8 (Goodwill and Other Intangibles).
- Autodesk original FY2026 10-K: https://www.sec.gov/Archives/edgar/data/769397/000076939726000015/adsk-20260131.htm . Consolidated balance sheets; Note 2 (Contract Costs), property/software/lease disclosures; Note 9 (Intangibles/Goodwill).
- ServiceNow original FY2025 10-K: https://www.sec.gov/Archives/edgar/data/1373715/000137371526000007/now-20251231.htm . Consolidated balance sheets; revenue/deferred commissions accounting policy; Notes 6 (Acquired Intangibles and Goodwill), 17 (Leases), and software-development-cost policy.

## Accounting facts and original note bridges, USD millions

| Original issuer FY | Adobe 2025 | Autodesk 2026 | ServiceNow 2025 |
|---|---:|---:|---:|
| **Current assets, as reported** | 10,163 | 4,942 | 10,471 |
| **Current liabilities, as reported** | 10,200 | 5,808 | 10,443 |
| Current assets − current liabilities (NOT operating NWC) | **(37)** | **(866)** | **28** |
| **Goodwill, as already on balance sheet** | 12,857 | 4,295 | 3,578 |
| **Purchased acquired intangibles, net, already on balance sheet** | 495 | 467 | 1,121 |
| Finite-life acquired intangible gross before amortisation | 2,521 | 2,069 | 1,709 |
| Related accumulated amortisation (contra-asset) | (2,026) | (1,602) | (588) |
| Acquired developed technology **net** (subset, not additive) | 28 | 242 | *Not separately net-allocated* |
| Capitalised contract acquisition costs, total (already booked) | 721 | 913 | 1,704 |
| ↳ Current component (already inside reported current assets) | 257 | *Not independently split* | 590 |
| ↳ Noncurrent component (already inside long-term assets) | 464 | *Not independently split* | 1,114 |
| Reported contract **assets** | 241 total (current/long split unavailable) | *Not material; not quantified zero* | *Not separately verified* |
| Deferred revenue, **current** liability | 6,905 | 4,406 | 8,314 |
| Deferred revenue, noncurrent liability | 125 | 287 | 120 |
| **Total deferred revenue** | 7,030 | 4,693 | 8,434 |
| Operating lease **right-of-use** assets (already booked separately from PPE) | 312 | 157 | 806 |
| Operating lease liabilities, current | 77 | 52 | 112 |
| Operating lease liabilities, noncurrent | 361 | 199 | 800 |
| **Total operating lease liabilities** | 438 | 251 | 912 |
| Finance lease liability | *Not independently verified* | *Not independently verified* | **0 — issuer expressly reports none** |
| Hypothetical 2J17 **five-year** research asset (NOT booked GAAP) | 11,235.8 | 4,365.4 | 7,255.4 |

The original issuer disclosures support precise conclusions:
1. **Do not add existing assets twice.** Purchased technology is already **within** purchased intangibles, and contract acquisition costs are already **within** recognised current and long-term assets. Operating lease ROU assets likewise are already recorded separately from PPE; whether to include them in *economic* capital depends on symmetric operating lease earnings treatment, not a second balance-sheet entry.
2. **Unknown current/long-term allocation stays unknown.** Adobe's 721 = current 257 + noncurrent 464 from the note (noncurrent 464). ServiceNow's 1,704 = current 590 + noncurrent 1,114 from separately displayed lines. Autodesk reports total 913 across other/current assets, but does **not** provide a verified current/noncurrent breakdown suitable for this bridge; both fractions remain `null`. Adobe's separate contract asset total of 241 similarly cannot be dropped wholesale into current assets; the issuer says these span prepaid/current and other long-term assets, without a quantified split.
3. **Deferred revenue is an obligation, not conventional borrowing.** Its full recorded liability is already recognised, but to switch to an economic cost-to-serve approach one must explicitly define delivery costs, gross margin, historical renewals/refunds and the working-capital mapping. Neither leaving it at full face amount nor blanket removing it from invested capital is approved as a cross-company policy.
4. **Acquired technology and development costs differ.** Adobe has 28 net purchased technology; Autodesk has 242 net developed technologies. ServiceNow lists 1,316 *gross* developed technology within total 1,709 gross but **does not separately allocate accumulated amortisation**, so no fictitious `netDevelopedTech` is manufactured. Acquired intangibles arise in purchase accounting, not from GAAP current-period internal R&D expense. The hypothetical R&D asset requires a separately approved treatment to ensure internally developed assets already capitalised are not recognised again.
5. **Development accounting itself differs.** Autodesk says capitalised internal-use software costs were **not material** as of FY2026/25; not evidence they were precisely zero. ServiceNow says costs between software technological feasibility and release have not been material and all software development costs have been expensed to R&D. Adobe's internally capitalised development component is not independently quantified here.
6. **Leases must be bilateral.** Operating lease ROU vs liabilities and rent-inclusive GAAP earnings require consistent treatment. Annual FY2025 ServiceNow expressly reports **no financing leases**; absence is issuer-specific. Adobe and Autodesk missing verified finance lease figures remain `null`, not 0.

## What is reconciled, and what remains blocked

The Phase 2J18 code performs original notes cross-footing as follows:

- Acquired intangibles: gross minus accumulated amortisation = net for all 3.
- Goodwill: opening book balance + acquisition additions + FX/other = closing book balance for all 3.
- Contract costs: current + noncurrent = total for Adobe and ServiceNow; Autodesk **cannot check** the split and remains explicitly incomplete.
- Operating lease current + noncurrent = total liability, excluding lease ROU assets (not interchangeable with liabilities).
- Deferred revenue current + noncurrent = recorded obligation.

These checks prove arithmetic consistency of the transcribed source amounts, **not** independent accounting-policy approval. The 2J17 five-year hypothetical R&D asset and FY hypothetical adjusted earnings are shown separately alongside the already-booked assets, but the code **does not** sum them to a spurious invested-capital denominator.

This distinction is important for asset-light enterprise software companies: a $1,704m contract-cost asset at ServiceNow is economically different from the hypothetically capitalised $7,255.4m R&D asset. Both may relate to customer economics, but they are not fungible and cannot be added, removed or amortised under the same policy without evidence.

No valid **return on capital** is produced. The code reports `operatingEconomicCapitalUsd:null`, `returnOnCapitalBps:null`, `validMagicFormulaRank:false`, `modelEligible:false`, `scoringEligible:false` and `storedChanges:0` for **all three** issuers. No per-period overlap/double-count is silently auto-corrected.

## Implementation

- `src/lib/ingestion/sec/software-operating-capital-perimeter.ts`: immutable sourced year-end 10-K observations with explicit `book_asset_already_in_balance_sheet`, `book_liability_already_in_balance_sheet`, `original_note_amount_not_separately_allocated`, `not_quantified_do_not_impute_zero`, `reported_absent` and `hypothetical_rnd_not_a_gaap_asset` policies; strict fiscal-year pairing to 2J17. Exact-integer arithmetic on SEC USD millions.
- `software-operating-capital-perimeter.test.ts`: includes goodwill/intangible/contract/lease and deferred revenue expected-value checks; unknown-vs-zero issuer distinctions; strict original source/fiscal end identity; no producer model score assertions.
- `src/components/research/SecSoftwareCapitalPerimeter.tsx`: owner-only SEC Valuation Workbench three-issuer table and note decision register, ahead of earlier R&D-only chart. Neither external API nor database writes are introduced.
- Original data ingestion, R&D FY2020–26 cohorts, Magic Formula scorer, Radar, original vendor providers, historical data and payment infrastructure are **unchanged**. No new service or subscription required.

## Phase 2J19 recommended

1. Obtain source note detail (if available) for noncurrent/current customer contract assets and acquisition/development capital *by period*, plus current share count/leases for a consistent as-of valuation date. Document **where source fields cannot be split** and keep them null rather than inferring.
2. Define competing **economic capital bases** (acquisition-inclusive vs tangible operating capital; cost-to-serve vs full deferred-revenue face; operating-lease-capitalised vs rent-inclusive), each with internally consistent adjusted EBIT and financing claims.
3. Run the alternative definitions on independent held-out software firms and historical FYs, with human second-review of original note classification and a separately versioned eligibility decision. No cross-sector promotion merely because the arithmetic passes.

**Release criteria:** frontend lint diagnostic/build/typecheck + SEC regression suite, Python analytics and standalone Docker smoke all successful before merge; production authentication/visual browser acceptance remains separate.
