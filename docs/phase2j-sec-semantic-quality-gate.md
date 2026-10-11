# Phase 2J1 — SEC accounting semantics and model-readiness audit

## Purpose

Collecting original SEC 10-K annual filing facts is different from verifying the accounting basis or granting suitability for equity valuation. SEC original 10-K evidence remains **read-only and excluded from any score promotion**. Existing production semantics must not be silently changed to work around missing values.

Starting evidence: 51 issuer SEC source records, 49 with consecutive three-year histories, 1,351 extracted direct SEC facts (observed 2026-10-12). One-time Phase 2I finite backfill had **not yet been authorised** at start of work. The read-only assessment dynamically expands as additional issuers are ingested.

## Read-only protected review

The additive, service-role-only `sec_semantic_quality_review` view covers the latest three **original** FY 10-K filings of each issuer. It reports:

1. Consecutive three-year history and structural ledger QA availability/flags.
2. Per-core-metric years present: revenues, net income, total assets and operating cash flow, each expected to have **three direct original filing observations** before even considering comparability.
3. SEC accounting tags recorded for latest-year revenue and income, and switches in revenue tags across reports. `RevenueFromContractWithCustomerExcludingAssessedTax` can mean net sales/contract revenue, not necessarily total issuer revenues. `NetIncomeLoss` can reflect different attribution bases; neither is certified comparable by tag presence.
4. Diluted weighted-average share observations and >3x scale changes across the three years, flagged for review of splits/reverse splits or reporting basis. A share jump is a **warning**, not proof of a split; no adjusted shares are generated.
5. Explicit persistent `numerical_values_reconciled=false`, `accounting_bases_reconciled=false`, `model_ready=false`. A zero issue count is **not** sufficient to raise any of these values.

The protected Data Health panel classifies `source_incomplete`, `missing_metrics`, `comparability_review`, `awaiting_reconciliation`, and `unavailable` with individual diagnostics. `awaiting_reconciliation` is not approval. Server revalidates owner Supabase JWT on every request and accesses the service-role view internally. No public grants.

## Current exceptions and their dispositions

- [#83 AVGO](https://github.com/czorpides/research-terminal-analytics/issues/83): missing FY2025/FY2023 original net income; share basis changes around the 2024 split. No fabricated backfill or retrospective change to 2023 as-observed share count.
- [#86 BLK](https://github.com/czorpides/research-terminal-analytics/issues/86): Old/New BlackRock parent legal-filer CIK lineage. A new CIK cannot be automatically mapped to older legal registrant simply because its ticker matches.
- [#87 WFC, GS, MS](https://github.com/czorpides/research-terminal-analytics/issues/87): missing general net-revenue tag; interest/noninterest bank presentation needs sector-specific semantics, not total-interest-income substitution.
- [#88 SPGI](https://github.com/czorpides/research-terminal-analytics/issues/88): original 2024 10-K indexed but exact-accession CompanyFacts metric extraction fails.
- [#89 PNC](https://github.com/czorpides/research-terminal-analytics/issues/89): FY2023–25 original net income missing; parent-attributable versus consolidated must be reconciled.
- [#90 WMT](https://github.com/czorpides/research-terminal-analytics/issues/90): source revenue tag observes net sales, while total revenues include membership and other income.

## Deliberate release boundaries

This is **Phase 2J1**, not an automatic cure of the above source limitations. The database contains no manual certification table yet. The next 2J pass must add versioned issue-specific direct-filing reconciliation and canonical accounting-basis taxonomy (sector-aware, GAAP vs custom tags, consolidation scope, fiscal-period, units and legal-entity lineage), then independent numerical verification before enabling any model consumers. Do not use today's structural/semantic pass results as an auto-permission to include source SEC data in Radar scoring.

## Acceptance / roll-out

1. Regressions verify PNC missing net income, AVGO split-like share-scale warning, BLK/SPGI incomplete history, WMT tag caveat, and permanent `modelReady:false`.
2. GitHub CI: generated route tree, production build, TypeScript and SEC tests; Python analytics and Docker smoke.
3. Validate additive SQL view in a rolled-back production transaction, then merge and apply on actual Lovable Cloud production. Verify it is service-role-only; no migration should modify existing facts, scores or existing SEC queue.
4. Deploy code and confirm authenticated Data Health panel displays source status and diagnostic flags; unauthenticated server request rejected; no backfill initiated.
5. Audit selected live issuer results against existing issue findings before authorising specific semantic mappings or adjusting investing models.

### Preservation guarantees

No updates to `fundamental_facts`, `fundamental_filings`, `data_points`, `scores` or to worker scheduling. The Phase 2I one-time backfill is an independent, owner-controlled operation; it may run in parallel after explicit owner approval.
