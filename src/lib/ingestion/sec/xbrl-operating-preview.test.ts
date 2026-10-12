import test from "node:test";
import assert from "node:assert/strict";
import {extractOriginalSecOperatingPreview,type SecCompanyFacts} from "./xbrl-operating-preview.ts";

type Sample={
 symbol:string;cik:number;accn:string;end:string;start:string;
 income:string;current?:string;noncurrent?:string;paper?:string;
 short?:string;parent?:string;principal?:string;yearEndShares?:string;
 coverShares?:string;coverDate?:string;expectedDebt:string|null;
};
// Values captured from each company's original SEC CompanyFacts exact 10-K
// accession, retrieved and checked on 2026-10-12. This is a static,
 // network-independent CI fixture: the live owner preview fetches the SEC.
const sample:Sample[]=[
 {symbol:"MSFT",cik:789019,accn:"0000950170-25-100235",
  end:"2025-06-30",start:"2024-07-01",income:"128528000000",
  current:"2999000000",noncurrent:"40152000000",paper:"0",
  parent:"43151000000",principal:"3000000000",
  yearEndShares:"7434000000",coverShares:"7433166379",
  coverDate:"2025-07-24",expectedDebt:"43151000000"},
 {symbol:"GOOGL",cik:1652044,accn:"0001652044-26-000018",
  end:"2025-12-31",start:"2025-01-01",income:"129039000000",
  current:"1996000000",noncurrent:"46547000000",paper:"0",
  parent:"49085000000",principal:"2000000000",
  yearEndShares:"12088000000",expectedDebt:"48543000000"},
 {symbol:"NVDA",cik:1045810,accn:"0001045810-26-000021",
  end:"2026-01-25",start:"2025-01-27",income:"130387000000",
  current:"999000000",noncurrent:"7469000000",
  parent:"8468000000",yearEndShares:"24304000000",
  coverShares:"24300000000",coverDate:"2026-02-20",
  expectedDebt:"8468000000"},
 {symbol:"COST",cik:909832,accn:"0000909832-26-000093",
  end:"2026-08-30",start:"2025-09-01",income:"11685000000",
  current:"2248000000",noncurrent:"3914000000",
  principal:"2250000000",
  yearEndShares:"443266000",coverShares:"443129349",
  coverDate:"2026-09-29",expectedDebt:"6162000000"},
 {symbol:"TXN",cik:97476,accn:"0000097476-26-000059",
  end:"2025-12-31",start:"2025-01-01",income:"6023000000",
  current:"500000000",noncurrent:"13548000000",paper:"0",
  parent:"14048000000",coverShares:"907550774",
  coverDate:"2026-01-27",expectedDebt:"14048000000"},
 {symbol:"ADBE",cik:796343,accn:"0000796343-26-000003",
  end:"2025-11-28",start:"2024-11-30",income:"8706000000",
  current:"0",parent:"6210000000",
  yearEndShares:"413000000",coverShares:"410500000",
  coverDate:"2026-01-09",expectedDebt:null},
];
const usd=(tag:string,val:string,s:Sample,annual=false,end=s.end)=>{
 return {accn:s.accn,end,form:"10-K",filed:"2026-09-30",val:Number(val),
    ...(annual?{start:s.start}:{})};
};
function source(s:Sample):SecCompanyFacts{
 const tag=(name:string,value:string|undefined,annual=false,end=s.end)=>
  value===undefined?{}:{[name]:{units:{USD:[usd(name,value,s,annual,end)]}}};
 const shares=(val:string|undefined,date=s.end):Record<string,{units:{shares:Array<{accn:string;end:string;filed:string;form:string;val:number}>}} >=>
  val===undefined?{}:{CommonStockSharesOutstanding:{
   units:{shares:[{accn:s.accn,end:date,filed:"2026-10-01",
   form:"10-K",val:Number(val)}]}}};
 const dei:Record<string,{units:{shares:Array<{accn:string;end:string;filed:string;form:string;val:number}>}}>=s.coverShares?{
  EntityCommonStockSharesOutstanding:{units:{shares:[{
   accn:s.accn,end:s.coverDate!,form:"10-K",
   filed:"2026-10-01",val:Number(s.coverShares)}]}}
 }:{};
 return {
  cik:s.cik,
  facts:{
   "us-gaap":{
    ...tag("OperatingIncomeLoss",s.income,true),
    ...tag("LongTermDebtCurrent",s.current),
    ...tag("LongTermDebtNoncurrent",s.noncurrent),
    ...tag("LongTermDebt",s.parent),
    ...tag("CommercialPaper",s.paper),
    ...tag("ShortTermBorrowings",s.short),
    ...tag("LongTermDebtMaturitiesRepaymentsOfPrincipalInNextTwelveMonths",s.principal),
    ...shares(s.yearEndShares),
   },
   dei,
  },
 };
}
for(const s of sample){
 test(s.symbol+" independently captured original 10-K accession preview is source scoped",()=>{
  const p=extractOriginalSecOperatingPreview(source(s),{
    cik:s.cik,accession:s.accn,periodEnd:s.end,
  });
  assert.equal(p.operatingIncome.value,s.income);
  assert.equal(p.operatingIncome.status,"found");
  assert.equal(p.debt.subtotalUsd,s.expectedDebt);
  assert.equal(p.debt.status,s.expectedDebt===null?"incomplete":"components_match");
  assert.equal(p.yearEndCommonShares.value,s.yearEndShares??null);
  assert.equal(p.coverPageShares.value,s.coverShares??null);
  assert.equal(p.modelEligible,false);
  assert.equal(p.scoringEligible,false);
  assert.equal(p.debt.modelApproved,false);
  if(s.coverShares)assert.equal(p.coverDateAfterFiscalEnd,true);
 });
}
test("MSFT/GOOGL aggregate debt parent and gross principal maturities never double count",()=>{
 for(const s of sample.filter(s=>s.symbol==="MSFT"||s.symbol==="GOOGL")){
  const p=extractOriginalSecOperatingPreview(source(s),{
    cik:s.cik,accession:s.accn,periodEnd:s.end,
  });
  assert.equal(p.debt.subtotalUsd,s.expectedDebt);
  assert.equal(p.debt.ignoredPrincipalMaturities.status,"found");
  assert.equal(p.debt.observations.find(v=>v.tag==="LongTermDebt")?.status,"found");
 }
});
test("COST carrying value and next-year principal differ: principal is not silently added",()=>{
 const s=sample.find(x=>x.symbol==="COST")!;
 const p=extractOriginalSecOperatingPreview(source(s),{
  cik:s.cik,accession:s.accn,periodEnd:s.end,
 });
 assert.equal(p.debt.subtotalUsd,"6162000000");
 assert.equal(p.debt.ignoredPrincipalMaturities.value,"2250000000");
});
test("ADBE parent LongTermDebt alone does not justify noncurrent debt breakdown",()=>{
 const s=sample.find(x=>x.symbol==="ADBE")!;
 const p=extractOriginalSecOperatingPreview(source(s),{
  cik:s.cik,accession:s.accn,periodEnd:s.end,
 });
 assert.equal(p.debt.status,"incomplete");
 assert.equal(p.debt.subtotalUsd,null);
 assert.equal(p.debt.observations.find(v=>v.tag==="LongTermDebt")?.value,"6210000000");
});
test("TXN after-year-end DEI cover shares cannot substitute for missing period-end US-GAAP shares",()=>{
 const s=sample.find(x=>x.symbol==="TXN")!;
 const p=extractOriginalSecOperatingPreview(source(s),{
  cik:s.cik,accession:s.accn,periodEnd:s.end,
 });
 assert.equal(p.yearEndCommonShares.status,"missing");
 assert.equal(p.coverPageShares.status,"found");
 assert.equal(p.coverDateAfterFiscalEnd,true);
});
test("wrong original accession/CIK, repeated contexts with conflicting values, amendments fail closed",()=>{
 const s=sample[0];const doc=source(s);
 assert.throws(()=>extractOriginalSecOperatingPreview(doc,{
  cik:123,accession:s.accn,periodEnd:s.end,
 }),/identity mismatch/);
 const other=extractOriginalSecOperatingPreview(doc,{
  cik:s.cik,accession:"0000950170-24-087843",periodEnd:s.end,
 });
 assert.equal(other.operatingIncome.status,"missing");
 const fact=doc.facts!["us-gaap"]!.OperatingIncomeLoss.units!.USD;
 fact.push({...fact[0],val:1});
 assert.equal(extractOriginalSecOperatingPreview(doc,{
  cik:s.cik,accession:s.accn,periodEnd:s.end,
 }).operatingIncome.status,"ambiguous");
 fact[0].form="10-K/A";fact[1].form="10-K/A";
 assert.equal(extractOriginalSecOperatingPreview(doc,{
  cik:s.cik,accession:s.accn,periodEnd:s.end,
 }).operatingIncome.status,"missing");
});
test("commercial paper and ShortTermBorrowings both positive are potentially overlapping, so no subtotal",()=>{
 const s={...sample[0],paper:"150000000",short:"350000000"};
 const p=extractOriginalSecOperatingPreview(source(s),{cik:s.cik,accession:s.accn,periodEnd:s.end});
 assert.equal(p.debt.status,"ambiguous");
 assert.equal(p.debt.subtotalUsd,null);
});
