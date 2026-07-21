## Scope for this prompt

Finish the small remaining pieces of Prompts 4 + 8, then build **Prompt 5 — Command Centre synthesis** as the major new area. Deliberately deferring the big items (fundamentals/valuation scoring, broad AI commentary, security master deep-dive) so quality stays high.

---

### 1. Finish Prompt 4 — Equity data pool (minor)

- Repoint the ingestion pipeline from Stooq (blocked by anti-bot) to the provider pool via `fetchWithFailover`, keeping the existing `prices_daily` schema and quality gate.
- Kick off the first backfill for the seeded ~65 US assets (Tiingo primary → Twelve Data → FMP failover), with cross-verification on the latest close.
- Immediately run the scoring job so Radar and Screeners show live data.
- Update the Stooq cron to call the new multi-provider entry point (keep name for continuity).

### 2. Finish Prompt 8 — Overvaluation Radar (minor)

- Add a symmetric `/overvaluation` route using the existing scoring outputs (inverted momentum + volatility + extreme trend deviation).
- Reuse `PanelGrid` + universal panel contract; every candidate ships with visible positives/deductions and verify-next chain — same discipline as Opportunity Radar.
- Add nav entry.

### 3. Prompt 5 — Command Centre synthesis (major)

The Command Centre is the "one screen that answers *what deserves attention right now*". Build it as composed panels, each satisfying the universal contract:

- **Regime panel** — current macro regime read (yield curve sign, inflation trend, unemployment trend) sourced from live FRED data + verify_runs.
- **Top opportunities** — top 5 from Opportunity Radar with score, confidence, freshness.
- **Top overvaluation risks** — top 5 from the new Overvaluation Radar.
- **Data health summary** — count of stale/failed sources, latest verifier runs, provider quota status.
- **Verifier activity** — most recent `verify_runs` across all panels (algo/api/ai badges).
- **What changed today** — deterministic diff: new score entries, freshness state transitions, verifier status flips vs previous day.

All panels are read-only aggregations over existing tables (`scores`, `verify_runs`, `data_points`, `ingestion_runs`, `provider_quotas`). No new scoring math, no AI narrative — pure synthesis with full audit trail. The existing `/` route becomes the Command Centre.

---

### Explicitly out of scope (next prompts)

- Fundamentals / valuation / catalyst scoring (Prompt 7 rest)
- Security Master deep-dive pages (Prompt 6)
- Historical Event Engine (Prompt 9)
- Alternative data ingestion (Prompt 10)
- Broad AI commentary beyond existing verifier (Prompt 11 rest)
- Alert firing engine (Prompt 12)

### Technical notes

- New server function `getCommandCentrePanels` in `src/lib/panels/command-centre.functions.ts`, mirroring `radar.functions.ts` shape.
- Multi-provider ingest lives in `src/lib/ingestion/equities/ingest.server.ts` (keeps Stooq module intact but unused).
- Backfill triggered via existing `/api/public/ingest/stooq` endpoint repointed, or a new `/api/public/ingest/equities` alias — will pick during implementation to avoid breaking cron.
- Overvaluation scoring reuses existing score rows; no new `scores.score_type`, just a different ranking view.

Ready to build on your go.