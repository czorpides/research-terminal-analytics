# Phase 2J13 — Original SEC operating-capital and dated market-value sensitivities

**Scope:** COST FY2026 and ADBE FY2025, with 2026-10-09 closing quotes. This is conditional research arithmetic, **not** approved enterprise value, Magic Formula or a time-consistent trading signal. It does not write to the database or alter scores. All amounts below are USD millions unless stated.

## Dated market observations — explicit share-timing mismatch

| Item | COST | ADBE |
|---|---:|---:|
| 9 Oct 2026 closing price | $946.92 | $242.27 |
| Published share count used | 443,129,349 | 389.2m (rounded) |
| Share-count observation date | 29 Sep 2026 | 18 Sep 2026 |
| Public SEC filing available | 2026 original 10-K | Q3 FY2026 10-Q, filed 22 Sep |
| Approximate market cap (USD bn) | **419.608** | **94.291** |

Sources: Costco original 10-K https://www.sec.gov/Archives/edgar/data/909832/000090983226000093/cost-20260830.htm , company investor quote https://investor.costco.com/stock-info/ and dated historical secondary source https://ycharts.com/companies/COST/price . Adobe Q3 FY2026 10-Q https://www.sec.gov/Archives/edgar/data/796343/000079634326000156/adbe-20260828.htm , historical close https://ycharts.com/companies/ADBE/price and https://stockanalysis.com/stocks/adbe/history/ .

**Important:** a stock closing price times the most recently public but **older** shares is an estimate, not point-in-time exact market cap. Adobe's quoted shares are explicitly rounded by 10-Q issuer disclosure and materially below its older 2025 10-K year-end shares; substituting 413m would create an inaccurate October share basis. The 2025 operating income is also **stale** relative to the now-public August 2026 10-Q. Never compare stock prices to original FY report without recording known-at and fiscal currency.

## Conditional operating capital sensitivity — no unsupported source rewrites

The arithmetic reads the previously source-cross-footed 2J12 original statement and lease fixtures. The following scenarios **assume** different cash and investment classifications; they are not issuer declarations of restricted/free cash or model-approved classifications:

```text
Operating capital = (original current assets - assumed nonoperating cash/investment amount)
                    - (current liabilities - observed current borrowing and lease inclusions)
                    + original net PPE + unduplicated finance lease ROU asset.
```

| Scenario | COST operating capital (USD m) | COST ROC | ADBE conditional capital (USD m) | ADBE ROC status |
|---|---:|---:|---:|---|
| Cash and investments retained as operating | 42,210 | 27.68% | 1,913 | 455.10% **not comparable** |
| Cash excluded; investments retained | 22,003 | 53.11% | (3,518) | **Unavailable: negative denominator** |
| Cash and short investments excluded | 20,909 | 55.89% | (4,682) | **Unavailable: negative denominator** |

Costco: operating income 11,685; CA 46,582; CL 43,952; borrowings current 2,248; finance lease current 94; operating lease current 192; net PPE 35,633; finance ROU separately in other long-term assets 1,413; cash 20,207; short investments 1,094. Note 5 proves the ROU asset is outside PPE. Sources: Costco original 10-K balance sheet and leases notes, above.

Adobe: operating income 8,706; CA 10,163; CL 10,200; current debt 0; operating lease current 77; net PPE 1,873; cash 5,431; short investments 1,164; finance lease liability/ROU not independently quantified, therefore **zero is only a disclosed hypothetical scenario assumption**. A large deferred revenue balance 6,905 already is an operating current liability, and radically affects capital. Source: Adobe original FY2025 10-K https://www.sec.gov/Archives/edgar/data/796343/000079634326000003/adbe-20251128.htm .

For reference: the Costco operating capital denominator ranges by **over 2×** across even these constrained scenarios. Adobe's negative denominator is a material **founder/methodology fit issue**, not an invitation to force positive returns. The standard Greenblatt tangible capital formula is unreliable for cross-sector comparisons of negative-working-capital subscription businesses and asset-based retailers. An separately reviewed asset-light/software-specific policy might be required.

## Conditional enterprise value and yield — sensitivity, NOT actual market EV

Scenario EV = approximate quoted market cap + original carrying borrowings + explicitly observed finance leases − cash/investments *according to the scenario*.

Other unquantified claims (e.g. noncontrolling interests and other financing liabilities) are **assumed zero only in this hypothetical EV calculation**. An absence of a disclosed line is not proof. Adobe also conditionally assumes unobserved finance lease figures are zero. No actual data records are zero-filled, and these outputs never become model/scoring eligible.

| Cash treatment | COST conditional EV (USD bn) | COST conditional EY | ADBE conditional EV (USD bn) | ADBE conditional EY |
|---|---:|---:|---:|---:|
| No cash or investments deducted | 427.183 | 2.74% | 100.501 | 8.66% |
| Cash deducted | 406.976 | 2.87% | 95.070 | 9.16% |
| Cash + short investments deducted | 405.882 | 2.88% | 93.906 | 9.27% |

These values are *illustrative scenario calculations*, not bounded/verified actual enterprise values. Do not interpret an apparent 8–9% Adobe yield as necessarily a superior investment. The comparability depends on financing perimeters, comparable earnings periods, share counts and cash availability; deferred income, lease accounting, R&D intensity and tangible capital distort the ranking.

## Implemented work

- New pure immutable `getSecValuationScenarios` from `point-in-time-valuation-sensitivity.ts`: uses the exact 2J12 source-checked original financial-statement fixtures, fixed two-price/snapshot evidence, BigInt arithmetic, and three explicit cash classifications.
- New `SecPriceSensitivity` owner-page component displays price/share provenance, sensitivity and accounting caveats. No external provider request is made; quoted prices are explicitly **historical fixtures**, not live feeds.
- Unit tests verify the exact COST and ADBE share-derived market-cap products, 2026-10-09 date, COD/ADBE capital signs, differences and permanent no scoring/model usage.
- Existing 2J10 and 2J11 calculation APIs, owner authorization, Magic Formula production calculator, SEC histories, source ledger and Radar untouched. `modelEligible=false`, `scoringEligible=false`, `storedChanges=0`.

## Remaining acceptance gates / Phase 2J14

1. Deployment/browser check after CI. No claim this new static historical snapshot is live/repricing automatically.
2. Review DCF-vs-Magic Formula equity capital bridge against share repurchases and dilution; exact daily close share count is not known from quarterly cover pages.
3. Independently approve cash/investments available to investors (vs operational liquidity) and check non-controlling interests and preferred funding by issuer; Adobe missing finance leases cannot be assigned zero without a note-level sign-off.
4. Include *current* operating earnings (trailing twelve months as of price timestamp), not solely FY2025 Adobe figures, plus sector-specific cash/working-capital policy.
5. Before consuming in Radar, develop a second independent human source verification and controlled issuer-/sector-based comparison. **Do not** relax the 2J10 score gate simply to achieve a complete Magic Formula rank.

**Verdict:** A dated reproducible scenario view is useful now, but production Magic Formula **approval is blocked** by material classification and software-sector ROC comparability.
