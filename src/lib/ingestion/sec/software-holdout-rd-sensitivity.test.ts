import test from "node:test";
import assert from "node:assert/strict";
import {getSoftwareSourceHoldout,getRDPolicyStress,SEC_2J16_VERSION} from "./software-holdout-rd-sensitivity.ts";

test("Autodesk is independent original SEC issuer with FY 2026 + 6m 2026 comparative bridge",()=>{
 const x=getSoftwareSourceHoldout("ADSK");
 assert.equal(x.interimEnd,"2026-07-31");
 assert.equal(x.fiscalEnd,"2026-01-31");
 assert.equal(x.knownAsOf,"2026-10-09T20:00:00Z");
 assert.equal(x.ttm.revenueMillions,"7790");
 assert.equal(x.ttm.operatingIncomeMillions,"2041");
 assert.equal(x.ttm.rndMillions,"1721");
 assert.equal(x.ttm.operatingCashFlowMillions,"2896");
 assert.equal(x.ttm.sbcAddbackMillions,"706");
 assert.equal(x.ttm.cashFlowLessSbcMillions,"2190");
 assert.equal(x.ttm.operatingMarginBps,"2620");
 assert.equal(x.ttm.rAndDIntensityBps,"2209");
 assert.equal(x.ttm.operatingCashFlowToOperatingIncomeBps,"14189");
 assert.equal(x.sourceChecks.length,5);
 assert.ok(x.sourceChecks.every(c=>c.passed));
 assert.ok(x.fySourceUrl.includes("769397"));
 assert.ok(x.interimSourceUrl.includes("000076939726000061"));
 assert.equal(x.capitalReturnEligible,false);
});
test("Autodesk latest Q2 FY2027 debt/lease classes are NOT blended with EPS denominators",()=>{
 const x=getSoftwareSourceHoldout("ADSK");
 assert.equal(x.latestBalance.currentAssetsMillions,"5670");
 assert.equal(x.latestBalance.currentLiabilitiesMillions,"6628");
 assert.equal(x.latestBalance.deferredRevenueCurrentMillions,"4036");
 assert.equal(x.latestBalance.notesAndOtherDebtCarryingMillions,"3478");
 assert.equal(x.latestBalance.operatingLeaseTotalMillions,"227");
 assert.equal(x.latestBalance.cashAndShortInvestmentsMillions,"4155");
 assert.equal(x.independentSecondHumanReview,false);
});
test("Adobe is the original software comparator, not a 2J16 held-out SEC issuer valuation score",()=>{
 const x=getSoftwareSourceHoldout("ADBE");
 assert.equal(x.ttm.revenueMillions,"25970");
 assert.equal(x.ttm.operatingIncomeMillions,"9271");
 assert.equal(x.ttm.rndMillions,"4694");
 assert.equal(x.ttm.operatingCashFlowMillions,"10806");
 assert.equal(x.ttm.sbcAddbackMillions,"2071");
 assert.equal(x.ttm.operatingMarginBps,"3570");
 assert.equal(x.ttm.rAndDIntensityBps,"1807");
 assert.equal(x.latestBalance.notesAndOtherDebtCarryingMillions,"6363");
 assert.equal(x.sourceChecks.length,5);
 assert.equal(x.capitalReturnEligible,false);
});
test("two-year end-of-FY research asset stress uses NONOVERLAPPING FY cohorts only",()=>{
 const a=getRDPolicyStress("ADBE");
 const b=getRDPolicyStress("ADSK");
 assert.equal(a.policyVersion,SEC_2J16_VERSION);
 assert.equal(a.methods[0].years,2);
 assert.equal(a.methods[0].conditionalUnamortisedAssetMillions,"6266.000000");
 assert.equal(b.methods[0].conditionalUnamortisedAssetMillions,"2385.500000");
 assert.deepEqual(a.methods[0].cohortSchedule.map(x=>x.year),[2024,2025]);
 assert.deepEqual(b.methods[0].cohortSchedule.map(x=>x.year),[2025,2026]);
 for(const r of [a,b])assert.equal(r.ttmBasisNonoverlappingWithAnnualCohorts,false);
});
test("three-year research capital sensitivity accounts for three disclosed full financial years",()=>{
 const a=getRDPolicyStress("ADBE");
 const b=getRDPolicyStress("ADSK");
 assert.equal(a.methods[1].conditionalUnamortisedAssetMillions,"8081.000000");
 assert.equal(b.methods[1].conditionalUnamortisedAssetMillions,"3090.666667");
 assert.deepEqual(a.methods[1].cohortSchedule.map(x=>x.year),[2023,2024,2025]);
 assert.deepEqual(b.methods[1].cohortSchedule.map(x=>x.year),[2024,2025,2026]);
 for(const y of [a.methods[1],b.methods[1]]){
  assert.equal(y.status,"mechanical_stock_only");
  assert.equal(y.adjustedOperatingIncomeMillions,null);
  assert.equal(y.adjustedROCBps,null);
  assert.equal(y.ignoredPriorYearIncomeAmortisation,true);
 }
});
test("five-year research capital asset does not silently zero-fill two missing FY R&D cohorts",()=>{
 for(const symbol of ["ADBE","ADSK"] as const){
  const m=getRDPolicyStress(symbol).methods[2];
  assert.equal(m.years,5);
  assert.equal(m.status,"missing_historical_cohorts");
  assert.equal(m.conditionalUnamortisedAssetMillions,null);
  assert.equal(m.totalReportedRDMillions,null);
  assert.equal(m.adjustedOperatingIncomeMillions,null);
  assert.equal(m.adjustedROCBps,null);
  assert.equal(m.rankingEligible,false);
 }
});
test("zero live scoring and model permissions for both software historical R&D sensitivities",()=>{
 for(const symbol of ["ADBE","ADSK"] as const){
  const e=getRDPolicyStress(symbol);
  assert.equal(e.softwareROCCertified,false);
  assert.equal(e.storedChanges,0);
  assert.equal(getSoftwareSourceHoldout(symbol).capitalReturnEligible,false);
  for(const y of e.methods){
   assert.equal(y.rankingEligible,false);
   assert.equal(y.comparableToReportedGAAP,false);
  }
 }
});
