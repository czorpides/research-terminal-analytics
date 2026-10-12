import test from "node:test";
import assert from "node:assert/strict";
import {annualRDRollforward,originalSecResearchComparison,SIX_YEAR_ORIGINAL_RD} from "./rd-rollforward-third-issuer.ts";

test("three distinct original SEC software issuers have continuous six-year historical R&D",()=>{
 const exact:Record<string,string[]>={
  ADBE:["2188","2540","2987","3473","3944","4294"],
  ADSK:["932","1115","1219","1373","1485","1643"],
  NOW:["1024","1397","1768","2124","2543","2960"],
 };
 for(const sym of ["ADBE","ADSK","NOW"] as const){
  const source=SIX_YEAR_ORIGINAL_RD[sym];
  assert.equal(source.cohorts.length,6);
  assert.deepEqual(source.cohorts.map(c=>c.expenseMillions),exact[sym]);
  assert.deepEqual(source.cohorts.map(x=>x.fiscalYear),
   Array.from({length:6},(_,i)=>source.fiscalYear-5+i));
  assert.equal(new Set(source.cohorts.map(c=>c.original10k)).size,2);
  assert.ok(source.cohorts.every(c=>c.original10k.includes("www.sec.gov/Archives/edgar/")));
 }
 assert.equal(SIX_YEAR_ORIGINAL_RD.NOW.fiscalYear,2025);
});
const samples=[
 ["ADBE",2,"5680.500000","3708.500000","6266.000000","9291.500000"],
 ["ADBE",3,"7255.000000","3468.000000","8081.000000","9532.000000"],
 ["ADBE",5,"9968.200000","3026.400000","11235.800000","9973.600000"],
 ["ADSK",2,"2171.500000","1429.000000","2385.500000","1792.000000"],
 ["ADSK",3,"2806.666667","1359.000000","3090.666667","1862.000000"],
 ["ADSK",5,"3947.200000","1224.800000","4365.400000","1996.200000"],
 ["NOW",2,"3605.000000","2333.500000","4231.500000","2450.500000"],
 ["NOW",3,"4548.333333","2145.000000","5363.333333","2639.000000"],
 ["NOW",5,"6066.600000","1771.200000","7255.400000","3012.800000"],
] as const;
test("2/3/5-year rollforward opening + annual addition - FY amortization = closing (exact six-decimal USDm)",()=>{
 for(const [issuer,life,opening,amort,closing,adj] of samples){
  const r=annualRDRollforward(issuer,life);
  assert.equal(r.openingAssetMillions,opening);
  assert.equal(r.assumedAnnualAmortisationMillions,amort);
  assert.equal(r.closingAssetMillions,closing);
  assert.equal(r.illustrativeAdjustedAnnualOperatingIncomeMillions,adj);
  const m=(s:string)=>BigInt(s.replace(".",""));
  assert.equal(m(r.openingAssetMillions)+BigInt(r.researchAdditionMillions)*1000000n-
   m(r.assumedAnnualAmortisationMillions),m(r.closingAssetMillions));
  assert.equal(m(r.illustrativeAdjustedAnnualOperatingIncomeMillions),
   BigInt(r.reportedGAAPOperatingIncomeMillions)*1000000n+
   BigInt(r.researchAdditionMillions)*1000000n-m(r.assumedAnnualAmortisationMillions));
  assert.equal(r.identityVerified,true);
  assert.equal(r.otherEconomicCapitalUnreconciled,true);
  assert.equal(r.adjustedReturnOnCapital,null);
  assert.equal(r.approvedForScoring,false);
  assert.equal(r.storedChanges,0);
 }
});
test("5-year genuine original issuer cohort history exists, previous phase missing-value issue addressed",()=>{
 assert.equal(annualRDRollforward("ADBE",5).closingAssetMillions,"11235.800000");
 assert.equal(annualRDRollforward("ADSK",5).closingAssetMillions,"4365.400000");
 assert.equal(annualRDRollforward("NOW",5).closingAssetMillions,"7255.400000");
 assert.equal(annualRDRollforward("ADBE",5).sourceOriginalAnnualCohorts[0].fiscalYear,2020);
 assert.equal(annualRDRollforward("ADSK",5).sourceOriginalAnnualCohorts[0].fiscalYear,2021);
});
test("ServiceNow independent holdout annual GAAP income and FY report kept distinct from Adobe/Autodesk",()=>{
 const now=annualRDRollforward("NOW",5);
 assert.equal(now.fiscalYear,2025);
 assert.equal(now.revenueMillions,"13278");
 assert.equal(now.reportedGAAPOperatingIncomeMillions,"1824");
 assert.ok(now.sourceOriginalAnnualCohorts.every(x=>x.original10k.includes("1373715")));
 assert.equal(now.adjustedTTMEarnings,null);
 assert.equal(now.adjustedReturnOnCapital,null);
 assert.equal(now.approvedForIssuerComparisons,false);
});
test("invalid useful life and issuer cannot sneak into review or ranking",()=>{
 assert.throws(()=>annualRDRollforward("NOW",1 as never),/Invalid issuer or life/);
 assert.throws(()=>annualRDRollforward("MSFT" as never,5),/Invalid issuer or life/);
 const c=originalSecResearchComparison();
 assert.equal(c.studies.length,9);
 assert.equal(c.reviewerAttested,false);
 assert.equal(c.modelEligible,false);
 assert.equal(c.scoringEligible,false);
 assert.equal(c.storedChanges,0);
 assert.ok(c.studies.every(q=>q.notRestatedGAAP&&q.onlyAnnualFYNotTTM));
});
