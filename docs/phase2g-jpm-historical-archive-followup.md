# Phase 2G follow-up — JPM historical archive selection

## Observed live run — 11 October 2026

- Owner ran two-company history repair. **META** gained FY2023 original 10-K (1 filing, 9 facts), reaching three consecutive original annual periods.
- **JPM** remained at FY2025 only, with zero new facts after fetching four historical index files; the SEC run was correctly recorded as **partial**, not success.
- Production then showed ten of eleven SEC issuers with three consecutive annual periods, no structural integrity warnings, and one remaining incomplete issuer.
- The SEC separately publishes original JPM FY2024 and FY2023 10-Ks: accessions `0000019617-25-000270` (filed 2025-02-14) and `0000019617-24-000225` (filed 2024-02-16), both under CIK 19617. Their presence demonstrates the source is available but does not prove which exact SEC archive shard or XBRL fact rows are causing the importer shortfall.

## Root-cause hypothesis and targeted correction

The prior helper sorted continuation-index metadata by **newest `filingTo`** and fetched the first four. An unusually high-volume filer may have many recent continuation indexes, so the four latest shards can all be later than the annual filing dates being sought. This is a supported failure mode in the existing code; live `filings.files` date ranges have not been independently inspected in this session, so treat it as the **leading hypothesis**, not a proven sole cause.

The replacement picks four bounded, same-CIK, parent-allowlisted indexes by proximity to **two previous annual filing anniversaries**, using `filingFrom` and `filingTo` metadata. It allocates up to two candidate shards per missing year instead of all four to the newest date range. It falls back to the earlier newest-first selector when no verified reference 10-K `filedDate` is available.

If the annual period remains incomplete, diagnostics now distinguish:
- Original 10-K period metadata **present**, but no directly supported accession-matched CompanyFacts metrics extracted; versus
- Original 10-K period metadata **not found** in the selected indexes.

No guessed report dates, invented financial metrics, additional paid data or issuer-wide backfill is allowed.

## Release gate

- Confirm new date-window selection tests alongside existing original 10-K XBRL, ownership, TypeScript, Docker, and analytics tests.
- Release code only; **no migration, no automatic provider action, no score changes**.
- Owner explicitly previews **Historical repairs** and retries JPM after release / cooldown. If the indexed original periods remain absent, review actual SEC metadata windows; if indexed but facts absent, inspect issuer's precise US-GAAP facts and avoid synthetic proxies.
- Validate each newly inserted original accession, `filedDate`, direct tags, USD/shares unit, and actual first-observed `known_at`. Do not call four direct observed tags 'complete statements'. Review bank ratios separately.
- Continue to the ten-issuer **manual expansion** only after this exception is classified and numerical samples are reconciled.

Official SEC source examples:
https://www.sec.gov/Archives/edgar/data/19617/000001961725000270/0000019617-25-000270-index.html
https://www.sec.gov/Archives/edgar/data/19617/000001961724000225/0000019617-24-000225-index.html
