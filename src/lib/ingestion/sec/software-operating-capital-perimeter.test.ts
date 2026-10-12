import test from "node:test";
import assert from "node:assert/strict";
import {
 assessThreeSoftwarePerimeters,evaluateSoftwareOperatingCapitalPerimeter,SEC_2J18_POLICY,
} from "./software-operating-capital-perimeter.ts";

test("all 3 original FY 10-Ks match the 2J17 original annual R&D cohort and all available note bridges",()=>{
 const r=assessThreeSoftwarePerimeters();
 assert.equal(r.version,SEC_2J18_POLICY);
 assert.equal(r.assessments.length,3);
 assert.equal(r.canCompareCapitalReturns,false);
 assert.equal(r.canScore,false);
 assert.equal(r.storedChanges,0);
 for(const issuer of r.assessments){
  assert.equal(issuer.source.fiscalEnd===({
   ADBE:"2025-11-28",ADSK:"2026-01-31",NOW:"2025-12-31",
  } as const)[issuer.issuer],true);
  assert.equal(issuer.source.rdAnnualSource,issuer.source.original10k);
  assert.equal(issuer.source.cutoff,"2026-10-09T20:00:00Z");
  assert.ok(issuer.checks.length===5);
  assert.ok(issuer.checks.filter(c=>c.result==="matched").length>=4);
  assert.ok(issuer.observed.every(v=>v.sourceUrl.startsWith("https://www.sec.gov/Archives/edgar/data/")));
 }
});
test("Adobe FY2025 contract acquisition costs and conditional contract assets cannot be added twice",()=>{
 const r=evaluateSoftwareOperatingCapitalPerimeter("ADBE");
 const v=(key:string)=>r.observed.find(f=>f.key===key)?.amountMillions;
 assert.equal(v("current_assets_reported"),"10163");
 assert.equal(v("net_ppe_reported"),"1873");
 assert.equal(v("goodwill"),"12857");
 assert.equal(v("acquired_intangibles_net"),"495");
 assert.equal(v("acquired_developed_technology_net"),"28");
 assert.equal(v("contract_acquisition_costs_total"),"721");
 assert.equal(v("contract_acquisition_current"),"257");
 assert.equal(v("contract_acquisition_noncurrent"),"464");
 assert.equal(v("contract_assets_total"),"241");
 assert.equal(r.report.contractCostCurrentNoncurrentReconciled,true);
 assert.match(r.observed.find(f=>f.key==="contract_assets_total")!.classification,/do not add/i);
 assert.equal(v("deferred_revenue_current"),"6905");
 assert.equal(v("deferred_revenue_noncurrent"),"125");
 assert.equal(v("operating_lease_rou"),"312");
 assert.equal(v("operating_lease_current_liability"),"77");
 assert.equal(v("operating_lease_noncurrent_liability"),"361");
 assert.equal(v("finance_lease_liability"),null);
 assert.equal(r.report.fiveYearHypotheticalRAndDAssetMillions,"11235.800000");
 assert.equal(r.report.fiveYearHypotheticalAdjustedOperatingIncomeMillions,"9973.600000");
 assert.equal(r.report.auditedBookAssetSubtotalNotAdditionalCapitalMillions,"14385");
});
test("Autodesk contract 913 is booked but current and long-term splits remain unknown",()=>{
 const r=evaluateSoftwareOperatingCapitalPerimeter("ADSK");
 const f=(name:string)=>r.observed.find(x=>x.key===name)!;
 assert.equal(f("current_assets_reported").amountMillions,"4942");
 assert.equal(f("current_assets_reported").disposition,"book_asset_already_in_balance_sheet");
 assert.equal(f("goodwill").amountMillions,"4295");
 assert.equal(f("acquired_intangibles_net").amountMillions,"467");
 assert.equal(f("acquired_developed_technology_net").amountMillions,"242");
 assert.equal(f("contract_acquisition_costs_total").amountMillions,"913");
 assert.equal(f("contract_acquisition_current").amountMillions,null);
 assert.equal(f("contract_acquisition_noncurrent").amountMillions,null);
 assert.equal(f("contract_assets_total").amountMillions,null);
 assert.equal(r.report.contractCostCurrentNoncurrentReconciled,null);
 assert.equal(r.checks.find(c=>c.name.includes("contract costs"))?.result,"cannot_check");
 assert.equal(f("deferred_revenue_current").amountMillions,"4406");
 assert.equal(f("deferred_revenue_noncurrent").amountMillions,"287");
 assert.equal(f("operating_lease_rou").amountMillions,"157");
 assert.equal(f("operating_lease_current_liability").amountMillions,"52");
 assert.equal(f("operating_lease_noncurrent_liability").amountMillions,"199");
 assert.equal(f("finance_lease_liability").amountMillions,null);
 assert.equal(r.report.fiveYearHypotheticalRAndDAssetMillions,"4365.400000");
 assert.equal(r.report.fiveYearHypotheticalAdjustedOperatingIncomeMillions,"1996.200000");
});
test("ServiceNow separately identified 590+1114 commissions and explicit no finance leases, without imputing to others",()=>{
 const r=evaluateSoftwareOperatingCapitalPerimeter("NOW");
 const f=(name:string)=>r.observed.find(x=>x.key===name)!;
 assert.equal(f("current_assets_reported").amountMillions,"10471");
 assert.equal(f("goodwill").amountMillions,"3578");
 assert.equal(f("acquired_intangibles_net").amountMillions,"1121");
 assert.equal(f("acquired_developed_technology_net").amountMillions,null);
 assert.equal(f("contract_acquisition_costs_total").amountMillions,"1704");
 assert.equal(f("contract_acquisition_current").amountMillions,"590");
 assert.equal(f("contract_acquisition_noncurrent").amountMillions,"1114");
 assert.equal(r.report.contractCostCurrentNoncurrentReconciled,true);
 assert.equal(f("operating_lease_rou").amountMillions,"806");
 assert.equal(f("operating_lease_current_liability").amountMillions,"112");
 assert.equal(f("operating_lease_noncurrent_liability").amountMillions,"800");
 assert.equal(f("deferred_revenue_current").amountMillions,"8314");
 assert.equal(f("deferred_revenue_noncurrent").amountMillions,"120");
 assert.equal(f("finance_lease_liability").amountMillions,"0");
 assert.equal(f("finance_lease_liability").disposition,"reported_absent");
 assert.equal(r.report.separateFinanceLeaseQuantified,true);
 assert.equal(r.report.fiveYearHypotheticalRAndDAssetMillions,"7255.400000");
 assert.equal(r.report.fiveYearHypotheticalAdjustedOperatingIncomeMillions,"3012.800000");
 assert.equal(r.report.auditedBookAssetSubtotalNotAdditionalCapitalMillions,"7209");
});
test("original note totals must reconcile with no independent double-counted economic denominator",()=>{
 for(const sym of ["ADBE","ADSK","NOW"] as const){
  const q=evaluateSoftwareOperatingCapitalPerimeter(sym);
  const v=(key:string)=>q.observed.find(x=>x.key===key)?.amountMillions;
  assert.equal(
   BigInt(v("deferred_revenue_current")!)+BigInt(v("deferred_revenue_noncurrent")!),
   ({ADBE:7030n,ADSK:4693n,NOW:8434n} as const)[sym]);
  assert.equal(
   BigInt(v("operating_lease_current_liability")!)+BigInt(v("operating_lease_noncurrent_liability")!),
   ({ADBE:438n,ADSK:251n,NOW:912n} as const)[sym]);
  assert.equal(q.gates.operatingEconomicCapitalUsd,null);
  assert.equal(q.gates.returnOnCapitalBps,null);
  assert.equal(q.gates.acquiredIntangibleOverlapReviewed,false);
  assert.equal(q.gates.contractAssetsFullyAllocated,false);
  assert.equal(q.gates.cashDistributabilityReviewed,false);
  assert.equal(q.gates.independentHumanReviewerSigned,false);
  assert.equal(q.gates.validMagicFormulaRank,false);
  assert.equal(q.gates.modelEligible,false);
  assert.equal(q.gates.scoringEligible,false);
  assert.equal(q.gates.storedChanges,0);
 }
});
test("unknown issuer rejected and no false audited ROIC or provenance approval",()=>{
 assert.throws(()=>evaluateSoftwareOperatingCapitalPerimeter("MSFT" as never),/Unrecognised/);
});
