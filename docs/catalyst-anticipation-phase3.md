# Phase 3 — Anticipatory catalysts (staging only)

## Design
Maintain a separate watchlist of industry-established potential catalyst scenarios. This is NOT a prediction and NOT an observed news event. It never changes Swing or Opportunity rankings. Every hypothesis is first captured, then independently reviewed, with explicit unknown/failed criteria and time-of-knowledge gates.

### Methodology
- S&P 500 potential inclusion: official issuer eligibility requirements (US domicile, eligible listing, size, float, liquidity and GAAP earnings), verified current index membership and S&P committee discretion. https://www.spglobal.com/spdji/en/methodology/article/sp-us-indices-methodology/
- Nasdaq-100 potential inclusion: the 2026 Nasdaq methodology, revised full-market-cap ranking, current membership and quarterly/annual reference dates. Nasdaq is rules-based but a rank alone is not sufficient. https://www.nasdaq.com/newsroom/nasdaq100-index-methodology-update-why-now and https://indexes.nasdaq.com/docs/Methodology_NDX.pdf
- Earnings estimate revisions: licensed, timestamped changes to like-for-like consensus, not the absolute size of projected earnings.
- Official government procurement: documented issuer exposure and award windows; an opportunity/bid is not an award. https://sam.gov/
- FDA review: documented application/action date; not a prediction of approval. https://www.fda.gov/drugs/development-approval-process-drugs

### Technical guarantees
- Separate catalyst_anticipations table, not catalyst_events.
- New candidate intake: POST /api/public/catalysts/anticipations/ingest, requires INTERNAL_JOB_TOKEN.
- Independent reviewer: POST /api/public/catalysts/anticipations/review, requires CATALYST_REVIEW_TOKEN. These MUST be distinct 32+ byte server-side secrets.
- Each criterion supplies code, pass/fail/unknown, observedAt, sourceUrl, note. Unstated or invalid conditions remain unknown.
- All conditions passing means eligibility REVIEW only, not committee selection or event odds. A verified exclusion vetoes eligibility.
- Ingestion timestamp and independent verification gate historical visibility. All hypotheses auto-stale after event-specific review periods.
- Create a new hypothesis-key revision for new evidence; do not rewrite old point-in-time observations.
- No fake seed companies, likelihood percentages, model score changes, production feeds or scheduled auto-runs.

### Example payload (ILLUSTRATIVE; do not ingest as actual)
POST /api/public/catalysts/anticipations/ingest:

{
  "hypotheses": [{
    "hypothesis_key": "sp500:EXAMPLE:2026q4:r1",
    "symbol": "EXAMPLE",
    "hypothesis_type": "sp500_inclusion",
    "headline": "Research potential eligibility for future S&P 500 inclusion",
    "source_name": "Official S&P methodology",
    "source_url": "https://www.spglobal.com/spdji/en/methodology/article/sp-us-indices-methodology/",
    "source_published_at": "2026-10-01T00:00:00Z",
    "target_at": null,
    "expires_at": null,
    "criteria": []
  }]
}

Then independent review with hypothesis_key, decision (verified/rejected) and a 20+ character verification_note. Pass criteria must have issuer-specific, timestamped and independently checked evidence.

### Remaining gates
1. Run the additive migration and authorisation checks on isolated Railway/Supabase staging.
2. Connect an authoritative membership file, dated float/cap/liquidity/GAAP earnings sources and published method version before automated S&P candidate detection. Market cap alone is NOT adequate to claim inclusion potential.
3. Connect licensed analyst estimate-revision data and genuinely attributable procurement/FDA official sources.
4. Measure false-positive rate, point-in-time leakage and research value on historical unseen periods before changing Swing ranking or activating cron.
5. Resolve the S&P feed's existing 403 via a permitted source channel and finish the legacy Lovable cutover before production merging.

Current scope is an audited, unscored human/source-fed research pipeline, not live automatic S&P inclusion prediction.
