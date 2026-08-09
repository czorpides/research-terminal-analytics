# Opportunity Radar v2 — advanced valuation and Stage-1 structure

This layer closes four evidence gaps left explicit by the fundamental/timing split.

## 1. Historical self-valuation

`get_opportunity_historical_valuation` joins the latest stored annual filing revision to the nearest prior raw traded close and historical diluted shares. It derives observed annual EV/EBITDA, FCF yield, EV/revenue and P/TBV without synthesising missing points.

A company needs at least five observed fiscal-year price/statement pairs before its own-history percentile can pass the valuation gate. Peer valuation remains a separate lens.

## 2. Financial-sector valuation

Financials no longer use generic industrial FCF, leverage or ROIC/WACC tests as their primary valuation/quality lens. The advanced layer derives tangible common equity, P/TBV and ROTCE and cross-checks them against peers and the company's observed P/TBV history.

Regulatory capital, funding liquidity and asset/credit quality remain explicit diligence gaps.

## 3. Cyclical normalization

Energy and Materials use median multi-year EBITDA and FCF margins to estimate normalized EBITDA and FCF at current revenue. The valuation gate then evaluates normalized EV/EBITDA and normalized FCF yield so peak-cycle earnings cannot create a false cheapness signal.

At least five usable annual margins are required before the normalized lens can pass.

## 4. Persistent Stage-1 timing

The technical pipeline now carries split-adjusted OHLC into `score.stage1.v0.1`. The stored record includes weekly bias, liquidity sweep, change of character, first higher low, MA50 reclaim/retest, RSI divergence, volume footprint, base low and structural invalidation.

The invalidation is the observed accumulation-base low. It is a thesis-structure reference, not an execution stop buffer.

Stage-1 is attached to Radar candidates at the route boundary so it can control timing without changing the fundamental opportunity score.

## History depth

The existing FMP statement calls now request/store up to ten annual periods rather than four. This changes response depth, not the number of provider calls per company. Existing shallow histories will be deepened on their next fundamentals refresh until at least eight annual periods are stored.
