# Anticipatory catalyst historical validation — Phase 6

Run only against **original, independently reviewed pre-event observations** and separately sourced future ground-truth outcomes. No synthetic issuer data is included in production/staging tables. A source being published in the past does not make it historically observable by our system unless first_observed_at, reviewed_at and verified_at are also before the candidate evaluation cutoff.

## Verified current data coverage (9 October 2026)
Owned Supabase project sythouvmvdhxwbmzwpxy:
- Daily adjusted market prices last observed on 7 August 2026 for BE, ILMN, FRSH, TWLO, PENG, AAOI, INTC and NBIS.
- In this sample only INTC has 4 stored fundamental filing records; BE, ILMN, FRSH, TWLO, PENG, AAOI and NBIS have **none**.
- The anticipatory_hypotheses table has zero records immediately after additive migration.
- As a result, a reliable **real-world** pre-4-September 2026 Bloom Energy eligibility backtest **cannot yet run**. The 4 September S&P addition announcement is ground truth for the event, but it cannot retroactively prove that the platform predicted anything. Do not insert guessed or current-date historical snapshots.

Official S&P announcement: https://press.spglobal.com/2026-09-04-Bloom-Energy%2C-Illumina%2C-and-Everpure-Set-to-Join-S-P-500-Others-to-Join-S-P-100%2C-S-P-MidCap-400%2C-and-S-P-SmallCap-600
Bloom Energy official addition announcement: 4 September 2026; effective 21 September 2026. Use a research cutoff **before the announcement became public**, with adequate conservatism for unknown time-of-day.

## Evaluation harness
The pure study engine lives in src/lib/catalysts/outcome-study.ts and is run offline with:

    node --experimental-strip-types scripts/run-catalyst-outcome-study.ts /path/to/real-evidence-cases.json

JSON format:
- studyAsOf: current timestamp at which the comparison is conducted;
- cases: array of caseId, assetId, symbol, hypothesisType, evaluationAt, outcome, outcomeObservedAt, outcomeSourceUrl, completeMembershipEvidence;
- snapshots: original AnticipationHypothesis records with source timestamps, criteria evidence and independent verification.

Outcomes are one of:
1. announced_addition: confirmed from the actual provider announcement known AFTER evaluationAt.
2. not_added_complete_membership: NOT inferred from silence in an announcements feed; requires a **complete and time-stamped constituent census** for the relevant window.
3. unresolved: unlabelled; excluded from confusion-matrix accuracy metrics.

The harness selects only hypotheses fully first-observed/reviewed/verified by the evaluation cutoff, then applies the actual expiry and eligibility gates as they were observed. True/false positives/negatives, observed precision, recall, specificity, and labelled outcome coverage are reported explicitly. Empty datasets produce null precision/recall. Output never creates market returns, event probabilities, or trades; the word "positive" here means *eligible research signal with a later announced addition*, not positive portfolio P&L.

## What is still required
1. Recover a point-in-time *complete* S&P 500 membership series, including historical security/issuer resolution, licensing/permissions, and complete negative-case snapshots.
2. Reconcile issuer market cap, float-adjusted cap, rolling monthly liquidity and GAAP quarterly / trailing profits *as they were filed before the cutoff*; preserve filing acceptance dates, amendments, adjustments, currencies and corporate-action status.
3. Restore price/filing completeness in owned Supabase; compare against source Lovable and historical SEC data. Do not enable false precision by using current fundamental measurements at historical cutoffs.
4. Run several months/years of labelled candidates and negatives, stratified by sector, base score and catalyst type.
5. Only consider altering ranking weights if out-of-sample uplift survives realistic trading costs, gaps, and adverse-event analysis.

CI tests exercise synthetic fixtures solely to verify safeguards. **No empirical precision, alpha or BE advance detection has yet been established.**
