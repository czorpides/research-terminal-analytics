# Plan: Undervaluation Radar, Catalyst pairing, Commodities, Label rename

## 1. Rename "Verify next" → "Verified by platform"

- Update `src/components/research/ResearchPanel.tsx` label only.
- Reframe the section as **secondary corroboration** to the primary fundamental/technical/macro metrics shown above it. Add a one-line subhead: "Secondary corroboration for the metrics above."
- No contract/field renames — `verifyNext` stays as the internal key to avoid breaking every panel builder.

## 2. Catalyst engine (macro + alt-data → asset/industry)

The user's core ask: know *why* an asset is under- or overvalued before it happens. Deterministic, evidence-backed, no black-box AI required.

**New module: `src/lib/catalysts/detect.server.ts`**
- Detects recent macro/alt-data events that plausibly pressure or support each asset.
- Sources already in the DB:
  - `data_points` (FRED macro series: fed funds, CPI, unemployment, yield curve, USD index, etc.)
  - `alt_data_signals` (existing table — we'll seed a handful of tariff/tax/regulatory event rows manually via a seed function so the pipeline has real data to render)
  - `commodity_prices` (added below)
- Detection rules (deterministic, tagged with reasoning):
  - **Macro deltas**: month-over-month move > 1σ on a series that historically correlates with a sector (e.g. rising 10Y yields → pressure on Utilities/REITs; rising oil → pressure on Airlines, tailwind for Energy).
  - **Commodity shocks**: >5% 4-week move in a commodity → pressure/tailwind mapped to industries (oil↑ → Energy+ / Airlines−; copper↓ → Materials−).
  - **Alt-data events**: tariff / tax / regulatory rows tagged with target industry/country → pressure sign + magnitude.
- Output shape (new type `Catalyst` in `src/lib/catalysts/types.ts`):
  ```
  { id, direction: "pressure"|"tailwind", magnitude: 1-3,
    headline, source, asOf, evidenceUrl?,
    reasoning: string,   // deterministic sentence template
    historicalNote?: string  // "Similar 2018 tariff round preceded 12% Materials drawdown"
  }
  ```
- Industry→series mapping table lives in `src/lib/catalysts/mappings.ts` (hand-curated, versioned).

## 3. Commodities ingestion + panels

- Ingest daily commodity spot/futures via FMP `/quote/{symbol}` for a curated basket: WTI, Brent, Natural Gas, Gold, Silver, Copper, Wheat, Corn, Soybeans.
- New ingestor `src/lib/ingestion/commodities/ingest.server.ts` writing to existing `commodity_prices` table.
- New endpoint `POST /api/public/ingest/commodities`.
- Weekly cron.
- Extend catalyst engine to read commodity 4-week moves.
- Commodities appear as first-class rows on both radars (treated like assets with symbol/name; scoring uses momentum + trend + volatility only — no fundamentals).

## 4. Undervaluation Radar (weekly stable list)

**Concept**: symmetric to Overvaluation Radar, but *stable* — the list only churns when a name meaningfully enters/exits the deep-value zone.

- New server fn `src/lib/panels/undervaluation.functions.ts`:
  - Uses composite `opportunityScore` (already exists as the standard composite) inverted focus: rank by **low valuation percentile + non-broken quality**.
  - Formula: `undervaluation = valuation_score × 0.5 + quality_score × 0.3 + (100 − trend_break_penalty) × 0.2` — cheap names that aren't falling knives.
- **Stable weekly list** (the "don't churn" requirement):
  - New table `undervaluation_watchlist` persisting the current list with `added_at`, `last_confirmed_at`, `entry_score`, `exit_score?`.
  - Weekly cron `/api/public/radars/undervaluation/refresh`:
    - Compute current scores.
    - **Add**: candidate scoring ≥ 70 AND not already in list.
    - **Remove**: existing entry scoring < 55 for 2 consecutive weekly runs (hysteresis prevents flip-flop).
    - **Keep**: everything else — no reorder churn, no unnecessary rewrites.
  - Panel reads from the persisted table, not from a fresh recompute, so the visible list only changes on the weekly cadence.
- Route `src/routes/undervaluation.tsx` mirroring the overvaluation page.

## 5. Wire catalysts into both radars

- `getOvervaluationPanels` and `getUndervaluationPanels` each call `getCatalystsForAsset(assetId, industryId, countryId)`.
- Catalysts render as a new **"Catalysts & pressures"** block inside each panel (above Evidence), showing direction (pressure/tailwind), magnitude bar, source, deterministic reasoning line, and historical note when available.
- Each catalyst also emits an `Evidence` entry so the confidence math and audit trail pick it up.

## 6. Nav + Command Centre

- Add "UV · Undervaluation Radar" to `AppShell` nav.
- Command Centre "Top Opportunities" panel starts pulling from the persisted undervaluation watchlist instead of ad-hoc composite ranking.

## Explicitly out of scope

- LLM-written catalyst narratives (deterministic templates only for now — AI layer arrives in the Prompt 11 phase).
- Backtested historical impact modelling (we use a hand-curated `historicalNote` table for now).
- Non-US macro catalysts beyond what FRED already provides.
- Automated news scraping — alt-data events are seeded manually until a news ingester is built.

## Technical notes

- No breaking schema changes; two new tables (`undervaluation_watchlist`, minor extension to seed `alt_data_signals`).
- Commodities re-use `commodity_prices` + `commodities` tables that already exist.
- All catalyst detection is deterministic + versioned (`catalyst.detect.v0.1` stamp) so verifier audit trail keeps working.
- Weekly cadence uses pg_cron `0 6 * * 1` (Monday 06:00 UTC).
