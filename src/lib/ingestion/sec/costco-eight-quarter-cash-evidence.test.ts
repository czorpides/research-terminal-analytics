import test from "node:test";
import assert from "node:assert/strict";
import {getCostcoOriginalEightQuarterCash} from "./costco-eight-quarter-cash-evidence.ts";

test("original SEC 8 full fiscal quarter intervals plus opening FY2024 anchor",()=>{
 const q=getCostcoOriginalEightQuarterCash();
 assert.equal(q.completeQuarterIntervals,8);
 assert.equal(q.fullSeries.length,9);
 assert.deepEqual(q.fullSeries.map(x=>x.periodEnd),[
  "2024-09-01","2024-11-24","2025-02-16","2025-05-11","2025-08-31",
  "2025-11-23","2026-02-15","2026-05-10","2026-08-30",
 ]);
 assert.deepEqual(q.fullSeries.map(x=>x.reportedLiquidAssetsMillions),[
  "11144","11827","13158","14850","15284","17183","18240","19996","21301",
 ]);
 assert.deepEqual(q.fullSeries.map(x=>x.unsettledCardReceivablesMillions),[
  "2519","2789","2292","2587","2670","3095","2872","3078","2842",
 ]);
 assert.deepEqual(q.fullSeries.map(x=>x.postSettlementBookLiquidityMillions),[
  "8625","9038","10866","12263","12614","14088","15368","16918","18459",
 ]);
});
test("all original SEC citations and period boundaries retain evidence provenance",()=>{
 const q=getCostcoOriginalEightQuarterCash();
 assert.equal(q.fullSeries.filter(s=>s.sourceForm==="10-K").length,3);
 assert.equal(q.fullSeries.filter(s=>s.sourceForm==="10-Q").length,6);
 for(const x of q.fullSeries){
  assert.ok(x.sourceUrl.startsWith("https://www.sec.gov/Archives/edgar/data/909832/"));
  assert.equal(
   BigInt(x.reportedLiquidAssetsMillions)-BigInt(x.unsettledCardReceivablesMillions),
   BigInt(x.postSettlementBookLiquidityMillions));
  assert.equal(x.firstSeenAtExactSECInstant,null);
  assert.equal(x.independentlyReviewedSurplusMillions,null);
 }
});
test("two-year maximum ending liquid book amount is NOT unrestricted economic cash",()=>{
 const q=getCostcoOriginalEightQuarterCash();
 assert.deepEqual(q.bookResidualRangeMillions,{lowest:"8625",highest:"18459"});
 assert.deepEqual(q.cardSettlementRangeMillions,{lowest:"2292",highest:"3095"});
 assert.equal(q.sourceBoundary.operatingCashReserveApproved,false);
 assert.equal(q.sourceBoundary.filingAcceptanceTimestampsForHistoricalBacktestKnown,false);
 assert.equal(q.sourceBoundary.sameDayOperatingCashNeedMeasured,false);
 assert.equal(q.sourceBoundary.cashBalanceIsNotCashFlow,true);
 assert.equal(q.modelEligible,false);
 assert.equal(q.scoringEligible,false);
 assert.equal(q.storedChanges,0);
});
