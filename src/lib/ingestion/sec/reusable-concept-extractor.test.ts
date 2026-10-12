import assert from "node:assert/strict";
import test from "node:test";
import {extractSecOperatingModelCandidates,type SecGaap,type SecOriginalContext} from "./reusable-concept-extractor.ts";
const ctx=(accession:string,end:string,filed:string):SecOriginalContext=>({
 accession,periodEnd:end,filedDate:filed,sector:"nonfinancial",
});
const make=(c:SecOriginalContext,operating:number,current:number,long:number,shares:number):SecGaap=>{
 const duration={accn:c.accession,form:"10-K",end:c.periodEnd,
   start:new Date(Date.parse(c.periodEnd+"T00:00:00Z")-364*86400000).toISOString().slice(0,10),
   filed:c.filedDate};
 const instant={accn:c.accession,form:"10-K",end:c.periodEnd,filed:c.filedDate};
 return{
   OperatingIncomeLoss:{units:{USD:[{...duration,val:operating}]}},
   LongTermDebtCurrent:{units:{USD:[{...instant,val:current}]}},
   LongTermDebtNoncurrent:{units:{USD:[{...instant,val:long}]}},
   CommonStockSharesOutstanding:{units:{shares:[{...instant,val:shares}]}},
 };
};
test("three original issuer fixture examples reproduce conservative source figures but never certify EBIT/EV",()=>{
 const cases=[
  [ctx("0000950170-25-100235","2025-06-30","2025-07-30"),128528000000,2999000000,40152000000,7000000000,"43151000000"],
  [ctx("0001652044-26-000018","2025-12-31","2026-02-05"),129039000000,1996000000,46547000000,12000000000,"48543000000"],
  [ctx("0001045810-26-000021","2026-01-25","2026-02-25"),130387000000,999000000,7469000000,24000000000,"8468000000"],
 ] as const;
 for(const [context,op,current,long,shares,debt] of cases){
  const out=extractSecOperatingModelCandidates(make(context,op,current,long,shares),context);
  assert.equal(out[0].amount,String(op));
  assert.equal(out[1].amount,debt);
  assert.equal(out[2].amount,String(shares));
  for(const item of out){
   assert.equal(item.status,"requires_accounting_review");
   assert.equal(item.modelEligible,false);
   assert.equal(item.scoringEligible,false);
  }
 }
});
test("independent-sample schema uses only exact current original accession",()=>{
 const x=ctx("0000909832-26-000093","2026-08-30","2026-10-07");
 const good=make(x,9000000000,500000000,1500000000,1000000000);
 const a=extractSecOperatingModelCandidates(good,x);
 assert.equal(a[0].amount,"9000000000");
 assert.equal(a[1].amount,"2000000000");
 // Same issuer's previous accession comparative cannot count as current.
 const older=structuredClone(good);
 older.OperatingIncomeLoss.units!.USD![0]!.accn="0000909832-25-000101";
 assert.equal(extractSecOperatingModelCandidates(older,x)[0].status,"unavailable");
});
test("financial/REIT/utility/unclassified issuers never pass industrial mapping",()=>{
 const c=ctx("0000950170-25-100235","2025-06-30","2025-07-30");
 for(const sector of ["financial","reit","utility","unclassified"] as const){
  const x=extractSecOperatingModelCandidates(make(c,100,5,10,100),{...c,sector});
  assert.equal(x.length,3);
  assert.ok(x.every(r=>r.amount===null&&r.status==="unavailable"));
 }
});
test("conflicting instant/alternative debt, absent current debt and DEI shares fail closed",()=>{
 const c=ctx("0000950170-25-100235","2025-06-30","2025-07-30");
 const g=make(c,100,5,10,100);
 g.ShortTermBorrowings={units:{USD:[{
  accn:c.accession,form:"10-K",end:c.periodEnd,filed:c.filedDate,val:7,
 }]}};
 assert.equal(extractSecOperatingModelCandidates(g,c)[1].status,"ambiguous");
 delete g.LongTermDebtCurrent;
 delete g.ShortTermBorrowings;
 assert.equal(extractSecOperatingModelCandidates(g,c)[1].status,"unavailable");
 delete g.CommonStockSharesOutstanding;
 assert.equal(extractSecOperatingModelCandidates(g,c)[2].status,"unavailable");
});
test("quarterly, future dates, other accession, decimal precision and 10-K/A never accepted",()=>{
 const c=ctx("0000950170-25-100235","2025-06-30","2025-07-30");
 const g=make(c,100,5,10,100);
 g.OperatingIncomeLoss.units!.USD![0]!.start="2025-04-01";
 assert.equal(extractSecOperatingModelCandidates(g,c)[0].amount,null);
 g.OperatingIncomeLoss.units!.USD![0]!.start="2024-07-01";
 g.OperatingIncomeLoss.units!.USD![0]!.form="10-K/A";
 assert.equal(extractSecOperatingModelCandidates(g,c)[0].amount,null);
 g.LongTermDebtNoncurrent.units!.USD![0]!.val=Number.MAX_SAFE_INTEGER+1;
 assert.equal(extractSecOperatingModelCandidates(g,c)[1].status,"ambiguous");
});
