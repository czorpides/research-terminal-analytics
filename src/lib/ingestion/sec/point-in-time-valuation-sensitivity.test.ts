import test from "node:test";
import assert from "node:assert/strict";
import {getSecValuationScenarios,SEC_2J13_SNAPSHOTS} from "./point-in-time-valuation-sensitivity.ts";

test("COST dated price × SEC disclosed Sept shares is an APPROXIMATE cap, not a scored equity value",()=>{
 const x=getSecValuationScenarios("COST");
 assert.equal(x.estimatedMarketCapitalizationUsd,"419608043155");
 assert.equal(x.priceAt,"2026-10-09T20:00:00Z");
 assert.equal(x.sharesAsOf,"2026-09-29");
 assert.equal(x.sourceChecksPass,true);
 assert.equal(x.pointInTimeMarketCapExact,false);
 assert.equal(x.modelEligible,false);
 assert.equal(x.scoringEligible,false);
 assert.equal(x.storedChanges,0);
});
test("Costco NWC + finance lease ROU accounting produces three explicitly conditional capital ratios",()=>{
 const x=getSecValuationScenarios("COST");
 assert.deepEqual(x.cases.map(c=>c.operatingCapitalMillions),["42210","22003","20909"]);
 assert.deepEqual(x.cases.map(c=>c.returnOnCapitalBps),["2768","5311","5589"]);
 assert.deepEqual(x.cases.map(c=>c.conditionalEarningsYieldBps),["274","287","288"]);
 assert.deepEqual(x.cases.map(c=>c.conditionalEnterpriseValueUsd),[
  "427183043155","406976043155","405882043155",
 ]);
 assert.equal(x.financeLeaseSourceMillions,"1413");
 assert.equal(x.assumedMissingFinanceLeaseValuesZeroForScenarios,false);
 assert.ok(x.limitations.some(t=>t.includes("noncontrolling")));
});
test("Adobe uses Q3 2026 10-Q cover SHARE count, not FY2025 weighted-average diluted shares",()=>{
 const x=getSecValuationScenarios("ADBE");
 assert.equal(x.estimatedMarketCapitalizationUsd,"94291484000");
 assert.equal(x.shares,"389200000");
 assert.equal(x.sharesAsOf,"2026-09-18");
 assert.equal(x.sharesFiled,"2026-09-22");
 assert.equal(SEC_2J13_SNAPSHOTS.ADBE.sharesRounding,"rounded_100k");
 assert.equal(x.earningsMillions,"8706");
 assert.equal(x.originalFiscalEnd,"2025-11-28");
});
test("Adobe asset-light capital policy flips sign with cash treatment; do not rank nonpositive ROC",()=>{
 const x=getSecValuationScenarios("ADBE");
 assert.deepEqual(x.cases.map(c=>c.operatingCapitalMillions),["1913","-3518","-4682"]);
 assert.deepEqual(x.cases.map(c=>c.returnOnCapitalBps),["45510",null,null]);
 assert.deepEqual(x.cases.map(c=>c.conditionalEarningsYieldBps),["866","916","927"]);
 assert.equal(x.financeLeaseSourceMillions,null);
 assert.equal(x.assumedMissingFinanceLeaseValuesZeroForScenarios,true);
 for(const y of x.cases)assert.equal(y.eligible,false);
 assert.ok(x.limitations.some(t=>t.includes("ZERO")));
 assert.equal(x.financialCapitalPolicyApproved,false);
});
test("scenarios refer to source-reconciled original and have no live scoring or model write",()=>{
 for(const symbol of ["COST","ADBE"] as const){
  const x=getSecValuationScenarios(symbol);
  assert.equal(x.sourceChecksPass,true);
  assert.equal(x.cases.length,3);
  assert.equal(x.modelEligible,false);
  assert.equal(x.scoringEligible,false);
  assert.equal(x.storedChanges,0);
  assert.equal(x.pointInTimeMarketCapExact,false);
  assert.ok(x.limitations.some(t=>t.includes("price")));
 }
});
