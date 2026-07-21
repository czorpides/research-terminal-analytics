## Phase: Prompt 7 — Fundamentals, Valuation & Quality scoring

Next major area. Adds the first non-price signal layer so scores stop being pure technicals and Security Master gets real fundamentals to display.

### 1. Fundamentals ingestion (FMP as Tier 2 primary)

- New module `src/lib/ingestion/fundamentals/ingest.server.ts` pulling from FMP `/stable/`:
  - `key-metrics-ttm` (P/E, P/B, P/S, EV/EBITDA, ROE, ROIC, debt/equity, current ratio, FCF yield)
  - `ratios-ttm` (margins, turnover)
  - `profile` (marketCap, beta, sector cross-check)
- Persist into existing `data_points` keyed by `subject_id = asset.id` with `metric_code` per fundamental. Reuses reliability framework — no schema change.
- Quality gates: reject negative-where-impossible, stale > 120d, missing marketCap. Failed rows counted in `ingestion_runs`.
- Cross-verify marketCap against Tiingo/Twelve Data when available (secondary evidence).
- Public endpoint `/api/public/ingest/fundamentals` + pg_cron daily.

### 2. Valuation scoring

- `src/lib/scoring/valuation.server.ts` — deterministic composite:
  - Rank each asset within its industry on P/E, P/B, EV/EBITDA, FCF yield (percentile-based, lower multiple = better, higher FCF yield = better).
  - Emit `scores.score_type = 'valuation'` with full input trace + calc version.
- Confidence penalties for missing metrics, stale data, thin industry peer group (< 5 peers).

### 3. Quality scoring

- `src/lib/scoring/quality.server.ts`:
  - ROE, ROIC, gross margin, net margin, debt/equity, current ratio → industry percentile composite.
  - `scores.score_type = 'quality'`.

### 4. Wire into existing surfaces

- **Security detail** (`/security/$symbol`): add Valuation panel + Quality panel with metric tables, industry rank, positives/deductions, verify-next (algo peer-rank check, api freshness check, ai "explain the multiple" pending).
- **Security universe** (`/security`): add Val + Qual score columns alongside composite; extend composite to weight technicals + valuation + quality.
- **Opportunity Radar / Overvaluation Radar**: extend ranking to blend valuation (cheap = opportunity, expensive = risk) and quality (high quality = confidence bonus).
- **Command Centre**: no new panels; existing Top Opportunities / Risks auto-reflect the richer composite.

### 5. Verify-next runners

- Extend `src/lib/verify/runners.server.ts` with `checkPeerRankStable` (algo: valuation percentile within ±10 vs 30d ago) and `checkFundamentalsFresh` (api: last fundamentals point < 120d).
- Seed `verify_check_definitions` rows for valuation + quality panels.

### Explicitly out of scope

- Catalyst / earnings-surprise scoring (later)
- Multi-quarter fundamentals history (only TTM for now)
- Non-US fundamentals
- New AI narrative beyond existing pending-AI hooks

### Technical notes

- FMP quota is the binding constraint (~250/day free). Backfill sequenced by market cap, ~65 assets = one endpoint call each = well within budget.
- No new tables — all fundamentals ride `data_points`, all scores ride `scores`.
- Composite weight defaults: momentum 25 / trend 20 / volatility 15 / valuation 25 / quality 15 (documented in calc version stamp).

Ready to build on your go.
