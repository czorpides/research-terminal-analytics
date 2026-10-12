# Phase 2J21–2J24 — SEC methodology freeze, second-path challenges, legacy shadow integration and release acceptance

Date: 12 October 2026. Repository: `czorpides/research-terminal-analytics`.
**Implementation state**: read-only source, methodology and compatibility tooling. No automatic financial-data promotion, database writes, ranking updates, macro signals or price feed changes. Approval, source review and production deployment are tracked **separately** from code completion.

## 2J21 — Methodology decision

`sec-methodology-gates.ts` formalises a **selected DRAFT policy**, not a certified actual economic ROC:

- Earnings: original GAAP consolidated operating income (not a universal interest-adjusted EBIT). No lease/rent or annual R&D adjustments enter production.
- Operating leases: rent included in GAAP operating income, operating lease liabilities excluded from baseline EV; capitalised-lease alternative requires a matched expense/asset and financing policy.
- Finance leases: treat finance liabilities and the corresponding unduplicated ROU consistently and only with note-level support.
- Acquisitions: original recognised goodwill/purchased technology/contract costs must not be summed twice; 2J17 five-year R&D hypothetical stock remains a separate shadow analysis.
- Deferred revenue: retains reported customer obligations as operating liabilities until a reviewed cash cost-to-serve convention is established.
- Cash and securities: **freely available surplus for EV remains unknown**, not 0 and not the full balance. Separate operating cash buffer and restricted/inaccessible assets.
- Sector: software without an approved positive economic capital denominator **not eligible** for generic industrial Greenblatt ROC. Financials, REITs and utilities remain sector-excluded under the original policy.
- Provenance: use original accession, first-seen/acceptance time, true period end and exact underlying market-share-class coverage. Do not treat FY end as data-known time.
- No automatic field mapping from GAAP operating income to `STMT_EBIT`, or debt-note subtotal to `STMT_TOTAL_DEBT`, without approved semantic crosswalk.

Five pilot subjects: `ADBE, ADSK, NOW, COST, AMZN`. Each receives an eight-category review register with original SEC anchor, evidence status and unresolved approval reasons. Source cross-footing does not certify human review.

## 2J22 — Independent implementation / held-out checks

`sec-independent-codepath-checks.ts` independently recomputes a second code path of original filing checkpoints, without calling the source-issuer's published arithmetic tests for the values being checked. It compares directly against:

- Adobe FY2025 cash 5,431, short securities 1,164, current assets 10,163, noncurrent debt 6,210 and original annual R&D 4,294; finance leases explicit 0.
- Autodesk FY2026 cash 2,249, short securities 348, current assets 4,942, noncurrent debt 2,483, FY R&D 1,643; finance leases **null**.
- ServiceNow FY2025 cash 3,726, short securities 2,558, current assets 10,471, noncurrent debt 1,491, FY R&D 2,960; 6m restricted cash **outside** cash equivalents.
- Costco FY2026 21,301m combined book cash/securities with 2,842m unsettled card settlements, yielding 18,459m residual **not distributable cash**; 9 period-end observations over 8 fiscal quarter intervals.
- Amazon FY2025 2,748m current long-term debt + 65,648m noncurrent = 68,396m; an **additional** 455m short-term credit facility outside that reported debt subtotal. Complete economic borrowing remains *incomplete* due to potential financing obligations.

**This is an independent algorithm/implementation, not an independent ACCOUNTANT.** The reported original figures are manual extractions originally performed within this research programme. Human external source-note sign-off is a remaining acceptance gate, not asserted from arithmetic success.

A production-worthy independent second review requires another knowledgeable reviewer to independently extract, classify and sign the actual original financial statements/notes, including counterexamples and restatements.

## 2J23 — Legacy model compatibility (SHADOW)

`sec-legacy-shadow-bridge.ts` imports the actual existing production **pure** `computeMagicFormulaRaw`, `rankMagicFormula`, `STATEMENT_METRICS`, and existing legacy version. A typed semantic crosswalk documents seven fields that cannot yet be promoted. It **does not** import writers or trading jobs and cannot update `STMT_*` data.

- An owner-authorised existing legacy input can be evaluated in memory, but even if the old formula computes a numerical rank, the SEC research gate stays **false**.
- A regression fixture demonstrates that the legacy v0.1 model can be eligible on **synthetic fully populated data**; this is not proof that original SEC semantics, known-at, leases and operating capital have been audited. Synthetic data are never represented as true issuer values in the UI or historical records.
- When no authorised legacy input is present, no invented current-period record, market cap or SEC score is generated.
- No `MAGIC_FORMULA_CALC_VERSION` change, no sector promotion, no historical score/rank rewrite, no application entry to the production scoring pipeline.
- A safe future production integration should require an **explicit, separately reviewed issue/PR** that defines the source semantics, issuer approval, acceptance fixtures, rollback feature flag and shadow drift thresholds before the model ranks any new source figures.

This is **integration of the governance and shadow contract**, not activation of production SEC-based scoring. Claiming that 2J23 has deployed a new scoring algorithm would be inaccurate.

## 2J24 — Final code CI, deployment and release gates

`sec-release-readiness.ts` assembles:
1. 2J21 policy freeze and unresolved issuer accounting decisions,
2. 2J22 second-path validation results with zero tolerance for arithmetic mismatches,
3. 2J23 actual legacy in-memory shadow safety,
4. explicit CI and deployment acceptance attestations.

The pure checklist never marks actual CI, deployed SHA, owner login/API authorisation or original source-ledger connectivity as successful merely because code builds. It requires independent external evidence:

- GitHub production build and generated route check, TypeScript, all original SEC tests and existing opportunity/scoring tests;
- Python analytics suite and standalone Docker/container smoke;
- deployed SHA equals the exact reviewed Git commit;
- authenticated owner browser opens `/sec-valuation-workbench`;
- authenticated owner API `/api/public/research/sec-valuation-preview?symbol=ADBE` returns correct original provenance; unauthenticated and non-owner requests fail appropriately;
- original SEC ledger actual stored `raw` names and `known_at` verified for AMZN/ADBE/COST; a successful CI compile does not prove the production `lookupOriginal` works;
- independent source reviewer attestation and unresolved finance/cash/lease/capital fields completed.

The release readiness function remains `research_only_release_blocked` when approvals are missing **even if mocked external CI/deployment flags are supplied true**. Production model approval always needs its own versioned PR after sign-off.

### Potential production-readiness issue for browser check

The existing 2J11 API `src/routes/api/public/research/sec-valuation-preview.ts` asserts exact `fundamental_filings.raw.primaryDocumentUrl` and `raw.filedDate` fields. Static build checks do not prove the live SEC ingest ledger stores these exact raw keys. During 2J24 live acceptance, inspect the actual restricted production record using **read-only DB inspection** before treating the owner API as validated. If the persisted SEC raw schema differs, correct only with verified source metadata and tests; never bypass CIK/accession/original URL verification.

### Post-merge status / handoff

- Code can be merged only after all normal repository CI jobs are green.
- Live deployment and browser acceptance remain **not performed unless separately observed through a connected deployment/browser service**; a merge is not proof of live deploy.
- Independent accountant sign-off remains outstanding; it is a genuine human external dependency, not something ChatGPT or automated tests can impersonate.
- The original issue backlog (EBIT and full debt perimeters, Piotroski actual period-end shares) remains separate. Do not silently mutate weighted-average diluted EPS share use.
- The broader project can progress to catalysts and factor rankings while financial-model input promotion remains blocked for unsupported issuers.

## Deliverables

| Phase | Implemented output | External acceptance still required |
|---|---|---|
| 2J21 | Versioned bounded draft accounting policy; eight original-issuer evidence requirements | Economic-policy approval, verified cash/financing and sector classification |
| 2J22 | Independent automated crosspath source checks with held-out software issuer and AMZN correction | Distinct human accountant source-note review |
| 2J23 | Real legacy Magic Formula calculator/ranker in-memory shadow, typed crosswalk and immutable no-write guard | Separate audited model promotion, live issuer data capture, feature-flag/rollback approval |
| 2J24 | CI tests, unit-level release readiness and owner-visible blockers | Verified deployed SHA, owner-browser/auth API, actual production original ledger and external source signoff |
