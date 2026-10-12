import assert from "node:assert/strict";
import test from "node:test";
import {assessSecBorrowingSubset, type SecDebtProbe} from "./debt-perimeter-policy.ts";
import {extractSecOperatingModelCandidates, type SecGaap} from "./reusable-concept-extractor.ts";
import {extractOriginalSecOperatingPreview, type SecCompanyFacts} from "./xbrl-operating-preview.ts";

const f=(tag:string,value:string):SecDebtProbe=>({tag,status:"found",value});
const m=(tag:string):SecDebtProbe=>({tag,status:"missing",value:null});
const a=(tag:string):SecDebtProbe=>({tag,status:"ambiguous",value:null});

test("shared borrowing policy includes only direct current and noncurrent carrying values",()=>{
 const x=assessSecBorrowingSubset(f("LongTermDebtCurrent","2248000000"),
   f("LongTermDebtNoncurrent","3914000000"),
   [f("CommercialPaper","0"),m("ShortTermBorrowings")]);
 assert.equal(x.status,"components_match");
 assert.equal(x.subtotalUsd,"6162000000");
 assert.equal(x.modelEligible,false);
 assert.equal(x.scoringEligible,false);
});
test("unknown and positive supplemental short-term tags do not get added or ignored",()=>{
 for(const extra of ["CommercialPaper","ShortTermBorrowings","ShortTermDebtCurrent"]){
  const x=assessSecBorrowingSubset(f("LongTermDebtCurrent","100"),
   f("LongTermDebtNoncurrent","200"),[f(extra,"40")]);
  assert.equal(x.status,"ambiguous");
  assert.equal(x.subtotalUsd,null);
 }
 assert.equal(assessSecBorrowingSubset(f("LongTermDebtCurrent","100"),
   f("LongTermDebtNoncurrent","200"),[a("CommercialPaper")]).status,"ambiguous");
});
test("finance-lease-inclusive parent debt may not replace absent direct borrowing tag",()=>{
 const x=assessSecBorrowingSubset(m("LongTermDebtCurrent"),
  m("LongTermDebtNoncurrent"),[],
  [f("LongTermDebtAndCapitalLeaseObligations","500")]);
 assert.equal(x.status,"incomplete");
 assert.equal(x.subtotalUsd,null);
});
test("finance-lease-inclusive indicator remains visible but is never added to valid direct subtotal",()=>{
 const x=assessSecBorrowingSubset(f("LongTermDebtCurrent","20"),
  f("LongTermDebtNoncurrent","100"),[],
  [f("LongTermDebtAndCapitalLeaseObligations","200")]);
 assert.equal(x.status,"components_match");
 assert.equal(x.subtotalUsd,"120");
 assert.ok(x.caveats.some(t=>t.includes("Lease-inclusive")));
});
test("unsafe nonnegative integer and internal conflicts are rejected",()=>{
 for(const bad of ["-3","1.4","1e5"," 5",""]){
  const x=assessSecBorrowingSubset(f("LongTermDebtCurrent",bad),
    f("LongTermDebtNoncurrent","10"),[]);
  assert.equal(x.status,"ambiguous");
  assert.equal(x.subtotalUsd,null);
 }
 assert.equal(assessSecBorrowingSubset(f("LongTermDebtCurrent","1"),
   a("LongTermDebtNoncurrent"),[]).status,"ambiguous");
});

const context={accession:"0000909832-26-000093",
 periodEnd:"2026-08-30",filedDate:"2026-10-08",sector:"nonfinancial" as const};
const instant=(val:number)=>({accn:context.accession,end:context.periodEnd,form:"10-K",
 filed:context.filedDate,val});
const annual=(val:number)=>({...instant(val),start:"2025-09-01"});
const concept=(val:number,unit:"USD"|"shares"="USD",duration=false)=>
 ({units:{[unit]:[duration?annual(val):instant(val)]}});
function docs(current=2248000000,noncurrent=3914000000):SecCompanyFacts{
 return{cik:909832,facts:{"us-gaap":{
  OperatingIncomeLoss:concept(11685000000,"USD",true),
  LongTermDebtCurrent:concept(current),
  LongTermDebtNoncurrent:concept(noncurrent),
  CommonStockSharesOutstanding:concept(443266000,"shares"),
 },dei:{}}};
}
test("both public preview extractor contracts agree on Costco eligible direct-tag subset",()=>{
 const doc=docs();
 const s=extractSecOperatingModelCandidates(doc.facts!["us-gaap"]! as SecGaap,context);
 const p=extractOriginalSecOperatingPreview(doc,{
  cik:909832,accession:context.accession,periodEnd:context.periodEnd});
 assert.equal(s[1].amount,"6162000000");
 assert.equal(p.debt.subtotalUsd,s[1].amount);
 assert.equal(s[1].modelEligible,false);
 assert.equal(p.scoringEligible,false);
});
test("both preview contracts reject separately positive short borrowings rather than miscount them",()=>{
 const doc=docs();
 doc.facts!["us-gaap"]!.CommercialPaper=concept(100000000);
 const s=extractSecOperatingModelCandidates(doc.facts!["us-gaap"]! as SecGaap,context);
 const p=extractOriginalSecOperatingPreview(doc,{
  cik:909832,accession:context.accession,periodEnd:context.periodEnd});
 assert.equal(s[1].status,"ambiguous");
 assert.equal(s[1].amount,null);
 assert.equal(p.debt.status,"ambiguous");
 assert.equal(p.debt.subtotalUsd,null);
});
test("both preview contracts refuse lease-inclusive noncurrent tag as a substitute",()=>{
 const doc=docs();
 delete doc.facts!["us-gaap"]!.LongTermDebtNoncurrent;
 doc.facts!["us-gaap"]!.LongTermDebtAndCapitalLeaseObligations=concept(4000000000);
 const s=extractSecOperatingModelCandidates(doc.facts!["us-gaap"]! as SecGaap,context);
 const p=extractOriginalSecOperatingPreview(doc,{
  cik:909832,accession:context.accession,periodEnd:context.periodEnd});
 assert.equal(s[1].status,"unavailable");
 assert.equal(s[1].amount,null);
 assert.equal(p.debt.status,"incomplete");
 assert.equal(p.debt.subtotalUsd,null);
});
