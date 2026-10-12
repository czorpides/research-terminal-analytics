# Phase 3A — Swing Radar opportunity-gap forensic funnel

**Date:** 2026-10-12. **Status:** deterministic shadow instrumentation only; not a model promotion and not historical proof that a named stock is a good trade. Does NOT change v2.1 scores, symbol nomination, top-140 shortlist, catalysts, trade entry thresholds, stored research records, database schema or event providers.

## Why this is next after the 2J data-accounting closeout

The trader's core question is not merely why a stock may receive a 55.9 score; it is whether a compelling opportunity was **missed due to coverage, preselection, setup fit, event evidence, ranking cap or risk control**, rather than truly being a lower-quality trade.

The current v2.1 pipeline already restricts candidates at **multiple stages**:

1. It loads a bounded active equity universe (target about 3,000). Unsupported exchanges or symbols can be missing before technical evaluation.
2. The broad screen requires evidence from `equity_technical_screen` or backed `momentum/trend/volatility` data.
3. Only up to 220 equities are nominated to the more expensive deep scan.
4. Each nominee needs at least 45 usable split-adjusted OHLC bars, then a v2.1 setup must exist.
5. Nonmetal candidates need a setup ranking score of at least **42** and an entry state other than `invalidated`.
6. Only around 140 top-ranked candidates are surfaced. Hardening can then remove extreme discontinuity risk.
7. The screen may apply independent user filters, including minimum ranking and search terms.

A stock that falls out at stages 1–4 or 6 **cannot be diagnosed as a bad trade by citing a nonexistent setup score**.

## What Phase 3A adds

- `src/lib/swing/opportunity-gap-audit.ts`: pure exact-symbol `buildSwingOpportunityGapAudit` classifies six fixed tracked research symbols: **AAOI, INTC, NBIS, EOS.AX, PENG, BE**. No symbol is added to the universe, force-deep-scanned, promoted or granted score points.
- The existing `src/lib/swing/workspace-v2.functions.ts` uses **data already present** during the existing full-universe, screen, select, OHLC, setup and surfacing phases. It retains a tiny diagnostic observation only for each watched symbol in the current bounded snapshot. The optional `opportunityGapAudit` is added to the existing workspace response; older one-hour persisted snapshots may lack the new field, and the UI labels that as unavailable, not as a weak candidate.
- `SwingOpportunityGapPanel.tsx` displays source-known selection stage, raw v2.1 shadow setup score (when ACTUALLY computed), risk/confirmation details, and distinguishes final defensive hardening that can remove a pre-hardening surfaced candidate.
- `SwingTradesV2View.tsx` renders the research panel above the ordinary results; no independent API endpoint, privileged SQL query, provider billable request, scoring alteration or tables added.
- `opportunity-gap-audit.test.ts` checks missing managed-universe, missing broad evidence, nomination exclusion, insufficient 45-bar history, no setup, under-42 model floor, invalidated setup, top-140 capacity, actually surfaced, exact EOS.AX ticker and duplicate-asset ambiguity. Tests assert no score mutation or forced selection and reject nonfinite raw scores.

## Precision and important limits

**Two different scores:** A previously discussed Opportunity Radar composite score of 55.9 is **NOT** the same calculation as a v2.1 Swing setup/ranking score. Phase 3A deliberately shows only the observed **v2.1 shadow setup score**, or `null` when a setup was not computed. It cannot explain an old 55.9 score by silently substituting a new one.

**No invented expert quality labels:** External analyst/expert endorsements and screenshots are not coded as true bullish outcomes. AAOI, NBIS, PENG or any other watch name may be excluded for entirely justified risk, timing or evidence reasons. This audit provides falsifiable stage evidence, not a predetermined ranking correction.

**No cross-exchange ticker substitution:** `EOS.AX` must match that literal symbol among managed assets. Do not automatically map it to `EOS` at another exchange, or to a non-equity security with a similar name. If the source uses a different exact symbol, that requires a verified asset-master mapping change in a separate task.

**Not an unconditional past-performance study:** Every diagnosis uses the latest bounded pipeline snapshot; nothing here proves an unrealised 2025 or 2026 gain. The next work should join observation-time frozen setups to **subsequent** outcomes through the existing tracker; measure false negatives alongside false positives, using look-ahead-free price/earnings/catalyst availability.

**Data readiness:** The pipeline still needs fresh managed equity coverage, full-universe OHLC history and operational heartbeat before claims of reliability. Never treat a green GitHub CI job as proof of fresh 3,000-name price coverage, a production deployment or a signed-in browser view. The separate original SEC valuation ledger blocker remains tracked in [Issue #119](https://github.com/czorpides/research-terminal-analytics/issues/119), without restarting Phase 2J.

## Next development after acceptance

Start a **controlled false-negative replay** using the existing `swing_trade_setups` outcome tracker and point-in-time snapshots. Select the foregone and surfaced candidates using *past known-at eligibility*, reconstruct the selection gates as of the signal date, track subsequent 5/10/20-session outcomes net of realistic stops/ATR and corporate actions, and compare catalysts as documented then. Only after enough independent outcome observations should a policy/ranking weight or nomination lane be reconsidered. We should not compensate for missing data with a "bonus" to popular symbols.

## CI and rollout

GitHub frontend production build + TypeScript + all `src/lib/swing/*.test.ts` opportunity tests, Python analytics and container smoke must pass before merge. Production deployment, actual current watchlist rows and owner browser verification are **separate** acceptance tasks. This module has no database writes and no SEC dependencies.

## Independent live read-only data observations on 12 October 2026

A read-only query against the connected `research-terminal-analytics` Supabase project confirmed active equity master records for **AAOI, BE, INTC, NBIS and PENG**, while **no asset master row existed with the literal symbol `EOS.AX` or `EOS`**. This does not prove the Australian company is unsupported permanently; exact issuer/exchange mapping would need to be researched and corrected separately.

For each of the five active US equities, `equity_technical_screen.as_of` was **2026-08-07**, not a current October observation. The rows had `bars=295`, but bar count is *historical depth*, not freshness; that 295-session history is not proof of an October daily close. The pipeline must not treat August market prices as October prices or the associated momentum as a live signal.

Phase 3A therefore includes an explicit **dated technical-screen freshness observation** and warns when the screen is older than seven calendar days (or carries an invalid/future source date). Crucially, this does not cause an automatic ticker promotion or change the shadow score. If the technical screen is stale but fresh alternative scored evidence exists, the UI still names the dated technical-screen issue rather than claiming all evidence is necessarily missing.

Read-only SQL alone cannot prove whether the production Swing route refreshed since the last stored technical row or whether the actual full-universe EOD worker ran. Operational acceptance requires reading the existing Swing Runtime Trust Gate, monitor heartbeat and EOD ingestion logs; do not infer an operational engine from these historical rows.

**Next operational task:** Reconcile the scheduler, FMP/EODHD provider access, bulk daily ingestion, backfill and technical screen as-of across all active equities. Never force historical prices to a newer date. A separate issue tracks the stale data rather than hiding the problem with higher model scores.
