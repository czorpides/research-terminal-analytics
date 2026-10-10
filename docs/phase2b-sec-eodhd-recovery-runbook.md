# Phase 2B — Official source recovery runbook

## SEC original annual 10-K facts

The new privileged POST endpoint is /api/public/ingest/sec-annual. It accepts 1–2 internal asset UUIDs, not arbitrary ticker search queries. Access requires a server-only INTERNAL_JOB_TOKEN supplied through x-internal-job-token. An identifiable SEC_EDGAR_USER_AGENT with a real contact email is also required before any SEC request. Both are currently deliberately unconfigured by the implementation: no global SEC crawler or scheduled job is enabled.

For each source request the worker validates the SEC CIK and original ticker against both submissions and CompanyFacts, restricts to verified USD US-listed equities, and selects original 10-K only. Each fact must have matching accession, report-end date, US-GAAP tag, valid USD/shares unit and appropriate annual duration/instantaneous period. The ledger receives SEC accession, original filing metadata, tag provenance and a SHA-256 content hash. Report acceptance metadata is retained as raw source-local text; publication timestamp is unknown rather than being guessed. The first-known timestamp is the actual date the terminal first observed the record, **never backdated**. Amendments, ambiguous values and unsupported EBIT/total-debt proxies are excluded.

Original SEC filings never overwrite an existing canonical entry; failures produce a failed run status. SEC metrics are not automatically used to rerank stocks before quality and provenance checks.

## EODHD subscription diagnostic

A separate privileged POST endpoint /api/public/ingest/eodhd-financial-capabilities makes at most two metered, read-only API requests using the existing EODHD_API_KEY: annual income statements and a next-seven-days earnings calendar. It reports available/blocked/malformed outcomes without storing issuer financial values, changing pricing pipelines, or enabling earnings collection. No request is made without both operator authorization and the server token.

A pure earnings parser handles provider code, report_date, pre/post-market designation, separate actual/estimated EPS and provider surprise; it never invents exact announcement time or analyst consensus. Tests cover malformed/duplicate rows and date-only precision.

## What is needed to activate

1. Configure a real, contactable SEC EDGAR User-Agent and random server-only internal job token through supported Lovable secret controls. Never commit them or place them under VITE_ configuration.
2. Verify SEC API response acceptance and first-ingestion CIK/period/metric sample directly against the issuer 10-K, including non-backdated as-of.
3. Enable bounded SEC filings import in stages after verified samples. Do not use a 3,000-name polling sweep until source access, retention and monitoring are validated.
4. Explicitly test EODHD fundamentals and earnings calendar entitlements for the existing plan. Do not bypass paid endpoints or assume that the EOD subscription includes fundamentals.
5. If EODHD earnings dates are licensed, design date-precision metadata before writing to earnings_events, whose existing timestamp would otherwise imply invented clock-time accuracy.
6. Only then add source schedules, monitored retry/failure handling, validated financial-factor updates and historical evaluation.

## Limits

This iteration creates verified import infrastructure, not a completed universe backfill. SEC only applies to eligible original US 10-K/XBRL cases; 20-F, amendments, banking taxonomy gaps and direct corporate earnings guidance require follow-up. No live prices, scores, existing cron jobs, auth semantics or other datasets are changed.

SEC API documentation: https://www.sec.gov/search-filings/edgar-application-programming-interfaces
SEC fair access: https://www.sec.gov/about/developer-resources
EODHD paid data product information: https://eodhd.com/lp/fundamental-data-api
EODHD calendars examples: https://github.com/EodHistoricalData/EODHD-openapi
