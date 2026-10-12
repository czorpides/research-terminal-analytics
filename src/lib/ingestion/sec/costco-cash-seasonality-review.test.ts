import test from "node:test";
import assert from "node:assert/strict";
import {getCostcoSeasonalLiquidityReview,COST_2J16_CASH_POLICY} from "./costco-cash-seasonality-review.ts";

test("three first-party SEC observations keep separately stated card settlements out of surplus",()=>{
 const q=getCostcoSeasonalLiquidityReview();
 assert.equal(q.policyVersion,COST_2J16_CASH_POLICY);
 assert.deepEqual(q.observedQuarters.map(x=>x.observedAt),["2025-08-31","2026-05-10","2026-08-30"]);
 assert.deepEqual(q.observedQuarters.map(x=>x.liquidBookAssetsMillions),["15284","19996","21301"]);
 assert.deepEqual(q.observedQuarters.map(x=>x.cardSettlementFundsMillions),["2670","3078","2842"]);
 assert.deepEqual(q.observedQuarters.map(x=>x.residualBookLiquidityMillions),["12614","16918","18459"]);
 assert.equal(q.roughVisibleResidualMinMillions,"12614");
 assert.equal(q.roughVisibleResidualMaxMillions,"18459");
 assert.equal(q.observedQuarters[1].publicSourceDate,"2026-06-03");
 for(const x of q.observedQuarters){
  assert.ok(x.sourceUrl.includes("www.sec.gov/Archives/edgar/data/909832/"));
  assert.equal(x.otherWorkingCapitalReserveMeasured,false);
 }
});
test("finance leases separate and historic CFO is not booked surplus cash",()=>{
 const q=getCostcoSeasonalLiquidityReview();
 assert.equal(q.latestNonleaseBorrowingMillions,"6162");
 assert.equal(q.latestFinanceLeaseMillions,"1413");
 assert.equal(q.latestOperatingLeaseMillions,"2606");
 assert.equal(q.possibleAnnualCashFlowEvidence.fiscal2024CfoMillions,"11339");
 assert.equal(q.possibleAnnualCashFlowEvidence.fiscal2025CfoMillions,"13335");
 assert.equal(q.possibleAnnualCashFlowEvidence.fiscal2026CfoMillions,"15817");
 assert.equal(q.possibleAnnualCashFlowEvidence.cfoIsNotAvailableSurplusCash,true);
 assert.ok(q.unresolved.some(x=>x.includes("3 irregular period-end snapshots")));
});
test("min observed liquidity is not policy-approved operating cash buffer",()=>{
 const q=getCostcoSeasonalLiquidityReview();
 assert.equal(q.allowedForEV,false);
 assert.equal(q.allowedForOperatingCapital,false);
 assert.equal(q.modelEligible,false);
 assert.equal(q.scoringEligible,false);
 assert.equal(q.storedChanges,0);
});
