import test from "node:test";
import assert from "node:assert/strict";
import {STATEMENT_METRICS,computePiotroski,computeMagicFormulaRaw} from "@/lib/opportunity/fundamental-models";

test("SEC source audit only requests statement codes actually consumed by existing financial models",()=>{
 const required=[
  "netIncome","operatingCashFlow","totalAssets","revenue","longTermDebt",
  "currentAssets","currentLiabilities","sharesOutstanding","grossProfit",
  "ebit","totalDebt","cashAndEquivalents","netFixedAssets",
 ] as const;
 assert.deepEqual(new Set(required.map(k=>STATEMENT_METRICS[k])).size,13);
 assert.equal(STATEMENT_METRICS.ebit,"STMT_EBIT");
 assert.equal(STATEMENT_METRICS.totalDebt,"STMT_TOTAL_DEBT");
 assert.equal(STATEMENT_METRICS.sharesOutstanding,"STMT_WEIGHTED_AVG_SHARES");
});
test("no EBIT and no total debt makes Magic Formula ineligible, not zero-earnings-yield",()=>{
 const period={periodEnd:"2025-12-31",knownAt:"2026-03-01T00:00:00Z",
  revision:1,isRestatement:false,values:{
   currentAssets:40,currentLiabilities:20,netFixedAssets:30,
   cashAndEquivalents:10,
  }};
 const result=computeMagicFormulaRaw({
  assetId:"sample",industryId:null,industryCode:"SEC_IND",period,marketCap:100,
 });
 assert.equal(result.eligible,false);
 assert.match(result.exclusionReason??" ",/EBIT.*capital inputs are missing/);
 assert.equal(result.returnOnCapital,null);
 assert.equal(result.earningsYield,null);
});
test("Piotroski cannot be labelled complete when gross-profit measures are missing",()=>{
 const raw=(periodEnd:string)=>({
  periodEnd,knownAt:"2026-03-01T00:00:00Z",revision:1,isRestatement:false,
  values:{
   netIncome:10,operatingCashFlow:12,totalAssets:100,revenue:75,
   longTermDebt:20,currentAssets:50,currentLiabilities:25,sharesOutstanding:10,
  },
 });
 const result=computePiotroski([
  raw("2025-12-31"),raw("2024-12-31"),raw("2023-12-31"),
 ]);
 assert.equal(result.complete,false);
 assert.equal(result.score,null);
 assert.ok(result.tests.some(x=>x.key==="higherGrossMargin"&&x.passed===null));
});
test("financial institutions are ineligible for generic Magic Formula when mapped",()=>{
 const result=computeMagicFormulaRaw({
  assetId:"bank",industryId:"known",industryCode:"SEC_FIN",period:null,marketCap:null,
 });
 assert.equal(result.eligible,false);
 assert.match(result.exclusionReason??" ",/Financials/);
});
