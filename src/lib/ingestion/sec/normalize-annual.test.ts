import assert from "node:assert/strict";
import test from "node:test";
import { selectSecAnnualFilings, extractAnnualFacts } from "./normalize-annual.ts";
import { STATEMENT_METRICS } from "../../opportunity/fundamental-models.ts";

const accn="0000320193-25-000079";
const year="2025-09-27";
const fy=(val:number,tag="10-K")=>({accn,form:tag,start:"2024-09-29",end:year,val,fp:"FY",filed:"2025-10-31"});
const bs=(val:number)=>({accn,form:"10-K",end:year,val,fp:"FY",filed:"2025-10-31"});
const baseSubmissions={
  cik:"320193",tickers:["AAPL"],filings:{recent:{
    accessionNumber:[accn,"0000320193-25-000080"],
    form:["10-K","10-Q"],reportDate:[year,"2025-06-28"],
    filingDate:["2025-10-31","2025-07-20"],
    acceptanceDateTime:["2025-10-31T18:00:00.000Z","2025-07-20T10:00:00.000Z"],
    primaryDocument:["aapl-20250927.htm","aapl-q.htm"]
  }}
};
function data(facts:Record<string,object>) {return {cik:320193,facts:{"us-gaap":facts}};}
test("direct accession matched FY facts are accepted, quarterly durations are ignored",()=>{
  const x=selectSecAnnualFilings(320193,"AAPL",baseSubmissions,data({
    NetIncomeLoss:{units:{USD:[fy(100),{...fy(88),accn:"0000320193-26-000123"}]}},
    Assets:{units:{USD:[bs(500)]}},
    RevenueFromContractWithCustomerExcludingAssessedTax:{units:{USD:[
      fy(250),{...fy(1000),start:"2025-06-29"},
    ]}},
    WeightedAverageNumberOfDilutedSharesOutstanding:{units:{shares:[fy(99)]}}
  }));
  assert.equal(x.length,1);
  assert.equal(x[0].facts.find(z=>z.metricCode===STATEMENT_METRICS.netIncome)?.value,100);
  assert.equal(x[0].facts.find(z=>z.metricCode===STATEMENT_METRICS.totalAssets)?.value,500);
  assert.equal(x[0].facts.find(z=>z.metricCode===STATEMENT_METRICS.revenue)?.value,250);
  assert.equal(x[0].facts.find(z=>z.metricCode===STATEMENT_METRICS.sharesOutstanding)?.unit,"shares");
  assert.equal(x[0].facts.some(z=>z.metricCode===STATEMENT_METRICS.ebit),false);
  assert.equal(x[0].facts.some(z=>z.metricCode===STATEMENT_METRICS.totalDebt),false);
});
test("reject mismatched ticker and CIK (never identity-guess)",()=>{
  assert.throws(()=>selectSecAnnualFilings(320193,"MSFT",baseSubmissions,data({})),/ticker/);
  assert.throws(()=>selectSecAnnualFilings(320194,"AAPL",baseSubmissions,data({})),/CIK/);
});
test("ambiguous values for same accession and frame must be omitted",()=>{
  const rows=extractAnnualFacts({
    GrossProfit:{units:{USD:[fy(10),fy(12)]}},
    NetIncomeLoss:{units:{USD:[fy(-3)]}},
    Assets:{units:{EUR:[bs(99)]}},
  },accn,year);
  assert.equal(rows.some(z=>z.metricCode===STATEMENT_METRICS.grossProfit),false);
  assert.equal(rows.some(z=>z.metricCode===STATEMENT_METRICS.totalAssets),false);
  assert.equal(rows.find(z=>z.metricCode===STATEMENT_METRICS.netIncome)?.value,-3);
});
test("10-K/A does not silently overwrite the original",()=>{
 const x=selectSecAnnualFilings(320193,"AAPL",{
   cik:320193,tickers:["AAPL"],filings:{recent:{
      accessionNumber:["0000320193-25-000081"],form:["10-K/A"],reportDate:[year],
      filingDate:["2025-12-01"]
   }}},data({NetIncomeLoss:{units:{USD:[{...fy(10),accn:"0000320193-25-000081",form:"10-K/A"}]}}}));
 assert.equal(x.length,0);
});
test("quarterly and YTD figures do not count as annual flows",()=>{
 const rows=extractAnnualFacts({
   Revenues:{units:{USD:[{...fy(10),start:"2025-06-01"}]}},
   AssetsCurrent:{units:{USD:[bs(13)]}}
 },accn,year);
 assert.equal(rows.length,1);
 assert.equal(rows[0].metricCode,STATEMENT_METRICS.currentAssets);
});
