# Phases 4 and 5 acceptance contract

## Scope

Phase 4 adds a US Labour Engine. Phase 5 adds a US Market Engine and a cross-engine Regime Monitor. Both use the existing region-aware registry, immutable observations and vintage tables introduced in Stage 1.

The decision-facing layer is deliberately transparent:

- Labour Heat Score: direction-adjusted rolling z-scores across employment, slack, demand and wages.
- Market Stress Score: direction-adjusted rolling z-scores across equities, volatility, credit, real yields, FX and commodities.
- Current Regime: inspectable rules over Growth, Inflation, Liquidity, Labour and Market scores.

PCA and HMM calculations are active in the stateless analytics service, but their database artifacts remain `approved=false` and `status='shadow'`. They are corroborating evidence, not the accepted live state call.

## Data registry

Phase 4 seeds ten FRED series: UNRATE, U6RATE, PAYEMS, USPRIV, ICSA, CCSA, JTSJOL, JTSQUR, CIVPART and CES0500000003.

Phase 5 seeds eight FRED series: SP500, NASDAQCOM, VIXCLS, BAMLH0A0HYM2, DFII10, DTWEXBGS, DCOILWTICO and NFCI.

Every ingest is idempotent and vintage-preserving. A new vintage is written only for a new observation or a changed historical value. Long histories are paginated past Supabase's default 1,000-row response cap.

## Manual first-run sequence

No recurring schedule is enabled until a complete manual run succeeds.

1. Apply `20260722210000_stage4_5_us_labour_market_regime.sql`.
2. `POST /api/public/ingest/us-labour-fred?years=30&pipeline=1` with the publishable-key header.
3. `POST /api/public/ingest/us-market-fred?years=30` with the publishable-key header.
4. `POST /api/public/models/us-market-regime` with the publishable-key header.
5. Inspect `/macro/labour`, `/macro/market`, `/macro/regime` and the Phases 4-5 block on `/data-health`.

## Acceptance gates

- All 18 registry rows exist and point to FRED.
- At least 50% configured weight is available for Labour Heat and 55% for Market Stress.
- The ingest retry writes zero duplicate observations when FRED values are unchanged.
- Labour Kalman outputs echo the explicit `labour_engine.us.kalman_llt` key and are persisted only after identity validation.
- PCA receives at least 36 aligned months, no more than 20% missing cells, and at least four market features.
- PCA loadings and explained variance are persisted with `approved=false`.
- HMM receives at least 36 complete months and returns probabilities summing to one.
- HMM states are persisted with `status='shadow'`.
- The rules-based Regime Monitor exposes all five inputs and reports missing inputs instead of substituting fabricated values.
- TypeScript check, production build and Python analytics tests pass.

## Known limitations

- FRED snapshots are not verified ALFRED point-in-time vintages until a real-time archive is backfilled.
- S&P 500 history on FRED can be shorter than the requested 30-year window due to licensing coverage.
- The live score thresholds and weights are economic priors. They need sensitivity review after enough live runs.
- HMM state labels are oriented by the market-stress feature. They are not causal labels and remain shadow until transition persistence and out-of-sample stability are reviewed.
- No scheduled ingest or automated model approval is enabled in this phase.
