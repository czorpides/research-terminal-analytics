import assert from "node:assert/strict";
import test from "node:test";
import {reconcileOriginalSecNote, type SecNoteEvidence} from "./original-note-reconciliation.ts";

// Values transcribed from the issuers' original annual consolidated statements
// and notes, not fetched by this pure arithmetic test. Human source verification
// remains a separate gate.
const amazon: SecNoteEvidence = {
  cik:1018724,accession:"0001018724-26-000004",
  fiscalEnd:"2025-12-31",filedDate:"2026-02-06",
  original10kUrl:"https://www.sec.gov/Archives/edgar/data/1018724/000101872426000004/amzn-20251231.htm",
  sector:"nonfinancial",
  operatingIncomeUsd:"79975000000",pretaxIncomeUsd:"97311000000",
  interestExpenseUsd:"2274000000",
  currentBorrowingsUsd:"2748000000",noncurrentBorrowingsUsd:"65648000000",
  reportedBorrowingsUsd:"68396000000",debtFaceUsd:"68836000000",
  debtFaceAdjustments:[{label:"Unamortized discount and issuance costs",signedUsd:"-440000000"}],
  otherNonoperatingItems:[
    {label:"Interest income",signedUsd:"4381000000"},
    {label:"Other income net",signedUsd:"15229000000"},
  ],
  fiscalYearEndCommonShares:"10731000000",
};
const adobe: SecNoteEvidence = {
  cik:796343,accession:"0000796343-26-000003",
  fiscalEnd:"2025-11-28",filedDate:"2026-01-15",
  original10kUrl:"https://www.sec.gov/Archives/edgar/data/796343/000079634326000003/adbe-20251128.htm",
  sector:"nonfinancial",
  operatingIncomeUsd:"8706000000",pretaxIncomeUsd:"8734000000",
  interestExpenseUsd:"263000000",
  currentBorrowingsUsd:"0",noncurrentBorrowingsUsd:"6210000000",
  reportedBorrowingsUsd:"6210000000",debtFaceUsd:"6150000000",
  debtFaceAdjustments:[
    {label:"Fair-value interest-rate swap adjustment",signedUsd:"86000000"},
    {label:"Unamortized discount and issuance costs",signedUsd:"-26000000"},
  ],
  otherNonoperatingItems:[
    {label:"Investment gains",signedUsd:"43000000"},
    {label:"Other income net",signedUsd:"248000000"},
  ],
  fiscalYearEndCommonShares:"413000000",
};

test("AMZN FY2025 source-note arithmetic balances without certifying valuation inputs",()=>{
  const x=reconcileOriginalSecNote(amazon);
  assert.equal(x.status,"arithmetic_consistent_source_only");
  assert.equal(x.operatingIncomeUsd,"79975000000");
  assert.equal(x.pretaxPlusInterestUsd,"99585000000");
  assert.equal(x.differenceFromOperatingIncomeUsd,"19610000000");
  assert.equal(x.borrowingsExcludingLeasesUsd,"68396000000");
  assert.equal(x.fiscalYearEndCommonShares,"10731000000");
  assert.equal(x.modelEligible,false);
  assert.equal(x.scoringEligible,false);
});
test("ADBE FY2025 debt swaps and discounts reconcile, despite missing generic noncurrent source tag",()=>{
  const x=reconcileOriginalSecNote(adobe);
  assert.equal(x.status,"arithmetic_consistent_source_only");
  assert.equal(x.borrowingsExcludingLeasesUsd,"6210000000");
  assert.equal(x.pretaxPlusInterestUsd,"8997000000");
  assert.equal(x.differenceFromOperatingIncomeUsd,"291000000");
  assert.equal(x.modelEligible,false);
});
test("incomplete or inconsistent issuer debt-note arithmetic is rejected",()=>{
  const bad={...amazon,reportedBorrowingsUsd:"65648000000"};
  const result=reconcileOriginalSecNote(bad);
  assert.equal(result.status,"rejected");
  assert.equal(result.borrowingsExcludingLeasesUsd,null);
  assert.ok(result.errors.some(x=>x.includes("Current and noncurrent")));
  const badHedge={...adobe,debtFaceAdjustments:[
    {label:"Incorrect swap",signedUsd:"860000000"},
    {label:"Debt discount",signedUsd:"-26000000"},
  ]};
  assert.equal(reconcileOriginalSecNote(badHedge).status,"rejected");
});
test("nonoperating gains cannot be silently rolled into operating earnings or EBIT",()=>{
  const x=reconcileOriginalSecNote({...amazon,otherNonoperatingItems:[
    {label:"Interest income",signedUsd:"4381000000"},
  ]});
  assert.equal(x.status,"rejected");
  assert.equal(x.operatingIncomeUsd,null);
  assert.equal(x.ebitPolicy,"definition_not_approved");
});
test("invalid accession, future period, wrong SEC host or path cannot be source-anchored",()=>{
  assert.equal(reconcileOriginalSecNote({...amazon,accession:"0001018724-26-000999"}).status,"rejected");
  assert.equal(reconcileOriginalSecNote({...amazon,original10kUrl:amazon.original10kUrl.replace("www.sec.gov","sec.evil.test")}).status,"rejected");
  assert.equal(reconcileOriginalSecNote({...amazon,fiscalEnd:"2026-12-31"}).status,"rejected");
  assert.equal(reconcileOriginalSecNote({...amazon,original10kUrl:amazon.original10kUrl+"?alter=1"}).status,"rejected");
});
test("industrial reconciliation excludes bank, REIT, utility and unknown industry policy",()=>{
  for(const sector of ["financial","reit","utility","unclassified"] as const){
    const x=reconcileOriginalSecNote({...adobe,sector});
    assert.equal(x.status,"rejected");
    assert.equal(x.modelEligible,false);
  }
});
test("negative debt, noninteger quantities, zero shares and implicit face reconciliation fail closed",()=>{
  assert.equal(reconcileOriginalSecNote({...amazon,currentBorrowingsUsd:"-1"}).status,"rejected");
  assert.equal(reconcileOriginalSecNote({...amazon,reportedBorrowingsUsd:"68.396"}).status,"rejected");
  assert.equal(reconcileOriginalSecNote({...amazon,fiscalYearEndCommonShares:"0"}).status,"rejected");
  assert.equal(reconcileOriginalSecNote({...amazon,debtFaceAdjustments:[]}).status,"rejected");
});
test("optional year-end shares are never inferred from diluted weighted-average or cover counts",()=>{
  const {fiscalYearEndCommonShares: _ignored, ...withoutShares}=adobe;
  const x=reconcileOriginalSecNote(withoutShares);
  assert.equal(x.status,"arithmetic_consistent_source_only");
  assert.equal(x.fiscalYearEndCommonShares,null);
  assert.equal(x.sharePolicy,"fiscal_end_amount_not_split_adjusted_for_piotroski");
});
