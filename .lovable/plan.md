# Macro Hub v2 + charts everywhere

Turn `/macro` from a single-region three-panel view into a real macro research hub with US / EU / UK, categorised panels, narrative + charts + zone shading, and roll the small trend charts out to the rest of the terminal.

## 1. Data — add EU + UK series to FRED ingester

FRED already publishes a lot of ECB/Eurostat/BoE/ONS series, so we don't need a new provider for phase 1.

New series added to `src/lib/ingestion/fred/series.ts` (all via FRED):

- **Rates & bonds**: `ECBDFR` (ECB deposit), `IR3TIB01EZM156N` (EZ 3M rate), `IRLTLT01EZM156N` (EZ 10Y), `IRLTLT01GBM156N` (UK 10Y), `IUDSOIA` (BoE SONIA proxy via FRED mirror where available; fallback series).
- **Inflation**: `CP0000EZ19M086NEST` (EZ HICP), `CPALTT01GBM657N` (UK CPI YoY).
- **Labor**: `LRHUTTTTEZM156S` (EZ unemployment), `LRHUTTTTGBM156S` (UK unemployment).
- **Growth / sentiment**: `CLVMEURSCAB1GQEA19` (EZ real GDP), `NGDPRSAXDCGBQ` (UK real GDP), EZ ESI where available.
- **Credit & debt (US first)**: `DRCCLACBS` (credit card delinquency), `TOTALSL` (consumer credit), `MORTGAGE30US` (30Y mortgage), `DRSFRMACBS` (single-family mortgage delinquency), `MDOAH` (mortgage debt outstanding), `HOUST` (housing starts).
- **Business payments**: FRED coverage of "HMRC business payments" is limited; we register the category and a UK proxy (`BUSLOANS` US analogue + ONS via FRED mirror) and flag it as `partial_coverage` until we wire ONS/HMRC directly in a later phase.

Migration adds matching `economic_indicators` rows (code, name, category, region, provider_series_code). `region` column added (`US` | `EZ` | `UK`) with a default of `US` so existing rows stay valid.

## 2. Panel model — categorised, region-aware

New file `src/lib/panels/macro.registry.ts` declares the panel catalog:

```
macro-rates       Rates & policy
macro-bonds       Sovereign yields & curve
macro-inflation   Inflation pulse
macro-labor       Labor market
macro-credit      Credit & delinquencies
macro-housing     Housing & mortgages
macro-business    Business activity & payments
```

Each panel entry declares the FRED codes it needs per region, its narrative background block (same shape as history panels), and its zone thresholds (see §4).

`getMacroPanels` in `src/lib/panels/macro.functions.ts` becomes region-aware:

- input: `{ region: "US" | "EZ" | "UK" | "COMPARE" }`
- for a single region: returns the panels above, populated from that region's series (empty-state card when a series isn't wired for that region).
- for `COMPARE`: returns a flatter comparison shape (see §5).

## 3. UI — region switcher + tabbed layout

`src/routes/macro.tsx`:

- Region switcher (shadcn `Select`): `United States`, `Euro area`, `United Kingdom`, `Compare all`.
- Category tabs (`Tabs`): Rates · Bonds · Inflation · Labor · Credit · Housing · Business.
- Panels render in a grid inside each tab. Every panel keeps the existing `ResearchPanel` shell so background / evidence / verify chain stay consistent.

State is URL-driven via `validateSearch` (`region`, `tab`) so links are shareable.

## 4. Charts + zones

New component `src/components/research/TrendChart.tsx` (recharts, already a common dep — install if missing):

- Small sparkline-style line chart, 120–240 day window.
- Optional dotted "projection" segment (simple linear extrapolation of last 20 pts; clearly labelled "projected").
- Optional zone bands: `goldilocks` (green tint), `warning` (amber), `red` (rose). Bands come from the panel registry, e.g. UNRATE goldilocks `3.5–4.5`, warning `4.5–5.5`, red `>5.5`.
- Renders on both the compact card and (larger) the expanded sheet.

Extend `PanelData.metrics` with an optional `series` and `zones` field so any panel across the app can opt in.

Roll the same `TrendChart` into:
- Radar cards (composite score trajectory)
- Undervaluation / Overvaluation watchlist rows (price trend)
- Security deep-dive (already has sparkline — swap to `TrendChart` for consistency + zones on RSI/valuation).
- History regime panel (fingerprint distance over time).

## 5. Compare view

When `region=COMPARE`, macro renders a table-style grid instead of panels:

```
                US        EZ        UK
Policy rate     5.25%     4.00%     5.25%
10Y yield       4.32%     2.61%     4.18%
CPI YoY         3.1%      2.4%      3.9%
Unemployment    3.9%      6.5%      4.2%
...
```

Rows are grouped by category, each cell shows value + tiny `TrendChart`, and a "why this matters" caption sits under each group. Confidence + evidence links stay accessible via a row-level expand.

## 6. Narratives + AI summaries

Every panel gets a `background` block (same shape as historical events): overview, historical context, causes, what it drives, what to watch. Written once per panel in the registry — deterministic, no AI needed at render time.

An AI verify step (`aiCoherenceCheck`) runs against the latest reading and writes a 2–3 sentence "what this print means today" into `verify_runs.detail`, surfaced in the panel's "Verified by platform" block. This reuses the existing verify executor and cron.

## 7. Scope explicitly out (future phases)

- Direct ONS / HMRC / ECB SDW ingestion (we use FRED mirrors first, wire native APIs later).
- Nowcasts / model-based projections beyond simple linear extrapolation.
- Per-user zone customisation.

## Technical notes

- Migration: add `region` column to `economic_indicators`, seed new indicator rows, add series definitions in `series.ts`.
- No breaking changes to existing `data_points` — we key on new indicator ids.
- `TrendChart` is a pure client component; loaders keep returning serialisable DTOs (arrays of `{t, v}`).
- Recharts is small; if not installed we `bun add recharts`.
- Cron: existing FRED daily/monthly jobs pick up the new series automatically once registered.
