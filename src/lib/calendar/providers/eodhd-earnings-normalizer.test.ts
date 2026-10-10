import test from "node:test";
import assert from "node:assert/strict";
import { parseEodhdEarnings } from "./eodhd-earnings-normalizer.ts";
test("keeps date precision and provider timing instead of inventing clock times",()=>{
  const r=parseEodhdEarnings({earnings:[
    {code:"AAOI.US",report_date:"2026-11-05",before_after_market:"AfterMarket",actual:null,estimate:1.15,percent:null,currency:"USD"},
    {code:"BE.US",report_date:"2026-11-03",before_after_market:"BeforeMarket",actual:2.0,estimate:1.0,percent:100}
  ]});
  assert.equal(r.length,2);
  assert.equal(r[0].datePrecision,"date");
  assert.equal(r[0].reportDate,"2026-11-05");
  assert.equal(r[0].timing,"post_market");
  assert.equal(r[0].actualEps,null);
  assert.equal(r[0].surprisePercent,null);
  assert.equal(r[1].timing,"pre_market");
  assert.equal(r[1].surprisePercent,100);
});
test("refuses malformed and duplicate events",()=>{
 assert.throws(()=>parseEodhdEarnings({error:"Not entitled"}),/earnings array/);
 const r=parseEodhdEarnings({earnings:[
  {code:"AAOI.US",report_date:"2026-11-05",actual:1},
  {code:"AAOI.US",report_date:"2026-11-05",actual:1},
  {code:"AAOI.MOON",report_date:"2026-11-05"},
  {code:"BAD.US",report_date:"invalid"},
  {code:"BAD.US",report_date:"2026-02-31"}
 ]});
 assert.equal(r.length,1);
});
test("does not calculate surprises or invent consensus from actuals alone",()=>{
 const r=parseEodhdEarnings({earnings:[{code:"AAPL.US",report_date:"2026-11-05",actual:1.9,estimate:null,percent:9}]});
 assert.equal(r[0].surprisePercent,null);
 assert.equal(r[0].estimatedEps,null);
});
