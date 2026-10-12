import test from "node:test";
import assert from "node:assert/strict";
import {evaluateSecEconomicCapitalDraft,SEC_2J15_POLICY} from "./economic-capital-comparability-draft.ts";

test("Costco reported liquid book assets less operational card settlement is only an upper cash scenario",()=>{
 const r=evaluateSecEconomicCapitalDraft("COST");
 assert.equal(r.policyVersion,SEC_2J15_POLICY);
 assert.equal(r.asOf,"2026-10-09T20:00:00Z");
 assert.equal(r.liquidity.observedLiquidAssetsMillions,"21301");
 assert.equal(r.liquidity.observedSettlementReceivablesMillions,"2842");
 assert.equal(r.liquidity.observedProtectedFundsBasis,"unsettled_card_receivables");
 assert.equal(r.liquidity.unprotectedBookLiquidityCeilingMillions,"18459");
 assert.equal(r.liquidity.reviewedSurplusCashMillions,null);
 assert.equal(r.liquidity.economicallyRequiredOperatingCashMillions,null);
 assert.deepEqual(r.liquidity.scenarios.map(x=>x.hypotheticalDeductionMillions),["0","9229","18459"]);
 assert.deepEqual(r.liquidity.scenarios.map(x=>x.conditionalEVUsd),["427183043155","417954043155","408724043155"]);
 assert.deepEqual(r.liquidity.scenarios.map(x=>x.conditionalOperatingEarningsYieldBps),["274","280","286"]);
 for(const row of r.liquidity.scenarios){
  assert.ok(BigInt(row.hypotheticalDeductionMillions)<=18459n);
  assert.equal(row.approved,false);
  assert.ok(BigInt(row.residualOperationalBookLiquidityMillions)>=2842n);
 }
 assert.equal(r.governance.reviewedOperatingCashBuffer,false);
});
test("Costco finance and operating lease claims are distinct, CP and NCI not guessed",()=>{
 const r=evaluateSecEconomicCapitalDraft("COST");
 const ledger=r.financing.ledger;
 assert.equal(r.financing.nonleaseBorrowingCarryingMillions,"6162");
 assert.equal(r.financing.financeLeaseAddedMillions,"1413");
 assert.equal(r.financing.operatingLeaseExcludedMillions,"2606");
 assert.equal(r.financing.economicEVApproved,false);
 assert.equal(ledger.find(x=>x.category==="borrowing")?.includedInIllustrativeEV,true);
 assert.equal(ledger.find(x=>x.category==="finance_lease")?.includedInIllustrativeEV,true);
 assert.equal(ledger.find(x=>x.category==="operating_lease")?.status,"policy_excluded");
 assert.equal(ledger.find(x=>x.category==="commercial_paper")?.status,"unresolved");
 assert.equal(ledger.find(x=>x.category==="commercial_paper")?.observedMillions,null);
 assert.equal(ledger.find(x=>x.category==="noncontrolling_interest")?.status,"unresolved");
 assert.equal(ledger.find(x=>x.category==="noncontrolling_interest")?.observedMillions,null);
 assert.equal(ledger.find(x=>x.category==="preferred")?.observedMillions,"0");
 assert.equal(r.software,null);
});
test("Adobe debt claim ledger explicitly prevents double count of included commercial paper",()=>{
 const r=evaluateSecEconomicCapitalDraft("ADBE");
 const ledger=r.financing.ledger;
 assert.equal(r.financing.nonleaseBorrowingCarryingMillions,"6363");
 assert.equal(r.financing.commercialPaperAlreadyInDebtMillions,"248");
 assert.equal(ledger.find(x=>x.category==="commercial_paper")?.status,"embedded_do_not_add");
 assert.equal(ledger.find(x=>x.category==="commercial_paper")?.includedInIllustrativeEV,false);
 assert.equal(ledger.find(x=>x.category==="finance_lease")?.status,"unresolved");
 assert.equal(ledger.find(x=>x.category==="finance_lease")?.observedMillions,null);
 assert.equal(r.financing.financeLeaseAddedMillions,null);
 assert.equal(ledger.find(x=>x.category==="operating_lease")?.observedMillions,"399");
 assert.equal(r.financing.unquantifiedFinancingClaims,true);
});
test("Adobe operating-liquidity reserve NOT observed and stress figures are NOT certified EV",()=>{
 const r=evaluateSecEconomicCapitalDraft("ADBE");
 assert.equal(r.liquidity.observedLiquidAssetsMillions,"5639");
 assert.equal(r.liquidity.observedSettlementReceivablesMillions,null);
 assert.equal(r.liquidity.observedProtectedFundsBasis,"unquantified");
 assert.equal(r.liquidity.unprotectedBookLiquidityCeilingMillions,"5639");
 assert.deepEqual(r.liquidity.scenarios.map(x=>x.hypotheticalDeductionMillions),["0","2819","5639"]);
 assert.deepEqual(r.liquidity.scenarios.map(x=>x.conditionalEVUsd),["100654484000","97835484000","95015484000"]);
 assert.deepEqual(r.liquidity.scenarios.map(x=>x.conditionalOperatingEarningsYieldBps),["921","948","976"]);
 assert.equal(r.liquidity.reviewedSurplusCashMillions,null);
 assert.equal(r.governance.fullyReconciledFinancingClaims,false);
});
test("Adobe economic quality alternative uses original FY2025 and Q3 FY2026 YTD SEC bridge, without ROC substitution",()=>{
 const p=evaluateSecEconomicCapitalDraft("ADBE").software;
 assert.ok(p);
 assert.equal(p.ttmRevenueMillions,"25970");
 assert.equal(p.ttmOperatingIncomeMillions,"9271");
 assert.equal(p.ttmResearchDevelopmentMillions,"4694");
 assert.equal(p.ttmOperatingCashFlowMillions,"10806");
 assert.equal(p.ttmStockBasedCompensationMillions,"2071");
 assert.equal(p.ttmCashFlowLessSbcDiagnosticMillions,"8735");
 assert.equal(p.ttmOperatingMarginBps,"3570");
 assert.equal(p.ttmResearchDevelopmentIntensityBps,"1807");
 assert.equal(p.ttmOperatingCashFlowToOperatingEarningsBps,"11656");
 assert.equal(p.ttmCashFlowLessSbcToOperatingEarningsBps,"9422");
 assert.equal(p.statementArithmeticChecks.length,4);
 assert.ok(p.statementArithmeticChecks.every(x=>x.pass));
 assert.equal(p.cashFlowNotFreeCashFlow,true);
 assert.equal(p.genericMagicFormulaROCBps,null);
 assert.equal(p.capitalizedRAndDRocBps,null);
 assert.equal(p.intersectorComparable,false);
 assert.equal(p.softwareEconomicCapitalApproval,"blocked_lacks_historical_rnd_amortization_and_deferred_revenue_policy");
});
test("neither securities source nor arithmetic can grant score/model use or true capital comparability",()=>{
 for(const sym of ["COST","ADBE"] as const){
  const r=evaluateSecEconomicCapitalDraft(sym);
  assert.equal(r.governance.independentReviewerAttestation,false);
  assert.equal(r.governance.reviewedOperatingCashBuffer,false);
  assert.equal(r.governance.contemporaneousExactEquityCap,false);
  assert.equal(r.governance.sectorComparableReturnOnCapital,false);
  assert.equal(r.governance.readyForCrossCompanyRanking,false);
  assert.equal(r.governance.readyForRadar,false);
  assert.equal(r.governance.modelEligible,false);
  assert.equal(r.governance.scoringEligible,false);
  assert.equal(r.governance.storedChanges,0);
  assert.ok(r.blockers.length>=6);
  assert.equal(r.financing.ledger.length,7);
  assert.equal(r.liquidity.scenarios.length,3);
 }
});
