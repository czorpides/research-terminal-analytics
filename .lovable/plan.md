
## Goal

Turn `/history` from "years and names" into a research hub that explains **what each metric means**, **what each event was caused by**, **what happened next**, with **cited links** for verification and an **AI ↔ algo/API retry loop** when narratives can't be verified.

## 1. Data model — richer event narrative

Migration on `historical_events` adds:

- `causes` (text) — 1–3 sentences on drivers (policy, shock, geopolitics).
- `what_happened_next` (text) — 1–3 sentences on the market/economy consequence.
- `mechanism` (text) — the transmission channel (rates → mortgages → housing, etc.).
- `key_takeaway` (text) — 1 sentence forward-looking lesson.
- `citations` (jsonb) — array of `{title, url, publisher}`; every narrative field must be backed here.
- `narrative_verified_at`, `narrative_verifier` (`ai`|`manual`|`null`), `narrative_confidence` (0–100), `narrative_status` (`unverified`|`verified`|`needs_review`).

Backfill the 24 seeded events with a one-shot server function that synthesises narratives from existing `summary` + tags and stamps them as `unverified` until the verify loop runs.

## 2. Metric glossary — "what does this mean?"

New `src/lib/history/glossary.ts` — plain-English definitions for every fingerprint dimension (`rate_level`, `curve`, `inflation`, `oil regime`, `unemployment_dir`) and every metric shown on radar/history panels. Rendered as tooltips on `<Metric>` labels and as a dedicated **"How to read this panel"** block at the top of every history panel and the event detail page.

## 3. Narrative verify loop (algo → API → AI, with retry)

New module `src/lib/history/narrative-verify.server.ts`:

1. **Algo check** — every narrative field non-empty, ≥1 citation per event, citations parse as URLs, publisher domain matches a Tier 1–3 allowlist (Fed/BLS/BEA/IMF/Reuters/FT/WSJ/Bloomberg/AP).
2. **API check** — HEAD-fetch each citation URL; 2xx = live, else mark stale.
3. **AI check** — Lovable AI Gateway (`google/gemini-3-flash-preview`) receives `{summary, causes, what_happened_next, mechanism, citations}` and returns `{verified: bool, issues: string[], confidence: 0-100}` via structured output.
4. **Retry loop** — if AI returns `verified:false` OR confidence < 60:
   - re-run with an "improve" prompt that asks the model to *rewrite* the flagged fields grounded strictly in the citations,
   - re-verify; max 2 rewrite passes,
   - after 2 failed passes: mark `needs_review`, surface in Data Health, and downgrade the panel confidence.
5. Every pass writes to `verify_runs` (existing audit trail) with inputs, outputs, verifier, version stamp.

Endpoint: `POST /api/public/history/verify-narratives` (anon-key protected) — invoked by the existing 30-min `pg_cron` verifier job. Also runnable from Data Health.

## 4. Panel & page UX upgrades

- **Every history panel** gets an "About this panel" strip at the top (2 lines, plain English) and a "How to read the metrics" collapsible.
- **`/history` regime panel** — each analog card now shows: 1-line **cause**, 1-line **what happened next**, forward-return chip, "Verified by AI" or "Needs review" badge.
- **`/history/$eventId`** rebuilt with four narrative sections (Summary / Causes / Mechanism / What happened next / Key takeaway), a **Citations** block (title + publisher + link + freshness dot), and a **Verification** block showing algo/API/AI status with retry button.
- Radar `whyBullets` "Historical parallel" line links to the event card AND includes the 1-line consequence, not just the return %.

## 5. Verification of the verifier (audit trail)

All narrative verify passes and retries stream into `verify_runs` with `check_id = 'narrative:<event_code>'`, so the Data Health page shows failed/retried narratives just like any other check.

## Technical notes

- Migration adds columns + backfills seeded rows (no destructive change).
- New files: `src/lib/history/glossary.ts`, `src/lib/history/narrative-verify.server.ts`, `src/routes/api/public/history/verify-narratives.ts`, `src/lib/history/narratives.functions.ts` (get/set).
- Edited: `src/lib/panels/history.functions.ts` (richer analog cards + "How to read"), `src/routes/history.$eventId.tsx` (new sections), `src/components/research/ResearchPanel.tsx` (metric tooltips from glossary), `src/lib/panels/undervaluation.functions.ts` + `overvaluation.functions.ts` (richer parallel bullet).
- AI calls use existing `LOVABLE_API_KEY` + Gemini 3 flash preview with structured `{verified, issues[], confidence}` output; retry uses a separate "rewrite grounded in citations" prompt.
- Existing `pg_cron` verifier picks up the new endpoint on its 30-min tick; a first synchronous run happens on the backfill.

## Out of scope

- Adding brand-new events beyond the seeded 24 (can be a follow-up).
- Full-text search across the event library (already covered by category browser).
