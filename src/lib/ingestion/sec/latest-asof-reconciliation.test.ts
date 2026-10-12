import test from "node:test";
import assert from "node:assert/strict";
import {getSec2J14Reconciliation,SEC_2J14_POLICY} from "./latest-asof-reconciliation.ts";

test("Adobe uses latest publicly available nine months, not stale FY2025 numerator",()=>{
 const r=getSec2J14Reconciliation("ADBE");
 assert.equal(r.policyVersion,SEC_2J14_POLICY);
 assert.equal(r.financialSource.form,"10-Q");
 assert.equal(r.financialSource.accession,"0000796343-26-000156");
 assert.equal(r.financialSource.filedDate,"2026-09-22");
 assert.equal(r.earnings.basis,"fy_plus_current_9m_less_prior_9m");
 assert.equal(r.earnings.annualFyOperatingIncomeMillions,"8706");
 assert.equal(r.earnings.current9MonthsOperatingIncomeMillions,"7010");
 assert.equal(r.earnings.prior9MonthsOperatingIncomeMillions,"6445");
 assert.equal(r.earnings.trailing12MonthsOperatingIncomeMillions,"9271");
 assert.equal(r.earnings.reportedSourceArithmeticPass,true);
 assert.equal(r.market.notExactMarketCap,true);
 assert.equal(r.controls.modelEligible,false);
});
test("Adobe quarter 2026 debt bridge includes commercial paper once and current notes face adjustment",()=>{
 const r=getSec2J14Reconciliation("ADBE");
 assert.equal(r.latestBalance.carryingBorrowingsExLeasesMillions,"6363");
 assert.equal(r.latestBalance.cashMillions,"4359");
 assert.equal(r.latestBalance.shortInvestmentsMillions,"1280");
 assert.equal(r.latestBalance.cashAndInvestmentsMillions,"5639");
 assert.equal(r.latestBalance.operatingLeaseCurrentMillions,"89");
 assert.equal(r.latestBalance.operatingLeaseNoncurrentMillions,"310");
 assert.equal(r.latestBalance.financeLeaseLiabilitiesMillions,null);
 assert.equal(r.latestBalance.deferredRevenueCurrentMillions,"7094");
 assert.equal(r.financingBridges.length,10);
 assert.ok(r.financingBridges.every(b=>b.pass));
 const current=r.financingBridges.find(x=>x.name.includes("commercial paper"));
 assert.deepEqual(current?.components,["1349","248"]);
 assert.equal(current?.reportedMillions,"1597");
 const debt=r.financingBridges.find(x=>x.name.includes("current and noncurrent debt"));
 assert.equal(debt?.calculatedMillions,"6363");
});
test("Adobe conditional latest-TTM earnings yields reflect updated debt and liquidity but ROC is ineligible",()=>{
 const r=getSec2J14Reconciliation("ADBE");
 assert.deepEqual(r.scenarios.map(x=>x.evProxyUsd),[
  "100654484000","96295484000","95015484000",
 ]);
 assert.deepEqual(r.scenarios.map(x=>x.operatingEarningsYieldBps),["921","963","976"]);
 assert.deepEqual(r.scenarios.map(x=>x.investmentReturnOnCapitalBps),[null,null,null]);
 assert.equal(r.capitalPolicyStatus,"software_negative_working_capital_no_generic_roc");
 assert.equal(r.softwareTangibleCapitalDiagnostic?.cashRetainedMillions,"826");
 assert.equal(r.softwareTangibleCapitalDiagnostic?.cashExcludedMillions,"-3533");
 assert.equal(r.softwareTangibleCapitalDiagnostic?.cashAndInvestmentsExcludedMillions,"-4813");
 assert.equal(r.softwareTangibleCapitalDiagnostic?.classifiedAsApprovedCapital,false);
 assert.equal(r.controls.softwareCapitalPolicyApproved,false);
 assert.ok(r.unresolved.some(s=>s.includes("ZERO")||s.includes("zero")||s.includes("hypothetical")));
});
test("Costco FY2026 filed October 7 is its latest known original report on the Oct 9 valuation cut-off",()=>{
 const r=getSec2J14Reconciliation("COST");
 assert.equal(r.financialSource.accession,"0000909832-26-000093");
 assert.equal(r.financialSource.filedDate,"2026-10-07");
 assert.equal(r.financialSource.periodEnd,"2026-08-30");
 assert.equal(r.softwareTangibleCapitalDiagnostic,null);
 assert.equal(r.earnings.basis,"reported_fy_latest_asof");
 assert.equal(r.earnings.current9MonthsOperatingIncomeMillions,null);
 assert.equal(r.earnings.trailing12MonthsOperatingIncomeMillions,"11685");
 assert.equal(r.financingBridges.length,4);
 assert.ok(r.financingBridges.every(x=>x.pass));
});
test("Costco card receivables bound maximum potentially distributable liquid assets",()=>{
 const r=getSec2J14Reconciliation("COST");
 assert.equal(r.latestBalance.cashMillions,"20207");
 assert.equal(r.latestBalance.shortInvestmentsMillions,"1094");
 assert.equal(r.latestBalance.cashAndInvestmentsMillions,"21301");
 assert.equal(r.latestBalance.cashDeductionCeilingMillions,"18459");
 assert.equal(r.scenarios.length,2);
 assert.deepEqual(r.scenarios.map(x=>x.provisionalDeductionMillions),["0","18459"]);
 assert.deepEqual(r.scenarios.map(x=>x.evProxyUsd),[
  "427183043155","408724043155",
 ]);
 assert.deepEqual(r.scenarios.map(x=>x.operatingEarningsYieldBps),["274","286"]);
 assert.equal(r.latestBalance.financeLeaseLiabilitiesMillions,"1413");
 assert.ok(r.unresolved.some(x=>x.includes("2,842")));
 for(const s of r.scenarios){
  assert.ok(BigInt(s.provisionalDeductionMillions)<=18459n);
  assert.equal(s.verifiedEV,false);
  assert.equal(s.eligibleForRanking,false);
 }
});
test("no company can score, persist or certify free cash, shares or full capital policy",()=>{
 for(const symbol of ["COST","ADBE"] as const){
  const r=getSec2J14Reconciliation(symbol);
  assert.equal(r.priceDate,"2026-10-09T20:00:00Z");
  assert.equal(r.controls.asOfDateChecked,true);
  assert.equal(r.controls.nonOperatingCashReviewed,false);
  assert.equal(r.controls.nciAndAllFinancingClaimsReviewed,false);
  assert.equal(r.controls.independentlyVerifiedMarketCapitalization,false);
  assert.equal(r.controls.allScenariosConditional,true);
  assert.equal(r.controls.modelEligible,false);
  assert.equal(r.controls.scoringEligible,false);
  assert.equal(r.controls.storedChanges,0);
  assert.ok(r.unresolved.length>=4);
 }
});
