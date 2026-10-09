# Phase 7 — SEC GAAP pre-inclusion evidence source

## What is implemented
A bounded, read-only, internal-token-protected SEC CompanyFacts probe:
POST /api/public/catalysts/read-sec-gaap
Body: {"symbols":["BE","ILMN"],"asOf":"2026-08-31T23:59:59Z"}.

Requires INTERNAL_JOB_TOKEN on the request and a real SEC_EDGAR_USER_AGENT configured **on the staging web service**. It never inserts rows, approves the issuer, or changes Swing scores.

Official SEC documentation: https://www.sec.gov/search-filings/edgar-application-programming-interfaces

For at most four uppercase US-listed symbols, resolve SEC CIK via the official ticker index, load SEC submissions including acceptanceDateTime, then CompanyFacts. Enforce a 650 ms delay between SEC requests, host allowlist, redirects disabled, response size cap and request timeout. CIK identities must match.

Only **direct** US-GAAP IncomeLossFromContinuingOperations facts, expressed as USD discrete quarters from explicitly accepted 10-Q/10-K filings, are eligible. Each quarter must have a validated quarter interval and original SEC accession acceptance instant at or before the requested cutoff. Four distinct consecutive quarters are required for trailing-quarter aggregation. Restatements published after the cutoff are invisible. No fallback to a similarly named pretax concept, custom taxonomy, reported EPS, or general net income is permitted.

This is deliberately conservative: many issuers do not report four direct quarterly facts of this concept, particularly annual Q4 or when continuing/discontinued components are immaterial. Their eligibility remains **unknown** pending separately sourced, analyst-reviewed reconciliation. Do not interpret a missing fact as an earnings loss.

The endpoint returns a fetched-at timestamp, the original filing acceptance timestamps and source URLs. It explicitly marks retrospective retrievals. Historic evidence publicly filed in August but retrieved by our service in October can support a *counterfactual historical eligibility assessment*, not the false claim that our platform detected the signal in August.

### Current activation blocker
The Railway research-terminal-web staging service does not currently list SEC_EDGAR_USER_AGENT. A real reachable contact is required by SEC fair-access policy. Do not create an invented email address or expose this value in the browser. Independent approval of the resulting hypothesis additionally requires CATALYST_REVIEW_TOKEN on staging; that too is currently absent.

### Next integrations
- Authorised S&P constituent membership snapshots, with **complete** negative labels and archive revisions;
- Free-float and security-level market cap sourced from an entitled provider and reconciled to each share class;
- IPO seasoning/exchange/corporate action history;
- Monthly volume/liquidity point-in-time from validated market data;
- Earnings consensus vintage feeds (subject to licensing);
- Backfill actual, dated data before evaluating Bloom Energy prior to 4 September 2026.

No current membership can be inferred simply because a symbol is not present in an S&P announcement feed.
