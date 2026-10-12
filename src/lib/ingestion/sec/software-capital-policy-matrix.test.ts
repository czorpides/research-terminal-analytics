import test from "node:test";
import assert from "node:assert/strict";
import {
 buildSoftwareCapitalMatrix,calculateSoftwareCapitalScenario,
 DEFAULT_2J19_POLICY,SOFTWARE_POLICY_MATRIX,SEC_2J19_POLICY,
 type SoftwareCapitalPolicy,
} from "./software-capital-policy-matrix.ts";

const select=(changes:Partial<SoftwareCapitalPolicy>={}):SoftwareCapitalPolicy=>({
 ...DEFAULT_2J19_POLICY,...changes,
});
test("complete independent 3x2x3x2x2 policy grid, no model data consumption",()=>{
 const matrix=buildSoftwareCapitalMatrix();
 assert.equal(matrix.version,SEC_2J19_POLICY);
 assert.equal(SOFTWARE_POLICY_MATRIX.length,24);
 assert.equal(matrix.totalCases,72);
 assert.deepEqual(matrix.companies.map(x=>x.issuer),["ADBE","ADSK","NOW"]);
 assert.ok(matrix.companies.every(x=>x.cases.length===24));
 assert.equal(new Set(SOFTWARE_POLICY_MATRIX.map(x=>JSON.stringify(x))).size,24);
 assert.equal(matrix.eligibleForMagicFormula,false);
 assert.equal(matrix.eligibleForRadar,false);
 assert.equal(matrix.comparableReturnOnCapitalAvailable,false);
 assert.equal(matrix.writes,0);
 for(const co of matrix.companies)for(const s of co.cases){
  assert.equal(s.rankable,false);
  assert.equal(s.modelEligible,false);
  assert.equal(s.scoringEligible,false);
  assert.equal(s.writes,0);
  assert.equal(s.investableCapitalMillions,null);
  assert.equal(s.economicallyComparableROCBps,null);
  assert.equal(s.enterpriseValueUsd,null);
  assert.equal(s.evidence.originalAvailableCrossFootsMatched,true);
  assert.equal(s.evidence.originalAcquiredTechnologyIsSubset,true);
  assert.equal(s.evidence.actualDeferredRevenueCostToServeReviewed,false);
  assert.equal(s.evidence.independentHumanSecondReview,false);
  assert.equal(s.evidence.pointInTimeCurrentCapital,false);
  assert.ok(s.original10K.startsWith("https://www.sec.gov/Archives/edgar/data/"));
 }
});
test("baseline is explicitly INCOMPLETE CA - CL + PPE, plus current operating lease exclusion and known noncurrent contract assets",()=>{
 const a=calculateSoftwareCapitalScenario("ADBE",select());
 const d=calculateSoftwareCapitalScenario("ADSK",select());
 const n=calculateSoftwareCapitalScenario("NOW",select());
 assert.equal(a.rawCurrentAssetsLessLiabilitiesPlusPpeMillions,"1836.000000");
 assert.equal(d.rawCurrentAssetsLessLiabilitiesPlusPpeMillions,"-745.000000");
 assert.equal(n.rawCurrentAssetsLessLiabilitiesPlusPpeMillions,"2317.000000");
 assert.equal(a.observedCurrentOperatingLeaseLiabilityAdjustmentMillions,"77.000000");
 assert.equal(d.observedCurrentOperatingLeaseLiabilityAdjustmentMillions,"52.000000");
 assert.equal(n.observedCurrentOperatingLeaseLiabilityAdjustmentMillions,"112.000000");
 assert.equal(a.noncurrentContractCostIncludedOnceMillions,"464.000000");
 assert.equal(d.noncurrentContractCostIncludedOnceMillions,null);
 assert.equal(n.noncurrentContractCostIncludedOnceMillions,"1114.000000");
 assert.equal(a.conditionalBookBridgeMillions,"2377.000000");
 assert.equal(d.conditionalBookBridgeMillions,null);
 assert.equal(n.conditionalBookBridgeMillions,"3543.000000");
 assert.equal(a.compatibleIllustrativeAnnualOperatingIncomeMillions,"8706.000000");
 assert.equal(n.compatibleIllustrativeAnnualOperatingIncomeMillions,"1824.000000");
 assert.equal(d.evidence.originalContractLongTermSplitVerified,false);
 assert.ok(d.missingRequiredBookComponents.some(x=>x.includes("commission")));
});
test("acquired technology subset never added twice and acquisition inclusive treatment is a source-verified delta only",()=>{
 const names=[
  ["ADBE","13352.000000","15729.000000"],
  ["ADSK","4762.000000",null],
  ["NOW","4699.000000","8242.000000"],
 ] as const;
 for(const [company,delta,full] of names){
  const s=calculateSoftwareCapitalScenario(company,select({acquisitions:"acquisition_inclusive"}));
  assert.equal(s.additivePolicyDeltas.acquisitionsMillions,delta);
  assert.equal(s.conditionalBookBridgeMillions,full);
  assert.equal(s.evidence.fullIntangiblesAndAcquisitionCapitalReviewed,false);
  assert.ok(s.blockers.some(x=>x.includes("technology")));
 }
});
test("deferred revenue full, half, no face has exact transparent reclassification without touching noncurrent deferred revenue",()=>{
 const full=calculateSoftwareCapitalScenario("ADBE",select());
 const half=calculateSoftwareCapitalScenario("ADBE",select({deferredRevenue:"half_face"}));
 const none=calculateSoftwareCapitalScenario("ADBE",select({deferredRevenue:"excluded_from_nwc"}));
 assert.deepEqual([full,half,none].map(x=>x.deferredRevenueRetainedInNwcMillions),
  ["6905.000000","3452.500000","0.000000"]);
 assert.deepEqual([full,half,none].map(x=>x.additivePolicyDeltas.deferredRevenueReclassificationMillions),
  ["0.000000","3452.500000","6905.000000"]);
 assert.deepEqual([full,half,none].map(x=>x.conditionalBookBridgeMillions),
  ["2377.000000","5829.500000","9282.000000"]);
 const nowHalf=calculateSoftwareCapitalScenario("NOW",select({deferredRevenue:"half_face"}));
 assert.equal(nowHalf.additivePolicyDeltas.deferredRevenueReclassificationMillions,"4157.000000");
 assert.equal(nowHalf.conditionalBookBridgeMillions,"7700.000000");
 assert.equal(nowHalf.evidence.actualDeferredRevenueCostToServeReviewed,false);
});
test("lease-capitalized model adds ROU to incomplete capital AND funding claim, but correctly blocks unchanged-rent EBIT",()=>{
 const issuers=[
  ["ADBE","312.000000","438.000000"],
  ["ADSK","157.000000","251.000000"],
  ["NOW","806.000000","912.000000"],
 ] as const;
 for(const [issuer,rou,claims] of issuers){
  const capital=calculateSoftwareCapitalScenario(issuer,select({operatingLeases:"capitalized_lease"}));
  const rent=calculateSoftwareCapitalScenario(issuer,select());
  assert.equal(capital.additivePolicyDeltas.leaseRouCapitalMillions,rou);
  assert.equal(capital.operatingLeaseFinancingClaimInIllustrativeEVMillions,claims);
  assert.equal(rent.operatingLeaseFinancingClaimInIllustrativeEVMillions,"0.000000");
  assert.equal(capital.compatibleIllustrativeAnnualOperatingIncomeMillions,null);
  assert.equal(capital.compatibleIllustrativeAnnualOperatingMarginBps,null);
  assert.equal(capital.evidence.operatingLeaseEarningsAndFinancingSymmetrical,false);
  assert.equal(rent.evidence.operatingLeaseEarningsAndFinancingSymmetrical,true);
 }
 const adbe=calculateSoftwareCapitalScenario("ADBE",select({operatingLeases:"capitalized_lease"}));
 assert.equal(adbe.conditionalBookBridgeMillions,"2689.000000");
});
test("five-year hypothetical research balance adds ONCE to the narrow subtotal but no approved adjusted ROC",()=>{
 const testcases=[
  ["ADBE","11235.800000","13612.800000","9973.600000"],
  ["ADSK","4365.400000",null,"1996.200000"],
  ["NOW","7255.400000","10798.400000","3012.800000"],
 ] as const;
 for(const [issuer,delta,capital,earnings] of testcases){
  const s=calculateSoftwareCapitalScenario(issuer,select({research:"hypothetical_five_year"}));
  assert.equal(s.additivePolicyDeltas.hypotheticalResearchAssetMillions,delta);
  assert.equal(s.conditionalBookBridgeMillions,capital);
  assert.equal(s.compatibleIllustrativeAnnualOperatingIncomeMillions,earnings);
  assert.equal(s.economicallyComparableROCBps,null);
  assert.ok(s.blockers.some(x=>x.includes("internal")||x.includes("development")));
 }
});
test("fully stacked stress shows sensitivity, not a magically approved outcome",()=>{
 const c=calculateSoftwareCapitalScenario("ADBE",{
  acquisitions:"acquisition_inclusive",deferredRevenue:"excluded_from_nwc",
  operatingLeases:"capitalized_lease",research:"hypothetical_five_year",
 });
 assert.equal(c.additivePolicyDeltas.knownPolicyDeltaMillions,"31804.800000");
 assert.equal(c.conditionalBookBridgeMillions,"34181.800000");
 assert.equal(c.compatibleIllustrativeAnnualOperatingIncomeMillions,null);
 assert.equal(c.economicallyComparableROCBps,null);
 assert.equal(c.enterpriseValueUsd,null);
 assert.equal(c.rankable,false);
});
test("unrecognised policy or issuer is fail-closed, no default substitution",()=>{
 assert.throws(()=>calculateSoftwareCapitalScenario("MSFT" as never,select()),/Unrecognised/);
 assert.throws(()=>calculateSoftwareCapitalScenario("ADBE",select({deferredRevenue:"free" as never})),/Unapproved/);
 assert.throws(()=>calculateSoftwareCapitalScenario("NOW",select({operatingLeases:"both" as never})),/Unapproved/);
});
