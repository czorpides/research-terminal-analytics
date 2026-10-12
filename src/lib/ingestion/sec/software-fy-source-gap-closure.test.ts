import test from "node:test";
import assert from "node:assert/strict";
import {reconcileSoftwareFiscalEvidence,verifyThreeSoftwareFYSourceGaps,SEC_2J20_POLICY} from "./software-fy-source-gap-closure.ts";

test("three issuer original FY balance-sheet current assets crossfoot to source and prior reviewed FY",()=>{
 const x=verifyThreeSoftwareFYSourceGaps();
 assert.equal(x.version,SEC_2J20_POLICY);
 assert.equal(x.cases.length,3);
 assert.equal(x.sourceAsOf,"2026-10-09T20:00:00Z");
 assert.equal(x.verifiedEconomicReturns,0);
 assert.equal(x.readyForModel,false);
 assert.equal(x.readyForRanking,false);
 assert.equal(x.databaseWrites,0);
 const expected={
  ADBE:{cash:"5431",securities:"1164",CA:"10163",debt:"6210",finLease:"0",date:"2025-11-28"},
  ADSK:{cash:"2249",securities:"348",CA:"4942",debt:"2483",finLease:null,date:"2026-01-31"},
  NOW:{cash:"3726",securities:"2558",CA:"10471",debt:"1491",finLease:"0",date:"2025-12-31"},
 } as const;
 for(const v of x.cases){
  const e=expected[v.issuer];
  assert.equal(v.sourceFY,e.date);
  assert.equal(v.liquidity.cashMillions,e.cash);
  assert.equal(v.liquidity.shortTermSecuritiesMillions,e.securities);
  assert.equal(v.sourceFacts.otherCurrentAssetsKnown.amountMillions,
   (BigInt(e.CA)-BigInt(e.cash)-BigInt(e.securities)).toString());
  assert.equal(v.finance.reportedLongtermBorrowingCarryingMillions,e.debt);
  assert.equal(v.finance.explicitFinanceLeaseMillions,e.finLease);
  assert.equal(v.gates.originalStatementArithmeticChecksPassed,true);
  assert.ok(v.checks.length>=3&&v.checks.every(q=>q.passed));
  assert.equal(v.sourceFacts.reportedCashAndEquivalents.sourceUrl,v.official10K);
  assert.ok(v.official10K.startsWith("https://www.sec.gov/Archives/edgar/data/"));
 }
});
test("Adobe FY2025 has confirmed no finance leases and no current carrying borrowings, not an inferred zero",()=>{
 const a=reconcileSoftwareFiscalEvidence("ADBE");
 assert.equal(a.finance.reportedCurrentBorrowingMillions,"0");
 assert.equal(a.finance.currentBorrowingEvidence,"explicit_zero_line");
 assert.equal(a.finance.explicitFinanceLeaseMillions,"0");
 assert.equal(a.sourceFacts.financeLeases.sourceStatus,"explicit_reported_absence");
 assert.equal(a.sourceFacts.currentInterestBorrowings.sourceStatus,"explicit_reported_absence");
 assert.equal(a.sourceFacts.contractAssetCurrentSplit.amountMillions,null);
 assert.equal(a.sourceFacts.contractCostNoncurrentSplit.amountMillions,"464");
 assert.equal(a.liquidity.reportedLiquidBookAmountMillions,"6595");
 assert.equal(a.liquidity.reviewedFreelyAvailableCashMillions,null);
 assert.equal(a.liquidity.scenarios.length,3);
 assert.deepEqual(a.liquidity.scenarios.map(x=>x.conditionalUnapprovedCapitalSubsetMillions),
  ["2377.000000","-3054.000000","-4218.000000"]);
});
test("Autodesk FY2026 current notes nil while Q2 fiscal 2027 borrowings are NOT substituted",()=>{
 const d=reconcileSoftwareFiscalEvidence("ADSK");
 assert.equal(d.finance.reportedCurrentBorrowingMillions,"0");
 assert.equal(d.finance.reportedLongtermBorrowingCarryingMillions,"2483");
 assert.equal(d.finance.explicitFinanceLeaseMillions,null);
 assert.equal(d.liquidity.reportedLiquidBookAmountMillions,"2597");
 assert.equal(d.liquidity.noncurrentInvestmentBookAmountMillions,"376");
 assert.equal(d.contractAssets.longtermCapitalizedCommissionMillions,null);
 assert.equal(d.contractAssets.noteContractCostReconciled,null);
 assert.equal(d.liquidity.scenarios.length,3);
 assert.ok(d.liquidity.scenarios.every(x=>x.conditionalUnapprovedCapitalSubsetMillions===null));
 assert.equal(d.finance.comprehensiveFinancingPerimeterApproved,false);
});
test("ServiceNow FY2025 restricted 6 included in other CA, not added/subtracted from reported unrestricted cash twice",()=>{
 const n=reconcileSoftwareFiscalEvidence("NOW");
 assert.equal(n.liquidity.cashMillions,"3726");
 assert.equal(n.liquidity.shortTermSecuritiesMillions,"2558");
 assert.equal(n.liquidity.reportedLiquidBookAmountMillions,"6284");
 assert.equal(n.liquidity.noncurrentInvestmentBookAmountMillions,"3771");
 assert.equal(n.liquidity.explicitlyLocatedRestrictedCashOutsideCashMillions,"6");
 assert.match(n.liquidity.restrictedCashLocation!,/prepaid/i);
 assert.equal(n.liquidity.alreadyBookedRestrictedCashNotSubtractedFromCashTwice,true);
 assert.equal(n.finance.reportedCurrentBorrowingMillions,null);
 assert.equal(n.finance.currentBorrowingEvidence,"no_separate_debt_line_scope_unresolved");
 assert.equal(n.finance.reportedLongtermBorrowingCarryingMillions,"1491");
 assert.equal(n.finance.explicitFinanceLeaseMillions,"0");
 assert.equal(n.contractAssets.longtermCapitalizedCommissionMillions,"1114");
 assert.deepEqual(n.liquidity.scenarios.map(x=>x.conditionalUnapprovedCapitalSubsetMillions),
  ["3543.000000","-183.000000","-2741.000000"]);
});
test("FY lease disclosure costs and cash paid do NOT become lease-adjusted EBIT",()=>{
 const expected={
  ADBE:{expense:"92",fixed:null,variable:null,cash:"95",preRent:"8798",claims:["77","361"]},
  ADSK:{expense:"68",fixed:"58",variable:"10",cash:"89",preRent:"1646",claims:["52","199"]},
  NOW:{expense:"147",fixed:null,variable:null,cash:"107",preRent:"1971",claims:["112","800"]},
 } as const;
 for(const symbol of ["ADBE","ADSK","NOW"] as const){
  const x=reconcileSoftwareFiscalEvidence(symbol),e=expected[symbol];
  assert.equal(x.leases.originalReportedAnnualOperatingExpenseMillions,e.expense);
  assert.equal(x.leases.separatelyIdentifiedFixedCostMillions,e.fixed);
  assert.equal(x.leases.separatelyIdentifiedVariableCostMillions,e.variable);
  assert.equal(x.leases.originalOperatingLeaseCashPaidMillions,e.cash);
  assert.equal(x.leases.sourceObservationPretaxOperatingIncomeBeforeDisclosedLeaseCostMillions,e.preRent);
  assert.equal(x.finance.currentOperatingLeaseLiabilityMillions,e.claims[0]);
  assert.equal(x.finance.noncurrentOperatingLeaseLiabilityMillions,e.claims[1]);
  assert.equal(x.leases.rouAmortizationWithinGAAPOperatingExpenseMillions,null);
  assert.equal(x.leases.leaseImpliedInterestExpenseMillions,null);
  assert.equal(x.leases.compatibleCapitalizedLeaseEBITMillions,null);
  assert.equal(x.leases.compatibleCapitalizedLeaseOperatingMarginBps,null);
  assert.equal(x.leases.observationIsNotCapitalizedLeaseEBIT,true);
  assert.equal(x.leases.leaseMatchedNumeratorDenominatorApproved,false);
 }
 assert.equal(reconcileSoftwareFiscalEvidence("ADSK").checks.length,4);
});
test("none of the original FY disclosures proves surplus liquidity, complete economic capital or scoring permissions",()=>{
 for(const symbol of ["ADBE","ADSK","NOW"] as const){
  const x=reconcileSoftwareFiscalEvidence(symbol);
  assert.equal(x.sourceFacts.contractAssetCurrentSplit.amountMillions,null);
  assert.equal(x.gates.verifiedFreelyAvailableSurplusCash,false);
  assert.equal(x.liquidity.reviewedOperatingCashBufferMillions,null);
  assert.equal(x.liquidity.reviewedFreelyAvailableCashMillions,null);
  assert.equal(x.gates.contractAssetSplitComplete,false);
  assert.equal(x.gates.totalFinancingPerimeterComplete,false);
  assert.equal(x.gates.leaseEBITToCapitalReconciliationComplete,false);
  assert.equal(x.gates.issuerEconomicCapitalComplete,false);
  assert.equal(x.gates.comparableReturnOnCapitalBps,null);
  assert.equal(x.gates.independentlyReviewedFinancialClassification,false);
  assert.equal(x.gates.modelEligible,false);
  assert.equal(x.gates.scoringEligible,false);
  assert.equal(x.gates.databaseWrites,0);
  assert.ok(x.unresolved.some(t=>t.includes("income")||t.includes("lease")));
  for(const s of x.liquidity.scenarios){
   assert.equal(s.validOperatingCapital,false);
   assert.equal(s.verifiedSurplusCashDeductionMillions,null);
  }
 }
});
test("unknown original issuer cannot be admitted to existing three-company model",()=>{
 assert.throws(()=>reconcileSoftwareFiscalEvidence("MSFT" as never),/Unapproved issuer/);
});