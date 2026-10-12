import test from "node:test";
import assert from "node:assert/strict";
import {getIndependentSecReview} from "./independent-original-10k-review.ts";

test("all original 10-K balance and debt/lease bridges cross-foot with exact USD million arithmetic",()=>{
 for(const ticker of ["AMZN","ADBE","COST"] as const){
  const x=getIndependentSecReview(ticker);
  assert.ok(x.checks.length>=3);
  assert.equal(x.arithmeticPass,true);
  assert.ok(x.checks.every(y=>y.status==="matches"),ticker+" failed a note bridge");
  assert.equal(x.reviewerAttestation,"not_performed");
  assert.equal(x.modelEligible,false);
  assert.equal(x.scoringEligible,false);
 }
});
test("Amazon Note 6 short-term financing is NOT incorrectly treated as zero",()=>{
 const a=getIndependentSecReview("AMZN");
 assert.equal(a.borrowingPerimeter,"incomplete");
 const debt=a.checks.find(x=>x.id==="reported-long-term-debt");
 const total=a.checks.find(x=>x.id==="identified-short-term-and-long-term-borrowings");
 assert.equal(debt?.expectedMillions,"68396");
 assert.equal(total?.expectedMillions,"68851");
 assert.equal(a.fields.find(x=>x.key==="source.shortTermCreditFacilities")?.amountMillions,"455");
 assert.equal(a.fields.find(x=>x.key==="source.currentFinancingObligations")?.amountMillions,"358");
 assert.ok(a.flags.some(x=>x.includes("financing obligations")));
});
test("Amazon finance/operating leases are distinct and finance asset is already in property and equipment",()=>{
 const x=getIndependentSecReview("AMZN");
 assert.equal(x.checks.find(y=>y.id==="finance-leases")?.expectedMillions,"12286");
 assert.equal(x.checks.find(y=>y.id==="operating-leases")?.expectedMillions,"89252");
 assert.equal(x.fields.find(y=>y.key==="balance.financeLeaseRouNotAlreadyInNetPpeUsd")?.amountMillions,"0");
});
test("Costco finance assets are in OTHER long-term assets, not double counted as PPE",()=>{
 const x=getIndependentSecReview("COST");
 assert.equal(x.fields.find(y=>y.key==="balance.netPpeUsd")?.amountMillions,"35633");
 assert.equal(x.fields.find(y=>y.key==="balance.financeLeaseRouNotAlreadyInNetPpeUsd")?.amountMillions,"1413");
 assert.equal(x.checks.find(y=>y.id==="all-lease-liabilities")?.expectedMillions,"4019");
 assert.ok(x.fields.find(y=>y.key==="balance.currentFinanceLeaseInCurrentLiabilitiesUsd")?.sourceSection.includes("other current"));
});
test("Adobe finance leases are NOT imputed zero merely because Note 7 describes operating leases",()=>{
 const x=getIndependentSecReview("ADBE");
 assert.equal(x.checks.find(y=>y.id==="operating-leases")?.expectedMillions,"438");
 assert.equal(x.fields.some(y=>y.key==="financing.financeLeaseCurrentUsd"),false);
 assert.equal(x.fields.some(y=>y.key==="financing.financeLeaseNoncurrentUsd"),false);
 assert.equal(x.fields.find(y=>y.key==="balance.currentBorrowingsInCurrentLiabilitiesUsd")?.amountMillions,"0");
});
test("review source only: no market cap, nonoperating liquid investments or unrestricted cash falsely asserted",()=>{
 for(const ticker of ["AMZN","ADBE","COST"] as const){
  const x=getIndependentSecReview(ticker);
  assert.equal(x.marketCap,"missing_contemporaneous_independently_sourced_equity_value");
  assert.equal(x.fields.some(f=>f.key==="financing.unrestrictedCashAvailableForEvUsd"),false);
  assert.equal(x.fields.some(f=>f.key==="financing.nonoperatingInvestmentsAvailableForEvUsd"),false);
  assert.equal(x.fields.some(f=>f.key==="financing.noncontrollingInterestUsd"),false);
 }
});
test("unreviewed arbitrary issuer is never accepted",()=>{
 assert.throws(()=>getIndependentSecReview("MSFT" as never),/Unapproved/);
});
