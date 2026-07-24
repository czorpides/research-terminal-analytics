# Opportunity Radar v1

## Purpose

The Radar looks for cases where the share price appears more damaged than the underlying business.
It is a research-prioritisation system, not a recommendation engine.

The central safeguards are:

- cheapness cannot offset high permanent-impairment risk;
- the company-specific part of a fall is shown separately from the opportunity score;
- missing data lowers confidence and blocks production eligibility;
- proxy inputs remain visibly labelled as proxies;
- banks and REITs are blocked until their sector-specific models exist;
- the 5–10 year view is a quality profile, not a return forecast.

## One evidence engine, three outputs

All horizons use the same stored evidence. They do not duplicate raw prices or financial statements.

| Horizon    | Output            | Main use                                      | Intended refresh                  |
| ---------- | ----------------- | --------------------------------------------- | --------------------------------- |
| 1–3 years  | Opportunity score | Price overreaction and plausible recovery     | Daily and after material releases |
| 3–5 years  | Suitability score | Recovery durability and sustainable cash flow | Weekly and after results          |
| 5–10 years | Quality profile   | Durability, reinvestment and entry valuation  | Monthly and after results         |

### 1–3 year weights

| Component                             | Weight |
| ------------------------------------- | -----: |
| Price damage after peer effects       |    20% |
| Fundamental resilience                |    25% |
| Valuation compression                 |    20% |
| Evidence the problem is temporary     |    15% |
| Recovery confirmation                 |    10% |
| Insider, short and ownership evidence |    10% |

### 3–5 year weights

| Component                          | Weight |
| ---------------------------------- | -----: |
| Fundamental resilience             |    20% |
| Sustainable earnings and cash flow |    20% |
| Valuation compression              |    10% |
| Balance-sheet durability           |    15% |
| Recovery durability                |    15% |
| Resilience across macro conditions |    10% |
| Capital allocation                 |    10% |

### 5–10 year profile weights

| Component                | Weight |
| ------------------------ | -----: |
| Business quality         |    20% |
| Reinvestment runway      |    25% |
| Balance-sheet durability |    15% |
| Industry durability      |    15% |
| Capital allocation       |    15% |
| Entry valuation          |    10% |

## Current dislocation calculation

The first rollout uses the stock's 12-month return, drawdown from its 52-week high, the median
return of its tracked industry peers and the breadth of weakness across those peers.

The current company-specific figure is explicitly a proxy. It removes the industry median and
sector breadth, but does not yet remove:

- global and local market returns;
- value, growth, size, quality and momentum factors;
- interest-rate and credit-spread exposure;
- currency exposure;
- commodity exposure.

Those controls must pass point-in-time validation before the idiosyncrasy input can be marked
observed.

## Confidence and eligibility

Missing score components are held at a neutral value of 50 in the preliminary score. This prevents
missing evidence from creating an artificial positive or negative result. Missing components receive
zero coverage and zero source confidence.

Proxy inputs receive 55% coverage credit. Critical inputs must be directly observed before the
confidence score can exceed 69.

For the 1–3 year model, production eligibility initially requires:

- Opportunity Score of at least 70;
- Data Confidence of at least 70;
- Permanent Impairment Risk below 30;
- Idiosyncrasy Score of at least 60;
- no unsupported sector model;
- every critical input directly observed.

The displayed Research Priority is:

```text
Opportunity Score × square root(Data Confidence) × (1 − Impairment Risk)
```

Confidence and impairment are expressed as decimals in that formula.

## Data available in this release

| Capability                          | Current state | Treatment                                        |
| ----------------------------------- | ------------- | ------------------------------------------------ |
| Three-year adjusted price behaviour | Live          | Used for drawdown, trend, volatility and returns |
| Current fundamentals                | Partial       | Used as visible valuation and quality proxies    |
| Reported EPS events                 | Partial       | Used as a limited temporary-problem proxy        |
| Historical forward valuations       | Missing       | No contribution, confidence reduced              |
| Consensus revision history          | Missing       | No contribution, confidence reduced              |
| Insider and short-interest history  | Missing       | No contribution, confidence reduced              |
| Full systematic factor model        | Missing       | Industry-only proxy, production blocked          |
| Long-run capital allocation         | Missing       | 5–10 year output stays experimental              |

## Refresh behaviour

- A successful daily equity-price ingestion immediately recomputes that asset's technical scores.
- A verified earnings event refreshes price and fundamentals, then recomputes peer-relative
  fundamental scores without re-reading every asset's price history.
- The Radar reads the latest stored scores and refreshes in the browser every 15 minutes and on
  window focus.
- Market expansion remains disabled until data quality passes the activation rules shown in the UI.

## Capacity rules

The first shadow trial loads at most 500 active equities. The limit is explicit in the interface.
It prevents a small provider plan or database query limit from silently degrading coverage.

Expansion should occur only after measuring:

- adjusted-price completeness;
- fundamentals and estimate coverage;
- identifier and corporate-action accuracy;
- ingestion success and provider consumption;
- database growth and calculation time;
- point-in-time backtest integrity;
- delisted-company coverage.

## Next model work

1. Store quarterly and annual facts with both period end and publication timestamp.
2. Add historical forward multiples and consensus revisions.
3. Add the market, country, industry, style and macro residual-return model.
4. Add verified insider, short-interest and ownership adapters with reporting-lag metadata.
5. Build separate financial-company and REIT impairment models.
6. Run the 1–3 and 3–5 year models in shadow mode across historical constituents.
7. Keep the 5–10 year profile experimental until it adds out-of-sample value.
