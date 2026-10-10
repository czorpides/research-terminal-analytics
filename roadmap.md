# Roadmap

## Phase 2B — SEC + EODHD Edge Functions (in progress)
- [ ] A) `research-sec-annual` Edge Function: owner-JWT gated SEC 10-K facts ingestion into fundamental_filings/fundamental_facts
- [ ] B) `research-eodhd-capabilities` Edge Function: owner-JWT gated, 2 read-only EODHD entitlement probes
- [ ] C) Data Health panel: "Test SEC sample" (MSFT e8b1a94b-b7e7-4fb9-981b-72eeee9139db) + "Check EODHD coverage" buttons, click-only
- [ ] D) Unit tests (identity/annual-fact selection, invalid entitlement payloads); deploy to Lovable Cloud only; report CREATED vs DEPLOYED; no backfill
