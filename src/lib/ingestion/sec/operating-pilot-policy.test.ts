import assert from "node:assert/strict";
import test from "node:test";
import {
  verifyOriginalIssuerBridge,canSupplyScoredEbitOrTotalDebt,
  assessPiotroskiShareCountEvidence,
} from "./operating-pilot-policy.ts";

test("three FY original annual borrowing statements sum without floating point approximation",()=>{
 for(const [total,components] of [
  ["43151000000",["0","2999000000","40152000000"]],
  ["48543000000",["1996000000","46547000000"]],
  ["8468000000",["999000000","7469000000"]],
 ] as const){
  const row={basis:"borrowings_excluding_leases" as const,
    reported_usd:total,
    components:components.map((v,i)=>({line:"Borrowing component "+i,amount_usd:v}))};
  assert.equal(verifyOriginalIssuerBridge(row),"matches");
  assert.equal(canSupplyScoredEbitOrTotalDebt(row),false);
 }
});
test("original operating income is not automatically a model-approved EBIT value",()=>{
 for(const value of ["128528000000","129039000000","130387000000"]){
  const row={basis:"gaap_consolidated_operating_income" as const,
   reported_usd:value,
   components:[{line:"Consolidated operating income",amount_usd:value}]};
  assert.equal(verifyOriginalIssuerBridge(row),"matches");
  assert.equal(canSupplyScoredEbitOrTotalDebt(row),false);
 }
});
test("debt component mismatches, missing parts and fabricated zero fail closed",()=>{
 const correct={basis:"borrowings_excluding_leases" as const,
   reported_usd:"8468000000",
   components:[{line:"Current portion",amount_usd:"999000000"},
     {line:"Non-current debt",amount_usd:"7469000000"}]};
 assert.equal(verifyOriginalIssuerBridge({...correct,reported_usd:"8468000001"}),"mismatch");
 assert.equal(verifyOriginalIssuerBridge({...correct,components:correct.components.slice(0,1)}),"invalid");
 assert.equal(verifyOriginalIssuerBridge({...correct,components:[
  {...correct.components[0],amount_usd:"not observed"},correct.components[1]]}),"invalid");
});
test("Piotroski weighted-average EPS denominators cannot certify actual equity issuance",()=>{
 assert.equal(assessPiotroskiShareCountEvidence("weighted_average_diluted",true),"reject");
 assert.equal(assessPiotroskiShareCountEvidence("weighted_average_diluted",false),"reject");
 assert.equal(assessPiotroskiShareCountEvidence("period_end_common_outstanding",false),"reject");
 assert.equal(assessPiotroskiShareCountEvidence("period_end_common_outstanding",true),
  "requires_accounting_approval");
});
