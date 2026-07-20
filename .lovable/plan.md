
# Phase 1 — Foundation

Per the spec: build the database and data-reliability framework before scoring, historical event analysis, or AI. This phase is Prompts 1–3 only. No live data providers, no auth, no scoring yet — those come in later phases we'll do one by one.

## What this phase delivers

1. Lovable Cloud enabled (Postgres + storage + future auth).
2. Complete database schema for the whole app (so later phases just fill tables, not migrate them).
3. Deterministic **data-reliability framework** in code (source hierarchy, freshness rules, confidence penalties) — usable by every future ingester.
4. App shell with the eight navigation sections (empty placeholders following the universal panel contract).
5. One reference implementation of the **universal panel contract** — a reusable `<ResearchPanel>` React component that every future panel plugs into.
6. Seed data so the shell renders something inspectable (mock rows, mock sources) — clearly labeled as mock.

Auth (email + password + Google), live data ingestion, scoring, event studies, alerts, watchlists, notes/theses, and AI commentary are explicitly **out of scope for Phase 1**.

## Navigation (empty section pages, following the spec's IA)

- `/` Command Centre
- `/macro` Macroeconomic Environment
- `/radar` Opportunity Radar
- `/screeners` Stock / Industry / Commodity / Asset screeners
- `/history` Historical Event & Sensitivity engine
- `/alt-data` Alternative Data
- `/alerts` Alerts
- `/data-health` Data Health & Model Governance

Each section renders a page header + 2–3 placeholder `<ResearchPanel>` cards with mock content.

## Universal panel contract (built as reusable component)

Every panel — now and forever — renders:
- Title, one-line purpose
- Compact body (numbers/mini-viz)
- **Why this matters** section (what changed, transmission mechanism)
- **Evidence** list (each item: source, source-tier badge, timestamp, freshness indicator, agree/disagree)
- **Confidence** meter (0–100 with penalty breakdown on hover)
- **Positives / Deductions** two-column list (every point traceable)
- **Verify next** checklist
- Expand button (opens full detail sheet with same structure at higher fidelity)
- "Show calculation" drawer scaffold (formula, inputs, version, weights) — empty in Phase 1, wired in the scoring phase

## Data-reliability framework (code, not UI)

`src/lib/reliability/` module implementing:
- **Source hierarchy tiers** (Tier 1 official/exchange, Tier 2 regulated aggregator, Tier 3 reputable secondary, Tier 4 alternative/social) — enum + weights table.
- **Freshness policy** per data category (macro release, price, fundamentals, news, alt) — max-age → freshness score 0–1.
- **Confidence penalty function** — takes (source tier, freshness, cross-source agreement, missing fields) → confidence 0–100 and structured breakdown of every deduction.
- **Calculation-version stamping** helper — every derived value carries `calc_version` + `computed_at` + inputs hash.

Pure functions with unit-test-friendly signatures. No provider calls yet.

## Design direction

Dense-instrument look inspired by pro research terminals: neutral dark surface, monospaced numbers, precise typography, semantic status colors (positive/negative/neutral/warning), tight grids. Not a "wellness dashboard" and not a black-box AI product — the aesthetic should read as auditable and technical. I'll ask you to pick a palette + typography direction as the first build step so we're not defaulting to generic SaaS blue.

## Technical details

**Stack**: TanStack Start (existing) + Lovable Cloud (Supabase Postgres) + Tailwind v4 + shadcn.

**Schema (initial migration)** — every table gets grants + RLS enabled; owner-only policies stubbed for when auth lands:

Reference / catalogue
- `assets` (id, symbol, name, asset_class, country, currency, industry_id, exchange, active)
- `industries` (id, code, name, parent_id) — GICS-shaped
- `countries` (id, iso2, name, region)
- `commodities` (id, code, name, unit)
- `factors` (id, code, name) — value/momentum/quality/etc.
- `economic_indicators` (id, code, name, country_id, frequency, unit)

Sources & reliability
- `data_sources` (id, name, tier, base_url, api_docs_url, notes, active)
- `source_freshness_policies` (id, data_category, max_age_seconds, warn_age_seconds)
- `ingestion_runs` (id, source_id, started_at, finished_at, status, rows_ingested, error)
- `data_points` (id, subject_type, subject_id, metric_code, value_num, value_text, as_of, source_id, ingested_at, confidence, penalties jsonb, raw jsonb) — the append-only fact table every panel reads through

Market data (schemas only, empty)
- `prices_daily`, `prices_intraday`, `fundamentals_quarterly`, `fundamentals_annual`, `earnings_events`, `economic_releases`, `news_items`, `commodity_prices`, `fx_rates`, `alt_data_signals`

Analytics layer (schemas only)
- `scores` (id, subject_type, subject_id, score_type, value, calc_version, computed_at, inputs jsonb, weights jsonb, positives jsonb, deductions jsonb, confidence)
- `event_study_results`, `regime_classifications`, `sensitivity_matrix`

User layer (schemas only, ready for auth)
- `watchlists`, `watchlist_items`, `research_notes`, `theses`, `thesis_evidence`, `alerts`, `alert_rules`

**Panel contract types**: `src/lib/panels/contract.ts` exports the `PanelData` TypeScript interface every panel must satisfy (evidence, positives, deductions, confidence breakdown, verify-next). Every future panel is a component that takes `PanelData` and renders through `<ResearchPanel>`.

**Server functions**: `getPanelMock(section)` in `src/lib/panels/panels.functions.ts` returns hardcoded shaped-correct mock data so the UI renders end-to-end without providers.

**Files created**
- `supabase/migrations/<ts>_phase1_foundation.sql`
- `src/lib/reliability/{tiers,freshness,confidence,version}.ts`
- `src/lib/panels/{contract.ts,panels.functions.ts}`
- `src/components/research/{ResearchPanel,EvidenceList,ConfidenceMeter,PositivesDeductions,VerifyNext,CalculationDrawer}.tsx`
- `src/components/layout/{AppShell,SideNav,SectionHeader}.tsx`
- `src/routes/index.tsx` (Command Centre, replaces placeholder)
- `src/routes/{macro,radar,screeners,history,alt-data,alerts,data-health}.tsx`
- Update `src/routes/__root.tsx` head with app-specific title/description

## Verification before hand-off

- `bun run build` passes.
- Every route renders 2–3 placeholder panels with visible evidence / confidence / positives / deductions / verify-next.
- Reliability helpers have inline example calls demonstrating a confidence deduction.
- Migration includes grants + RLS on every public table.
- Data Health page lists the (empty) `data_sources` and `ingestion_runs` tables and the freshness policies in effect.

## After Phase 1 (not now — one-by-one with your input)

Phase 2: Auth (email + password + Google) + owner role gate on Data Health / admin screens.
Phase 3: First live source (FRED macro is the easiest place to start) wired through the reliability framework into the Macroeconomic Environment panels.
Then: equity prices → fundamentals → news → deterministic scoring → Opportunity Radar → screeners → historical event engine → alerts → alt-data → AI commentary layer (last).
