## Phase: Prompt 9 — Historical Event Engine

Build a deterministic historical-analog engine so every radar entry, catalyst, and macro regime can be answered with "what happened last time this setup appeared?" — with auditable evidence, not vibes.

### What ships

1. **Event library (seeded + extensible)**
   - New tables: `historical_events`, `event_tags`, `event_impacts` (asset/sector/commodity level with %move + window).
   - Seed ~40 well-documented events across regimes: rate-cut cycles, yield-curve inversions, oil shocks (1973, 2008, 2014, 2020, 2022), tariff rounds (2018–19, 2025), tightening cycles, recessions, banking stress (SVB), COVID crash/recovery.
   - Each event carries: date range, category, macro fingerprint (which FRED series moved and by how much), affected industries/commodities, outcome window returns.

2. **Analog matcher (deterministic)**
   - `src/lib/history/match.server.ts`: given a current macro fingerprint (rate direction, curve shape, inflation trend, commodity regime) OR a catalyst (e.g. "tariff on steel"), return top-N historical analogs ranked by fingerprint distance + tag overlap.
   - Confidence = coverage of matched dimensions × recency weight × data-tier of underlying series.

3. **Panel integration**
   - New "Historical analogs" block on: Command Centre (regime-level), Overvaluation/Undervaluation radar rows (per-asset via sector/industry), Catalyst rows (per-catalyst).
   - Each analog shows: event name, date, 1-line setup, forward returns (1m/3m/6m/12m) for the affected group, link to full event card.
   - New route `/history` — browsable event library + fingerprint search.
   - New route `/history/$eventId` — full event card with macro chart context, impacts table, sources.

4. **Why-bullets upgrade**
   - Undervaluation/Overvaluation `whyBullets` gain a "Historical parallel" line when a strong analog exists (e.g. "Similar setup in 2016 preceded +18% median 6m return for the industry").

5. **Verify chain**
   - Algo runner: `checkAnalogCoverage` — did we find ≥3 analogs above min-confidence?
   - AI verifier: coherence check that flagged analogs actually match the current setup (guardrail against spurious tag matches).

6. **Automation**
   - Weekly `pg_cron` job recomputes macro fingerprints + refreshes analog cache per active radar entry.

### Technical notes

- Fingerprint = fixed-dimension vector (rate level bucket, rate direction, curve sign, inflation regime, USD trend, oil regime). Distance = weighted Hamming/L1. Deterministic, auditable, no embeddings.
- Events stored with source URLs (Fed minutes, BLS releases, news archives) so every analog can be traced.
- Impact returns computed from actual price history where we have it; seeded from published research where we don't, tagged with lower confidence tier.
- All new panels follow existing `PanelData` contract: sources, freshness, confidence, verify chain, whyBullets, positives/deductions semantics.

### Out of scope (future phases)

- Prompt 10 (broader alt-data ingestion beyond what catalysts already use).
- Prompt 11 rest (AI narrative commentary layer).
- Prompt 12 (alerts + notification controls).
