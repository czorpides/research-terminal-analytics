# Phase 2J19 — Versioned software economic-capital policy comparison

**Research status:** implemented, but **not approved for model ranking**. Original reporting evidence: Adobe FY2025, Autodesk FY2026, ServiceNow FY2025. Frozen research cutoff: 2026-10-09 20:00 UTC. Source inputs are the source-linked original SEC annual statements/notes in `software-operating-capital-perimeter.ts` and the six-year original SEC R&D cohorts in `rd-rollforward-third-issuer.ts`. Accounting figures have not undergone separate human secondary confirmation.

**Problem:** a numerical `ROC = operating income / capital employed` can appear precise even when reported current assets include operating and surplus cash; reported liabilities mix customer deferred-revenue obligations, financing debt and leases; acquisition intangibles, goodwill, commissions, ROU assets and hypothetical expensed R&D are treated inconsistently across companies. The correct immediate output is **transparent conditional capital deltas, not stock scores**.

## 1. Four independent definition axes

`sec.research.software_capital_policy_matrix.draft.v1.0.0` generates **24 cases per issuer, 72 in total**:

| Axis | Explicit policy alternatives | Important limitation |
|---|---|---|
| Acquisitions | Tangible capital vs goodwill + purchased finite-life net intangibles | No acquisition purchase-price/earnings-normalisation policy; this is a delta to a narrow book subset, not a GAAP new asset |
| Deferred revenue | Leave 100%, 50%, or 0% of CURRENT deferred revenue as an operating current liability | 50% and 0% are **not** observed economic service costs; noncurrent deferred revenue is not part of current liabilities in the starting basis |
| Operating leases | Rent-inclusive GAAP vs capitalised operating lease ROU + matching original operating lease liability financing claim | The capitalised lease version requires source rent expense, ROU depreciation and embedded lease interest to obtain adjusted EBIT. We leave operating income **null** under capitalised lease treatment |
| Research | Current FY GAAP R&D expensed vs 2J17 five-year hypothetical unamortised research asset and matched annual hypothetical operating earnings | May overlap software costs already capitalised or acquired technology; adjusted earnings **do not** legitimise a total invested-capital denominator |

**No policy is automatically recommended** because it produces a higher capital denominator, a lower denominator or a more favourable ROC. The original issuer fiscal years differ; neither prices nor October-dated TTM share counts are appended.

## 2. The arithmetic is purposely an INCOMPLETE bridge

The only reproducible starting subtotal is:

```text
Original GAAP current assets - original GAAP current liabilities
+ original net property, plant and equipment
  (as a reported *partial book-capital bridge*, NOT operating capital)

+ original current operating lease liability, removed from CL as financing
+ original disclosed NONCURRENT contract acquisition asset, if split known
+ [acquisitions] goodwill + purchased net finite-life acquired intangible
+ [deferred scenario] current deferred revenue × (1 - face fraction retained)
+ [capitalized lease scenario] booked operating lease ROU asset
+ [5y research scenario] hypothetical internal R&D intangible balance

NEVER add acquired developed technology separately: already in total acquired
intangible. NEVER add current contract acquisition costs separately: already
in original current assets. NEVER add the total already-booked contract cost
balance on top of its split.

Finance claims in an alternative capitalized-lease EV policy:
  original operating lease CURRENT + NONCURRENT obligation (for illustration).
They are NOT included in actual EV here because investor equity value and
all other economic finance claims are not source reconciled.
```

Every arithmetic input and policy delta is measured in exact six-decimal USD millions, using BigInt to avoid floating-point losses in 50%-retention cases.

### Starting facts and source-available book subtotals, USD millions

| Item | Adobe | Autodesk | ServiceNow |
|---|---:|---:|---:|
| Original CA – original CL + net PPE | 1,836 | **(745)** | 2,317 |
| Current operating lease financing removed from NWC | 77 | 52 | 112 |
| Known NONCURRENT contract acquisition asset added ONCE | 464 | **Not established** | 1,114 |
| **Conditional book bridge before other policy shifts** | **2,377** | **Unavailable** | **3,543** |

**The table does NOT mean the economic invested capital equals 2,377 or 3,543.** The starting CA contains cash and nonoperating assets, CL may contain debt and other financing, and PPE omits other assets. This proxy remains incomplete for every company. In particular, Autodesk's `913m` reported capitalised commissions are inside current and other noncurrent assets, but their precise current/noncurrent split is unavailable. The bridge is **null in all Autodesk cases**, even though the policy deltas still can be quantified.

### Controlled differences, USD millions

| Incremental change relative to baseline | Adobe | Autodesk | ServiceNow |
|---|---:|---:|---:|
| Include goodwill + PURCHASED intangible NET | +13,352 | +4,762 | +4,699 |
| Include 50% release of current deferred revenue obligation | +3,452.5 | +2,203 | +4,157 |
| Include 100% release of current deferred revenue | +6,905 | +4,406 | +8,314 |
| Change from rent-inclusive to capitalised lease ROU basis | +312 | +157 | +806 |
| Corresponding lease financing claim (not added to denominator as extra debt) | 438 | 251 | 912 |
| Hypothetical five-year R&D research asset | +11,235.8 | +4,365.4 | +7,255.4 |

The following do not follow from these arithmetic differences: cash economically available to shareholders, issuer-wide operating capital, a valid GAAP-lease reclassified EBIT, acquisition-inclusive economic returns, comparable ROC, enterprise value, or stock rankings.

Even if a conditional book subtotal is positive, the **denominator is not investment capital** and **all** final `investableCapitalMillions`, `economicallyComparableROCBps`, `enterpriseValueUsd` are `null`. If a capitalised lease policy is selected, the hypothetical annual income numerator also becomes `null`, preventing the use of rent-inclusive EBIT with capitalised lease assets and financing.

## 3. Specific no-double-count, accounting quality and point-in-time rules

- **Goodwill + purchased intangibles:** these are GAAP assets already reported in long-term assets, but absent from the intentionally narrow `CA-CL+PPE` starting subtotal. Their conditional inclusion in the arithmetic subtotal is **not** adding them to the issuer's real GAAP balance sheet a second time.
- **Developed acquired technologies:** Adobe net 28, Autodesk net 242, ServiceNow gross developed technology with no separately quantified accumulated amortisation. All are already within gross/purchased intangible disclosures. **No separate additive developed technology row.**
- **Contracts:** Adobe deferred commission noncurrent 464; ServiceNow deferred commission noncurrent 1,114; Autodesk's FY split unavailable. Current amounts stay inside CA; the long-term split is not in CA/PPE. Separate customer contract assets have an unquantified current/noncurrent allocation for which no zero-filling is permitted.
- **Deferred revenue:** current reported 6,905 Adobe, 4,406 Autodesk, 8,314 ServiceNow. An assumed 0–100% release from CL is not a verified customer fulfilment cash obligation or audited cost-to-serve ratio; it is a stress test.
- **Operating leases:** baseline rent-inclusive GAAP income keeps operating leases out of the EV financing claim. Current operating lease financing is removed from reported current liabilities when constructing the book-capital subset. Under capitalised lease method, also add booked operating ROU to the subtotal and the originally disclosed current+noncurrent lease liability to an illustrative financing claim, but **don't** use GAAP rent-expensed EBIT as the numerator.
- **Finance leases and borrowings:** original FY separate finance lease liabilities unverified for Adobe and Autodesk (ServiceNow explicitly reports none). Original current debt and finance claims are not completely isolated from reported CL in this FY subset. **Block real invested capital.**
- **R&D capitalisation:** original complete annual FY cohort sources produce a book-value *research hypothesis*, not a GAAP development asset. No restatement or stored fact is created. Current FY hypothetical adjusted income excludes unverified other capital and may overlap acquired software, so cannot create a legitimate ROC by division.
- **Time:** Adobe and ServiceNow original FY2025 vs Autodesk FY2026; not October 2026 live fundamentals nor identically timed trailing-twelve-month performance.
- **Governance:** No independent second human original note sign-off. **All** policy-scenario flags remain unapproved, unrankable, model-ineligible, scoring-ineligible, and read-only.

## 4. Deliverables and release criteria

1. `src/lib/ingestion/sec/software-capital-policy-matrix.ts`: fully pure versioned 4-axis policy evaluation, 72 reproducible cases from 2J17 and 2J18 source records, strict source date identity, exact BigInt arithmetic, unknown noncurrent contract costs fail closed, every compliance gate reported, no database or network code.
2. `software-capital-policy-matrix.test.ts`: coverage of all 72 cases, acquisition overlap, deferred half/full retention, lease financing consistency and missing adjusted EBIT, negative/unavailable original book-capital subset, 5-year R&D scenario linkage, maximum stacked sensitivity, input rejection, no scoring or EV promotion.
3. `src/components/research/SecSoftwareCapitalPolicyMatrix.tsx`: interactive FOUR policy selectors and three-issuer table visible only in existing owner-only SEC Valuation Workbench on the Adobe research selection, above previous source accounting evidence.
4. Existing original 2J18 evidence notes and other provider, model, history and scoring routes **not changed**.

**Next:** obtain current original issuer filings to reconcile cash in/out of operating NWC, current interest-bearing borrowed money in CL, finance lease obligations, EBITDA/rent depreciation/interest, contract asset current split and acquisition-driven operating earnings. Perform truly independent classification second review, then a strictly *sector-only* held-out comparison with source-verified annual EBIT and invested capital; consider software-specific scores only after governance review. Costco remains separate until its actual minimum operating cash is established.

**Release gate:** Frontend lint/build/typecheck/SEC original filing tests, Python analytics and container smoke all green before merge. Browser auth and deployed version verification remain separate.
