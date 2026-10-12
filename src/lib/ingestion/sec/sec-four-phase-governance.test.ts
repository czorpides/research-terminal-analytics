import test from "node:test";
import assert from "node:assert/strict";
import {reviewSecMethodology,reviewAllSecMethodologies} from "./sec-methodology-gates.ts";
import {runSecIndependentCodePathValidation,validateSecIssuerSecondPath} from "./sec-independent-codepath-checks.ts";
import {assessSecResearchRelease} from "./sec-release-readiness.ts";
import {
 compareLegacyMagicToSecDraft,dryRunLegacyNoPromotion,SEC_TO_LEGACY_CROSSWALK,
} from "./sec-legacy-shadow-bridge.ts";
import type {MagicFormulaRawInput} from "../../opportunity/fundamental-models.ts";

test("2J21 explicitly fixes the working policy but does not assert issuer-level accounting approval",()=>{
 const rows=reviewAllSecMethodologies();
 assert.deepEqual(rows.map(x=>x.issuer),["ADBE","ADSK","NOW","COST","AMZN"]);
 for(const row of rows){
  assert.equal(row.reviewComplete,false);
  assert.equal(row.independentHumanReviewer,false);
  assert.equal(row.productionEligible,false);
  assert.equal(row.scoringEligible,false);
  assert.equal(row.operatingCapitalUsd,null);
  assert.equal(row.storedChanges,0);
  assert.ok(row.unresolvedIds.includes("surplus_cash"));
  assert.ok(row.unresolvedIds.includes("financing_perimeter"));
  assert.ok(row.unresolvedIds.includes("independent_reviewer"));
  assert.equal(row.policy.research,"gaap_rd_expensed_and_hypothetical_fy_amortization_shadow_only");
  assert.equal(row.policy.operatingLease,"rent_in_gaap_expense_exclude_operating_lease_liabilities_from_ev");
  assert.equal(row.policy.surplusCash,"null_until_operating_reserve_and_distributability_review");
  assert.ok(row.evidence.every(x=>x.issuerSource===null||
   x.issuerSource.startsWith("https://www.sec.gov/Archives/edgar/data/")));
 }
 assert.ok(reviewSecMethodology("AMZN").evidence.some(x=>x.missingReason?.includes("fulfilment")));
 assert.throws(()=>reviewSecMethodology("MSFT" as never),/not in SEC accounting/);
});
test("2J22 standalone recomputation over original filings and independent software holdout",()=>{
 const report=runSecIndependentCodePathValidation();
 assert.equal(report.reports.length,5);
 assert.equal(report.independentImplementations,2);
 assert.equal(report.heldOutSoftwareCompany,"NOW");
 assert.equal(report.independentHumanReviewerAttested,false);
 assert.equal(report.modelPromotionAllowed,false);
 for(const r of report.reports){
  assert.equal(r.accountSourceConsistency,true,r.subject+" original evidence drift");
  assert.equal(r.failed,0,r.subject+" failed second-path checks");
  assert.ok(r.checks.length>=3);
  assert.ok(r.checks.every(x=>x.pass&&x.originalUrl.includes("www.sec.gov/Archives/")));
  assert.equal(r.secondHumanReviewerSigned,false);
  assert.equal(r.safeForAutomaticScore,false);
 }
 const adbe=validateSecIssuerSecondPath("ADBE");
 assert.ok(adbe.checks.some(x=>x.field==="financeLease"&&x.expect==="0"));
 assert.ok(validateSecIssuerSecondPath("NOW").checks.some(x=>x.field==="restrictedOutsideEquivalents"&&x.actual==="6"));
 assert.ok(validateSecIssuerSecondPath("AMZN").checks.some(x=>x.field==="completeBorrowingNotCertified"&&x.actual==="incomplete"));
 assert.throws(()=>validateSecIssuerSecondPath("MSFT" as never),/No original SEC validation/);
});
const synthetic=(assetId:"ADBE"|"NOW"):MagicFormulaRawInput=>({
 assetId,industryId:null,industryCode:null,
 marketCap:1000,
 period:{periodEnd:"2025-11-28",knownAt:"2026-01-15T12:00:00Z",
  revision:1,isRestatement:false,
  values:{ebit:100,currentAssets:500,currentLiabilities:150,
   netFixedAssets:100,totalDebt:50,cashAndEquivalents:40}},
});
test("2J23 actual legacy calculator CAN be numerically eligible on synthetic data but SEC promotion remains forbidden",()=>{
 const legacy=compareLegacyMagicToSecDraft("ADBE",synthetic("ADBE"));
 assert.equal(legacy.legacyResult?.eligible,true);
 assert.equal(legacy.legacyScoringStatus,"legacy_arithmetic_eligible_but_sec_blocked");
 assert.equal(legacy.canPromoteSecToScoring,false);
 assert.equal(legacy.canWriteStatementMetrics,false);
 assert.equal(legacy.canGenerateUniverseRank,false);
 assert.equal(legacy.switchEnabled,false);
 assert.equal(legacy.databaseChanges,0);
 assert.ok(legacy.reasons.some(x=>x.includes("STMT_EBIT")));
 assert.ok(SEC_TO_LEGACY_CROSSWALK.some(x=>x.legacyMetric==="STMT_TOTAL_DEBT"));
 const batch=dryRunLegacyNoPromotion([
  {issuer:"ADBE",input:synthetic("ADBE")},
  {issuer:"NOW",input:synthetic("NOW")},
 ]);
 assert.equal(batch.legacyCanBeEligibleWithoutSecAttestation,true);
 assert.equal(batch.ranks.length,2);
 assert.ok(batch.ranks.every(x=>x.wouldHaveBeenRankedByLegacy));
 assert.ok(batch.ranks.every(x=>x.permittedForSecScoring===false));
 assert.equal(batch.secPromotionAllowed,false);
 assert.equal(batch.storedChanges,0);
});
test("legacy score not even instantiated from missing actual source-knownAt or market cap",()=>{
 const row=compareLegacyMagicToSecDraft("ADSK",null);
 assert.equal(row.legacyResult,null);
 assert.equal(row.legacyScoringStatus,"no_authorized_legacy_input");
 assert.equal(row.secDraftStatus,"not_submitted");
 assert.equal(row.canPromoteSecToScoring,false);
 assert.throws(()=>dryRunLegacyNoPromotion([
  {issuer:"ADBE",input:synthetic("ADBE")},
  {issuer:"ADBE",input:synthetic("ADBE")},
 ]),/Duplicate/);
 assert.throws(()=>dryRunLegacyNoPromotion([
  {issuer:"NOW",input:synthetic("ADBE")},
 ]),/mismatch/);
});
test("2J24 checklist truthfully distinguishes internal implementation from CI, browser acceptance and human review",()=>{
 const r=assessSecResearchRelease();
 assert.deepEqual(r.firstFourPhasePass,{
  phase2J21VersionedDraftAccountingPolicy:true,
  phase2J22SecondImplementationArithmetic:true,
  phase2J23LegacyReadOnlyBridge:true,
  phase2J24ReleaseChecklistReady:true,
 });
 assert.equal(r.CI.verified,false);
 assert.equal(r.productionAcceptance.verified,false);
 assert.equal(r.accountingReview.complete,false);
 assert.equal(r.accountingReview.humanAttested,false);
 assert.equal(r.outcome,"research_only_release_blocked");
 assert.equal(r.productionScoringActivated,false);
 assert.equal(r.ingestedStatementFactsModified,false);
 assert.equal(r.historicalModelChanged,false);
 assert.equal(r.databaseWrites,0);
 assert.ok(r.pending.some(x=>x.includes("browser")));
 assert.ok(r.pending.some(x=>x.includes("reviewer")));
});
test("false signoffs cannot be turned into production scoring via run-time flags or manufactured CI proof",()=>{
 const r=assessSecResearchRelease({
  gitCommit:"a".repeat(40),
  ciFrontendPassed:true,ciPythonPassed:true,ciContainerPassed:true,
  deployedCommitVerified:true,ownerBrowserRouteVerified:true,
  ownerApiAuthenticationVerified:true,ownerApiOriginalLedgerVerified:true,
  humanSourceReviewerAttested:true,
 });
 assert.equal(r.CI.verified,true);
 assert.equal(r.productionAcceptance.verified,true);
 assert.equal(r.accountingReview.complete,false);
 assert.equal(r.outcome,"research_only_release_blocked");
 assert.equal(r.productionScoringActivated,false);
 assert.equal(r.databaseWrites,0);
 assert.throws(()=>assessSecResearchRelease({gitCommit:"bad"}),/immutable SHA/);
});