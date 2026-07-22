
# Stage 1 — Quantitative Research Terminal Upgrade

Covers spec Prompts 2, 3, 4 in full, plus a single end-to-end vertical slice through the US Growth Engine. Deliberately excludes PCA, HMM regimes, Alt-Data expansion, and radar integration — those are later stages.

## 1. Guiding rules for this stage

- One reusable regional engine with region-specific mappings, calendars, transformations, and thresholds. No copy-pasted US/UK/EU implementations.
- Deterministic maths first; the AI layer only summarises verified records.
- Every new panel obeys the spec's contract: source + vintage + retrieval timestamp visible, "Show calculation" opens the ledger, no fake numerical scores when data is missing (show `Insufficient data`).
- Nothing from the current build gets deleted. Existing routes become the "Overview" entry of each new nav group and stay wired to today's live data.

## 2. Navigation shell (spec Prompt 2)

Convert the sidebar into three collapsible groups using shadcn `SidebarGroup` + `Collapsible`. Persist expanded/active state in `localStorage`.

```text
Command Centre
Macro ▾
  ├─ Overview                  (current /macro moved here)
  ├─ Growth Engine             ← vertical slice lives here
  ├─ Inflation Engine          (scaffold)
  ├─ Liquidity & Financial     (scaffold)
  ├─ Labour & Consumer         (scaffold)
  ├─ Market Confirmation & VIX (scaffold)
  ├─ Early Warning System      (scaffold)
  ├─ Transmission & Sensitivity(scaffold)
  └─ Macro Model Health        (scaffold, uses live model_runs)
Historical Events ▾
  ├─ Overview (current /history)
  ├─ Macroeconomic Releases    (scaffold)
  ├─ Regime-Conditioned Comparisons (scaffold)
  ├─ Earnings Announcement Drift (scaffold)
  ├─ Index Rebalancing         (scaffold)
  ├─ Weather Sentiment Lab     (scaffold, flagged experimental)
  ├─ Event Library             (scaffold)
  └─ Event Model Health        (scaffold)
Alternative Data ▾
  ├─ Overview (current /alt-data)
  ├─ Institutional Holdings    (scaffold)
  ├─ Tenders & Contracts       (scaffold)
  ├─ Job Postings              (scaffold)
  ├─ Customs & Shipping        (scaffold)
  ├─ News & Event Parsing      (scaffold)
  ├─ Management Language & Tone(scaffold)
  ├─ Customer Demand Proxies   (scaffold)
  └─ Alternative Data Health   (scaffold)
Security Master · Screeners · Radars · Undervaluation · Overvaluation · Data Health · Alerts (unchanged)
```

Every scaffold route renders a heading, one-sentence purpose, and an `Insufficient data — connector not yet wired` panel with a "Verified by platform: pending — awaiting `<engine>_v1` model" badge. No fake scores.

## 3. Region-aware quant schema (spec Prompt 3)

New tables + views, all under `public`, all with `GRANT` + RLS. `service_role` full access, `authenticated` read for the current user's own rows and for global reference data.

- `regions` — `id, code (US|UK|EA), name, currency_code, timezone`
- `indicator_registry` — `id, region_id, engine (growth|inflation|liquidity|labour|market), concept_code, series_code_native, source_id, unit, frequency, transform_default, direction, seasonal_adj, license_status, vintage_policy, release_calendar_id, is_active`
- `release_calendars` — release cadence per source/series
- `raw_observations` — immutable, `indicator_id, observation_date, release_date, retrieved_at, value_raw, unit_raw, vintage_id, source_payload_ref`
- `data_vintages` — one row per (indicator, release_date) with hash of payload
- `transformed_signals` — `indicator_id, ts, transform_code, value, params, model_version, computed_at`
- `factor_models` (empty scaffold now, populated in later stage)
- `regime_states` (scaffold)
- `event_definitions` / `event_instances` (scaffold — the current historical_events keeps working alongside)
- `model_runs` — audit of every Python job: `id, model_key, model_version, region_id, status, started_at, finished_at, git_sha, input_hash, output_summary, diagnostics jsonb, error`
- `model_outputs` — versioned outputs: `id, model_key, model_version, indicator_id?, ts, output_type, value, uncertainty, meta jsonb, run_id`
- `score_ledger_entries` — extension of existing scoring: `subject_type, subject_id, feature_code, contribution, direction (positive|deduction|contradiction), evidence_ref, model_version`
- `data_quality_scores` — components (A,F,C,R,M,S) + composite per feature
- Views: `v_current_canonical_observations`, `v_current_model_outputs`, `v_score_ledger_current`

All existing tables (`data_points`, `economic_indicators`, `assets`, `scores`, …) stay untouched — Stage 1 additive only. A backfill migration links existing `economic_indicators` rows into `indicator_registry` by concept code so the current /macro page keeps rendering.

## 4. Indicator & source registry seed (spec Prompt 4)

Seed rows for the five engines across US, UK, EA — series codes and cadences only, no data yet for the non-Growth engines. Growth is fully wired (Section 5). Every registry entry stores primary source, fallback source, transformation default, and directionality.

Growth Engine registry (Stage 1 target — 3 regions, 5 concepts each):

| Concept | US | UK | EA |
|---|---|---|---|
| Real GDP (level) | FRED `GDPC1` | ONS `IHYQ` | Eurostat `namq_10_gdp` |
| Industrial production | FRED `INDPRO` | ONS `K222` | Eurostat `sts_inpr_m` |
| Retail sales | FRED `RSAFS` | ONS `EAFV` | Eurostat `sts_trtu_m` |
| Manufacturing new orders | FRED `AMTMNO` | ONS `K54L` | Eurostat proxy |
| Business survey composite | FRED regional Fed proxy | ONS BICS proxy | EC ESI |

Connectors: reuse existing FRED client; add BLS + Census clients for US coverage; extend existing ONS + ECB + Eurostat clients to write into `raw_observations` + `data_vintages` (not just `data_points`). Every new/updated ingester is idempotent on `(indicator_id, observation_date, vintage_id)`.

## 5. US Growth vertical slice (proof of concept)

End-to-end path exercising the whole architecture on one engine, one region, one model.

1. **Ingest**: hourly cron pulls the five US Growth series into `raw_observations` with vintage rows (FRED ALFRED where available).
2. **Transform**: server-fn computes YoY, MoM, 3m/12m momentum, standard z-score → writes to `transformed_signals` with `model_version = "transform.v1"`.
3. **Model**: Python analytics service runs the Kalman local-linear-trend filter (statsmodels `UnobservedComponents`) per series, returns filtered level, slope, uncertainty, innovation, diagnostics → written to `model_outputs` with `model_key = "kalman.llt"`, `model_version = "v1"`.
4. **Display**: `/macro/growth` renders each series as a `TrendChart` showing raw observations + Kalman trend + 1σ band. Panel exposes "Show calculation" (formula, inputs, output, model version, run id, source link) and a badge — "Verified by platform: algo — kalman.llt v1, run <id>, ran <ts>".
5. **Health**: `/macro/model-health` lists the last N `model_runs` for `kalman.llt` per series with convergence diagnostics, MAE vs raw, and freshness.
6. **AI summary**: Gemini via Lovable AI Gateway generates a 3-sentence explanation from `{latest raw value, latest Kalman slope, YoY, direction change flag, source link}` only — refuses if any field is missing.

## 6. Python analytics service

- New repo/service `research-terminal-analytics` (FastAPI + statsmodels + pandas + numpy).
- Deployed on Fly.io (free tier fine for now) — user provides `FLY_API_TOKEN` once, deploy scripted.
- Auth: HMAC signature on request body using shared secret `PY_ANALYTICS_HMAC_SECRET` (I'll ask you to generate this via secrets tool when we're in build mode).
- Endpoints Stage 1: `POST /kalman/llt` (batch: list of series → filtered outputs + diagnostics). Idempotent; input hash returned so we can dedupe runs.
- Called from a TanStack server route `/api/public/analytics/run-growth` triggered by cron every 6h after the ingest cron.
- Never writes directly to Supabase — returns JSON, our server-fn writes `model_runs` + `model_outputs`. Preserves the spec's "Python service never touches raw_observations" rule.
- Each response embeds `model_key`, `model_version`, `git_sha`, library versions so the audit trail is complete.

## 7. What Stage 1 does NOT include

- No PCA factor models (Prompt 7) — table stubbed, empty.
- No HMM regime model (Prompt 8) — table stubbed, empty.
- No new alt-data connectors, no earnings-drift / index-rebal / weather-lab (Prompts 12–14).
- No radar/screener integration of the new features (Prompt 15) — existing scoring keeps running unchanged.
- No AI summaries at page level beyond the single Growth Engine slice (Prompt 16).
- No UK/EA Kalman runs yet — same code path, but wired up in Stage 2 once US contract is validated.

## 8. Acceptance for Stage 1

- Sidebar collapses into the three groups, active route highlighted, keyboard-navigable, state persisted.
- Every new scaffold route renders without errors and shows `Insufficient data` rather than fake numbers.
- `psql \d indicator_registry` etc. show all new tables with grants + RLS.
- US Growth series are visible in `raw_observations` with at least two vintages for one revised series.
- `/macro/growth` shows five charts each with raw + Kalman trend, "Show calculation" opens the ledger, badge names the run id.
- `/macro/model-health` lists `kalman.llt` runs with diagnostics.
- Python service round-trip works from cron; `model_runs.status = 'success'` for the last run.
- Old routes and radars keep working exactly as before.

## 9. Sequenced build order (once approved)

1. Nav restructure + scaffold routes + `Insufficient data` panel.
2. Schema migration (all new tables + views + grants + RLS).
3. Registry seed migration (US/UK/EA rows).
4. Extend ingesters to write `raw_observations` + `data_vintages` (US Growth series only).
5. Generate `PY_ANALYTICS_HMAC_SECRET`, ship Python service repo, deploy to Fly, request `FLY_API_TOKEN` + `PY_ANALYTICS_URL`.
6. `POST /api/public/analytics/run-growth` server route + cron.
7. `/macro/growth` UI + `/macro/model-health` UI + AI summary.
8. Smoke-test cron chain, verify a revised series shows both vintages, confirm chart + ledger + badge.

Stage 2 will then replicate the pipeline for UK + EA, and Stage 3 will add the next engine (Inflation) plus PCA — but only after this slice is signed off.
