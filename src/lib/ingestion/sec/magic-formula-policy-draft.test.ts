import assert from "node:assert/strict";
import test from "node:test";
import {
 evaluateSecMagicFormulaDraft,SEC_MAGIC_FORMULA_POLICY_V1,
 type DraftMagicFormulaEvidence,
} from "./magic-formula-policy-draft.ts";

const usd=(millions:number):string=>(BigInt(millions)*1000000n).toString();
const synthetic:DraftMagicFormulaEvidence={
 original:{
  // Fabricated identity for a pure arithmetic fixture, NOT a genuine issuer.
  cik:999999999,accession:"0999999999-26-000001",periodEnd:"2025-12-31",
  filedDate:"2026-02-06",firstObservedAt:"2026-02-07T12:00:00Z",
  sourceUrl:"https://www.sec.gov/Archives/edgar/data/999999999/099999999926000001/synthetic-20251231.htm",
  sector:"nonfinancial",
 },
 earnings:{
  operatingIncomeUsd:usd(1000),pretaxIncomeUsd:usd(1400),
  interestExpenseUsd:usd(100),
 },
 balance:{
  currentAssetsUsd:usd(4000),currentLiabilitiesUsd:usd(2200),
  cashAndEquivalentsInCurrentAssetsUsd:usd(500),
  nonoperatingInvestmentsInCurrentAssetsUsd:usd(100),
  otherNonoperatingCurrentAssetsUsd:usd(50),
  currentBorrowingsInCurrentLiabilitiesUsd:usd(300),
  currentFinanceLeaseInCurrentLiabilitiesUsd:usd(50),
  currentOperatingLeaseInCurrentLiabilitiesUsd:usd(100),
  netPpeUsd:usd(3000),
  financeLeaseRouNotAlreadyInNetPpeUsd:usd(250),
 },
 financing:{
  borrowingsExcludingAllLeasesUsd:usd(2400),
  financeLeaseCurrentUsd:usd(50),
  financeLeaseNoncurrentUsd:usd(450),
  operatingLeaseCurrentUsd:usd(100),
  operatingLeaseNoncurrentUsd:usd(600),
  preferredEquityUsd:usd(100),noncontrollingInterestUsd:usd(50),
  unrestrictedCashAvailableForEvUsd:usd(450),
  nonoperatingInvestmentsAvailableForEvUsd:usd(150),
 },
 market:{asOf:"2026-02-08T15:00:00Z",equityMarketCapitalizationUsd:usd(8000)},
 reviewBasis:"unreviewed_transcription",
};
const copy=()=>structuredClone(synthetic);

test("draft v1: operating assets/liabilities exclude cash and financing once; EV includes finance but NOT operating leases",()=>{
 const r=evaluateSecMagicFormulaDraft(copy());
 assert.equal(r.status,"arithmetic_only");
 assert.equal(r.policyVersion,"sec.magic_formula.operating_capital.draft.v1.0.0");
 assert.equal(r.operatingWorkingCapitalUsd,usd(1600));
 assert.equal(r.operatingCapitalEmployedUsd,usd(4850));
 assert.equal(r.financialBorrowingsExLeasesUsd,usd(2400));
 assert.equal(r.financeLeaseLiabilityUsd,usd(500));
 assert.equal(r.operatingLeaseLiabilityExcludedUsd,usd(700));
 assert.equal(r.enterpriseValueUsd,usd(10450));
 assert.equal(r.pretaxPlusInterestUsd,usd(1500));
 assert.equal(r.ebitDefinitionDifferenceUsd,usd(500));
 assert.equal(r.returnOnCapitalBps,"2062");
 assert.equal(r.earningsYieldBps,"957");
 assert.equal(r.modelEligible,false);assert.equal(r.scoringEligible,false);
 assert.equal(r.approval,"draft_needs_original_note_accounting_review");
 assert.equal(SEC_MAGIC_FORMULA_POLICY_V1.reviewState,"draft_no_model_or_scoring_permission");
});

test("original AMZN FY2025 source earnings/debt anchor remains partial, not invented full Magic Formula",()=>{
 const e=copy();
 e.original={cik:1018724,accession:"0001018724-26-000004",
  periodEnd:"2025-12-31",filedDate:"2026-02-06",
  firstObservedAt:"2026-10-12T10:00:00Z",
  sourceUrl:"https://www.sec.gov/Archives/edgar/data/1018724/000101872426000004/amzn-20251231.htm",
  sector:"nonfinancial"};
 e.market={asOf:"2026-10-12T12:00:00Z",equityMarketCapitalizationUsd:null};
 e.earnings={operatingIncomeUsd:usd(79975),pretaxIncomeUsd:usd(97311),interestExpenseUsd:usd(2274)};
 e.financing={...e.financing,borrowingsExcludingAllLeasesUsd:usd(68396),
  financeLeaseCurrentUsd:null,financeLeaseNoncurrentUsd:null,
  operatingLeaseCurrentUsd:null,operatingLeaseNoncurrentUsd:null,
  preferredEquityUsd:null,noncontrollingInterestUsd:null,
  unrestrictedCashAvailableForEvUsd:null,nonoperatingInvestmentsAvailableForEvUsd:null};
 e.balance=Object.fromEntries(Object.keys(e.balance).map(k=>[k,null])) as typeof e.balance;
 e.reviewBasis="issuer_note_checked_offline";
 const r=evaluateSecMagicFormulaDraft(e);
 assert.equal(r.status,"incomplete");
 assert.equal(r.gaapOperatingIncomeUsd,usd(79975));
 assert.equal(r.pretaxPlusInterestUsd,usd(99585));
 assert.equal(r.ebitDefinitionDifferenceUsd,usd(19610));
 assert.equal(r.financialBorrowingsExLeasesUsd,usd(68396));
 assert.equal(r.enterpriseValueUsd,null);
 assert.equal(r.returnOnCapitalBps,null);
 assert.equal(r.earningsYieldBps,null);
 assert.equal(r.modelEligible,false);
 assert.ok(r.missingFields.includes("financing.financeLeaseCurrentUsd"));
});

test("original ADBE FY2025 note-bridged debt is still insufficient for a complete calculation",()=>{
 const e=copy();
 e.original={cik:796343,accession:"0000796343-26-000003",
  periodEnd:"2025-11-28",filedDate:"2026-01-15",
  firstObservedAt:"2026-10-12T10:00:00Z",
  sourceUrl:"https://www.sec.gov/Archives/edgar/data/796343/000079634326000003/adbe-20251128.htm",
  sector:"nonfinancial"};
 e.market={asOf:"2026-10-12T12:00:00Z",equityMarketCapitalizationUsd:null};
 e.earnings={operatingIncomeUsd:usd(8706),pretaxIncomeUsd:usd(8734),interestExpenseUsd:usd(263)};
 e.financing={...e.financing,borrowingsExcludingAllLeasesUsd:usd(6210),
  financeLeaseCurrentUsd:null,financeLeaseNoncurrentUsd:null,
  operatingLeaseCurrentUsd:null,operatingLeaseNoncurrentUsd:null,
  preferredEquityUsd:null,noncontrollingInterestUsd:null,
  unrestrictedCashAvailableForEvUsd:null,nonoperatingInvestmentsAvailableForEvUsd:null};
 e.balance=Object.fromEntries(Object.keys(e.balance).map(k=>[k,null])) as typeof e.balance;
 const r=evaluateSecMagicFormulaDraft(e);
 assert.equal(r.status,"incomplete");
 assert.equal(r.gaapOperatingIncomeUsd,usd(8706));
 assert.equal(r.pretaxPlusInterestUsd,usd(8997));
 assert.equal(r.ebitDefinitionDifferenceUsd,usd(291));
 assert.equal(r.financialBorrowingsExLeasesUsd,usd(6210));
 assert.equal(r.enterpriseValueUsd,null);
 assert.equal(r.operatingCapitalEmployedUsd,null);
});

test("missing finance leases and minority interest are not silently set to zero",()=>{
 const e=copy();e.financing.financeLeaseNoncurrentUsd=null;
 e.financing.noncontrollingInterestUsd=null;
 const r=evaluateSecMagicFormulaDraft(e);
 assert.equal(r.status,"incomplete");
 assert.equal(r.financeLeaseLiabilityUsd,null);
 assert.equal(r.enterpriseValueUsd,null);
 assert.equal(r.earningsYieldBps,null);
});
test("cash available for enterprise value cannot exceed booked cash",()=>{
 const e=copy();e.financing.unrestrictedCashAvailableForEvUsd=usd(501);
 const r=evaluateSecMagicFormulaDraft(e);
 assert.equal(r.status,"rejected");
 assert.ok(r.problems.some(t=>t.includes("Unrestricted available cash")));
 assert.equal(r.enterpriseValueUsd,null);
});
test("short finance debt and lease portions cannot exceed the stated current liability components",()=>{
 const e=copy();e.balance.currentFinanceLeaseInCurrentLiabilitiesUsd=usd(51);
 assert.equal(evaluateSecMagicFormulaDraft(e).status,"rejected");
 e.balance.currentFinanceLeaseInCurrentLiabilitiesUsd=usd(50);
 e.balance.currentBorrowingsInCurrentLiabilitiesUsd=usd(2401);
 assert.equal(evaluateSecMagicFormulaDraft(e).status,"rejected");
 e.balance.currentBorrowingsInCurrentLiabilitiesUsd=usd(300);
 e.balance.currentOperatingLeaseInCurrentLiabilitiesUsd=usd(101);
 assert.equal(evaluateSecMagicFormulaDraft(e).status,"rejected");
});
test("cannot exclude more from current assets or current liabilities than reported",()=>{
 const e=copy();e.balance.cashAndEquivalentsInCurrentAssetsUsd=usd(5000);
 assert.equal(evaluateSecMagicFormulaDraft(e).status,"rejected");
 e.balance.cashAndEquivalentsInCurrentAssetsUsd=usd(500);
 e.balance.currentLiabilitiesUsd=usd(200);
 assert.equal(evaluateSecMagicFormulaDraft(e).status,"rejected");
});
test("invalid timestamps, look-ahead market value and source identity fail closed",()=>{
 const cases=[
  (e:DraftMagicFormulaEvidence)=>{e.market.asOf="2026-02-06T00:00:00Z"},
  (e:DraftMagicFormulaEvidence)=>{e.original.firstObservedAt="2025-12-31T12:00:00Z"},
  (e:DraftMagicFormulaEvidence)=>{e.original.accession="0999999999-26-000099"},
  (e:DraftMagicFormulaEvidence)=>{e.original.sourceUrl=e.original.sourceUrl.replace("www.sec.gov","evil.test")},
  (e:DraftMagicFormulaEvidence)=>{e.original.sourceUrl=e.original.sourceUrl+"?x=1"},
  (e:DraftMagicFormulaEvidence)=>{e.original.periodEnd="2026-12-31"},
 ];
 for(const mutate of cases){
  const e=copy();mutate(e);
  const r=evaluateSecMagicFormulaDraft(e);
  assert.equal(r.status,"rejected");
  assert.equal(r.modelEligible,false);
 }
});
test("excluded sectors never calculate industrial Magic Formula results",()=>{
 for(const sector of ["financial","reit","utility","unclassified"] as const){
  const e=copy();e.original.sector=sector;
  const r=evaluateSecMagicFormulaDraft(e);
  assert.equal(r.status,"rejected");assert.equal(r.returnOnCapitalBps,null);
 }
});
test("negative/decimal financing balances and invalid equity cap rejected",()=>{
 const vals=["-1","1.5","5e9"," 123"];
 for(const v of vals){const e=copy();e.financing.preferredEquityUsd=v;
  assert.equal(evaluateSecMagicFormulaDraft(e).status,"rejected");
 }
 const e=copy();e.market.equityMarketCapitalizationUsd="0";
 assert.equal(evaluateSecMagicFormulaDraft(e).status,"rejected");
});
test("nonpositive operating earnings or EV invested capital are unavailable, not infinities",()=>{
 const e=copy();e.earnings.operatingIncomeUsd="0";
 assert.equal(evaluateSecMagicFormulaDraft(e).status,"rejected");
 const f=copy();f.balance.netPpeUsd="0";f.balance.currentAssetsUsd=usd(1000);
 f.balance.currentLiabilitiesUsd=usd(5000);
 // This is also invalid because reclassified CL cannot exceed the CL.
 const r=evaluateSecMagicFormulaDraft(f);
 assert.equal(r.status,"rejected");
 assert.equal(r.returnOnCapitalBps,null);
});
