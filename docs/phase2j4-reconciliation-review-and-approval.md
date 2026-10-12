# Phase 2J4 — Three-year reconciliation coverage and research-model approval

## Production intake

The one-time Phase 2I SEC pilot expansion is finished: 46 succeeded, one partial (XOM), zero failed, 47 original issuer jobs. The full source ledger now has **97/100 SEC-covered issuers**, **95 with consecutive original three-year 10-K histories**, 0 structural flags. BLK, SPGI and XOM are separately tracked. Phase 2J4 does NOT retry or modify these.

## New official-account reconciliation, not financial guesswork

Direct original annual 10-K income-statement lines in USD millions:

| Original issuer | FY | Net interest | Noninterest | Issuer net revenue |
|---|---|---:|---:|---:|
| PNC | 2024 | 13,499 | 8,056 | 21,555 |
| PNC | 2023 | 13,916 | 7,574 | 21,490 |
| WFC | 2024 | 47,676 | 34,620 | 82,296 |
| WFC | 2023 | 52,375 | 30,222 | 82,597 |
| GS | 2024 | 8,056 | 45,456 | 53,512 |
| GS | 2023 | 6,351 | 39,903 | 46,254 |

These **18 original-year reconciliation rows** join the 17 previously recorded rows, including their issuer-specific period, original SEC accession, source first-observed timestamp and accounting definition. The three named institutions now have verified arithmetic bank revenue bridges for FY2023, FY2024 and FY2025 (9 issuer-years). Current MS original FY2025 top line remains checked, but net-interest and noninterest component validation is incomplete and is not guessed.

Official original reports (actual filing-year accessions):
- PNC 2024: https://www.sec.gov/Archives/edgar/data/713676/000071367625000027/pnc-20241231.htm
- PNC 2023: https://www.sec.gov/Archives/edgar/data/713676/000071367624000028/pnc-20231231.htm
- WFC 2024: https://www.sec.gov/Archives/edgar/data/72971/000007297125000066/wfc-20241231_d2.htm
- WFC 2023: https://www.sec.gov/Archives/edgar/data/72971/000007297124000064/wfc-20231231_d2.htm
- GS 2024: https://www.sec.gov/Archives/edgar/data/886982/000088698225000005/gs-20241231.htm
- GS 2023: https://www.sec.gov/Archives/edgar/data/886982/000088698224000006/gs-20231231.htm

## Whole-universe dynamic workbench

Service-role-only view `sec_reconciliation_coverage` emits up to 100 curated SEC issuers × **five original source metrics**: revenue, consolidated income, total assets, operating cash flow and diluted weighted-average shares.

For each issuer×metric cohort it distinguishes:
- Original source presence across the latest three 10-Ks (0–3).
- Issuer-document-checked evidence across the same original-year filings (0–3).
- Missing or nonconsecutive filing history.
- Missing raw SEC tag **versus** three years of independently checked issuer evidence. Missing generic `STMT_REVENUE` or `STMT_NET_INCOME` is NOT a blocker if an original source issuer-ledger reconciliation exists for all three years.
- No approved accounting-basis policy yet for assets, cash flow and share counts.
- Cohort with three reconciled issuer original 10-K years, awaiting explicit owner review.

Presence of figures ≠ semantic peer comparability. This view does not invent values, automatically reconcile unsupported tags or update investment scores.

## Explicit two-step research model reviews

Separate `sec_model_review_cases` and append-only `sec_model_review_events`:
1. Owner selects an issuer+explicit basis and **proposes** a *research-only* 3-year cohort with ≥40-character notes.
2. Security-definer procedure recomputes the latest 3 original consecutive SEC FY filings and requires exactly 3 original-filing, issuer-document-checked, immutable `sec_issuer_reconciliations` with **matching source accession**. For bank net revenue it additionally requires the 3 original bank component bridges (net interest+noninterest=issuer total).
3. Proposal stores exact three source evidence IDs + latest filing-year end. No action at this step gives model access.
4. Owner separately reviews and explicitly **approves for research-only use** (≥80-character source/accounting justification) or **rejects**, via a distinct authenticated request. Research approval is not an independent audit; the owner must not certify documents not checked. Review actor, time, notes and changes are audited.
5. Approved research cohorts may be **revoked**. Approval is dynamically deactivated whenever a newer SEC original annual period appears. A new 3-year review is then required.
6. No consumer is connected automatically. `score_enabled=false` is enforced by a database CHECK constraint. Radar, Piotroski, Magic Formula and other production model inputs remain on their existing safe source restrictions.

**This phase does not grant unattended live model or scoring access**. Enabling a DCF-style research-mode consumer later requires a separate, explicit code release and tests for the exact approved basis, statement timestamp and monetary/share unit.

## Validation and release

- Transactional dry-run against Lovable production: six original bank years → 18 new accession-matched rows, 35 total, exact bank bridge arithmetic; create read-only coverage view.
- Security and workflow test: propose/approve/revoke PNC net income, propose Broadcom net income and GS 3-year bank revenue, reject GS net income where original issuer reconciliation is not present. All done inside `BEGIN…ROLLBACK`, **zero resulting production approvals**.
- CI: TypeScript, SEC original-source tests, Python analytics, Docker container smoke. Merge only green; apply migrations on the production project and assert service-only permissions and no scoring/migration effects.
- Live owner Data Health table shows source completeness, reconciled years and explicit proposal/review actions. No approvals auto-submitted.
- Outstanding industry accounting reconciliation: generic issuer revenue for nonbanks, FY2023–25 MS bank net-interest/noninterest bridge, all 97 issuers' net income attribution, assets/cash flow, shares/splits, legal filer changes and missing coverage. Retain these as outstanding work; do not declare all 97 companies numerically audited.

## Reversibility

Rollback SQL dispatcher not required: no SEC provider calls, queue or scoring changes. If the UI has a fault, stop using the new owner controls; preserve append-only source evidence and review event audit. Never delete raw SEC facts or backdate reviewed timestamps.
