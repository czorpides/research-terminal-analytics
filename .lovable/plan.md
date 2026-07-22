# Stage 2 — Transformation Framework + US Inflation Engine

Scope guardrails
- PCA and HMM stay inactive; keep existing DB contracts and stub endpoints.
- Do not mutate accepted Growth Engine outputs. If the Growth pipeline migrates to the shared framework, run it in shadow (write to a `shadow=true` model_run) and compare vs accepted outputs (tolerance ≤1e-6 on Kalman level, ≤1e-4 on transforms). Cut over only after parity is proven; otherwise Growth keeps using its existing path.
- No recurring Inflation cron until one green end-to-end manual run.

## Part A — Reusable transformation framework

Location: `src/lib/transforms/` (TS, deterministic, pure).
- `types.ts` — `TransformName`, `TransformSpec { formula, inputs, frequency, minHistory, lookback, seasonal, direction, unit, version }`, `TransformResult { name, points, spec, asOf, inputsHash }`.
- `catalog.ts` — one implementation per transform: level, absChg, pctChg, mom, qoq, wow, yoy, chg3mAnn, chg6mAnn, rollingMean(w), ewma(halflife), momentum, acceleration, zscoreHistorical, zscoreRolling(w), percentileHistorical, surpriseScore, revisionScore, breadthDiffusion, kalmanLevel, kalmanSlope, kalmanCI. Kalman transforms delegate to the existing Fly.io service — they are not re-implemented locally.
- `runner.ts` — `runTransforms(series, registryRow, opts)` — reads `indicator_registry.allowed_transformations` (array) and only runs opted-in transforms. Stamps each output with `calcVersion + inputsHash` (reuse `stampCalculation`).
- `directionality.ts` — shared "higher is good / bad / context-dependent" rules with a `zoneFor(value, spec, context)` helper. Context includes target range (e.g. Fed 2%), momentum, deflation guard.
- Extend Python analytics service `services/analytics/app/models/transforms.py` with the same catalog for server-side batch use; keep TS as source of truth for panels. Add explicit gating comment.

DB migration (single):
- Add `allowed_transformations text[]` (if not already present — it exists in registry per current schema; verify), `target_range jsonb`, `direction text` (`higher_better|lower_better|context`) to `indicator_registry` where missing.
- Create `public.transform_outputs` (indicator_id, transform_name, as_of_date, value, calc_version, inputs_hash, model_run_id, created_at) with unique(indicator_id, transform_name, as_of_date, calc_version). Full GRANT + RLS.
- Extend `model_runs` allowed `model_key` to include `transform_batch` and `inflation_pressure_score`.

Unit tests (Vitest): `src/lib/transforms/__tests__/catalog.test.ts` with known series (linear, sinusoidal, step) validating every transform against hand-calculated expected values. `test_transforms.py` already exists — add parity tests for the new names.

## Part B — US Inflation Engine

### Indicators (FRED unless noted)
Headline CPI (CPIAUCSL), Core CPI (CPILFESL), Headline PCE (PCEPI), Core PCE (PCEPILFE), PPI final demand (PPIACO / PPIFIS), Average Hourly Earnings (CES0500000003), Atlanta Fed Wage Tracker (FRBATLWGT12MMUMHWGO), Shelter CPI (CUSR0000SAH1), Import prices (IR), 5y5y forward breakeven (T5YIFR), 10y breakeven (T10YIE), Michigan 1y expectations (MICH), NY Fed 1y SCE (proxy via FRED where available), CRB / BCOM commodity index (via existing commodity ingest), Cass freight index proxy (fallback to FRED DTB3-style freight series or mark unavailable), ISM prices (NAPMPRI where licensable — else mark inactive).

Seed via migration: rows in `indicator_registry` with `engine='inflation'`, `group` in {goods, services, shelter, energy, food, wages, imported, expectations, commodities, freight, survey}, `source`, `series_code_native`, `frequency`, `unit`, `release_calendar`, `revision_policy`, `allowed_transformations`, `target_range` (e.g. `{ "value": 2.0, "band": [1.5, 2.5] }`), `direction: 'context'`.

Vintage handling: reuse existing `raw_observations` + `data_vintages` snapshot-on-ingest. Document that CPI/PCE historical vintages are NOT true ALFRED PIT until backfilled — add a `vintage_quality` column (`snapshot|revision_tracked|real_time_verified`) on registry.

### Ingestion
- New file `src/lib/ingestion/fred/inflation-ingest.server.ts` — mirror `growth-ingest.server.ts`. Per-indicator hash guard, vintage insert on change, 30-year backfill support.
- Public endpoint `src/routes/api/public/ingest/us-inflation-fred.ts` — same shape as growth endpoint, supports `?scope=monthly|weekly|expectations|safety|revisions&pipeline=1&years=30`.
- Commodities/freight pulled from existing commodity ingest if present; otherwise mark data source `unavailable` (no fabricated data).

### Analytics pipeline
- `src/lib/analytics/inflation-pipeline.server.ts` — orchestrates: fetch raw_observations (paginated) → run transform batch (TS) → call Fly.io Kalman for level/slope/CI → write `transform_outputs` + `model_outputs` under one `model_run_id`. Per-indicator hash guard reused from growth pipeline (extract to `src/lib/analytics/hash-guard.server.ts`).
- Inflation Pressure Score (`src/lib/scoring/inflation-pressure.server.ts`): deterministic sum of weighted contributions. If any weight input is missing, reduce confidence penalty and return status=`insufficient_data` for that component — never substitute a default score. Persist contribution ledger to `model_outputs.payload`.

### UI
- Route `src/routes/_authenticated/macro.inflation.tsx` — grouped panels (Headline, Core, Shelter, Wages, Expectations, Commodities & Freight, Composite). Each panel uses existing `ResearchPanel` + `TrendChart`, with Kalman trend, CI, target band, percentile zones, contribution ledger for the composite.
- Growth×Inflation Map: new panel `src/lib/panels/growth-inflation-map.functions.ts` + component `src/components/research/GrowthInflationMap.tsx`. Four-quadrant scatter with current dot, 1w/1m/3m trails, confidence rings. Added to Macro Overview.
- AI interpretation: reuse Lovable AI Gateway; system prompt hard-limits to explain/interpret only (no numeric calculation, no invented data, must cite `asOf` + calc_version). Rendered per panel + on the map.
- Sidebar: add "Inflation Engine" and "Growth & Inflation Map" entries with status badges (In Development until acceptance passes; Live after).

### Screener integration (shadow only)
- Migration: add columns to `assets`: `inflation_sensitivity`, `wage_cost_sensitivity`, `commodity_input_sensitivity`, `pricing_power`, `interest_rate_sensitivity`, `duration_sensitivity`, `geographic_inflation_exposure` (all nullable numeric or jsonb where richer). Populate via a shadow scorer `src/lib/scoring/inflation-alignment.shadow.server.ts` writing to `model_outputs` with `shadow=true`. Do NOT mutate any radar/screener rankings.

### Scheduling
- Do not install cron this stage. Provide the SQL in a documented block inside the endpoint file / plan output for later activation after acceptance.

### Health monitoring
- Extend `data_health_alerts` view to include `engine` filter; add Inflation Engine block to `/data-health` mirroring Growth Engine block.

## Deliverables checklist (matches user's report requirements)
1. Shared transform modules (TS + Python parity).
2. Formulas list + Vitest/pytest results.
3. Indicator registry rows added, with sources.
4. Historical coverage report (per indicator, first_date → last_date, row count).
5. Vintage coverage (snapshot vs verified PIT).
6. Transform output row counts.
7. Kalman run summary (per indicator: converged, loglik, n_obs).
8. Inflation Pressure Score contribution ledger (first live run).
9. Panels/charts inventory.
10. Growth×Inflation Map screenshot + inputs table.
11. Shadow stock alignment fields populated.
12. Health checks (Data Health block).
13. Warnings/limitations/missing data (freight, ISM if unavailable; vintage quality caveats).
14. Stage 2 acceptance readiness verdict.

## Execution order
1. Migration: registry columns, `transform_outputs`, asset shadow columns, seed inflation indicators.
2. Framework: `src/lib/transforms/*` + tests.
3. Extract shared hash-guard helper; refactor growth-pipeline to import it (no behavior change).
4. Inflation ingest + endpoint; run 30y backfill manually via curl once endpoint is live.
5. Inflation pipeline + Pressure Score; one manual end-to-end run.
6. UI: Inflation route, Growth×Inflation map, sidebar, AI interpretations.
7. Shadow stock alignment scorer.
8. Health panel additions.
9. Acceptance report.

## Open assumptions (will proceed unless you flag)
- Freight index: use FRED `TRUCKD11` if accessible, else mark unavailable rather than substituting.
- ISM prices: mark inactive/licensable — no fabricated data.
- Consensus/surprise data: no free source integrated yet → `surpriseScore` returns null with confidence penalty until a provider is wired.
- Growth pipeline stays on its current code path; framework migration deferred to a follow-up parity PR.
