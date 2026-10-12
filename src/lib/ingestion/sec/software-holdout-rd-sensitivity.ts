/**
 * Phase 2J16: source-anchored SECOND issuer software holdout.
 *
 * Genuine original SEC 10-K/10-Q line items manually transcribed and
 * cross-footed, NOT independent human auditor sign-off. All figures USD m.
 * Autodesk is a held-out issuer, NOT an original ledger approved 2J11 issuer.
 * Never feed these values to the opportunity engine, model store, or Radar.
 */
import {evaluateSecEconomicCapitalDraft} from "./economic-capital-comparability-draft.ts";
export const SEC_2J16_VERSION="sec.research.software_holdout_rd_stress.draft.v1.0.0" as const;
export const SEC_2J16_ASOF="2026-10-09T20:00:00Z" as const;
const autodesk={
 issuer:"Autodesk, Inc.",cik:769397,
 fy:{accession:"0000769397-26-000015",filed:"2026-03-03",end:"2026-01-31",
  source:"https://www.sec.gov/Archives/edgar/data/769397/000076939726000015/adsk-20260131.htm",
  revenue:"7206",operatingIncome:"1578",rnd:"1643",cfo:"2452",sbc:"788"},
 interim:{accession:"0000769397-26-000061",filed:"2026-08-28",end:"2026-07-31",
  source:"https://www.sec.gov/Archives/edgar/data/769397/000076939726000061/adsk-20260731.htm",
  ytdCurrent:{revenue:"3980",operatingIncome:"1140",rnd:"885",cfo:"1468",sbc:"339"},
  ytdPrior:{revenue:"3396",operatingIncome:"677",rnd:"807",cfo:"1024",sbc:"421"},
  balance:{currentAssets:"5670",currentLiabilities:"6628",deferredRevenueCurrent:"4036",
   cash:"4098",shortTermInvestments:"57",longTermInvestments:"202",
   currentShortTermDebt:"994",currentNotes:"499",longTermNotes:"1985",
   operatingLeaseCurrent:"52",operatingLeaseNoncurrent:"175",
   netTangibleFixedAssets:"124"}},
 annualRAndD:[
  {fiscalYear:2024,expenseMillions:"1373",sourceYear:"FY2026 original 10-K 3-year statement"},
  {fiscalYear:2025,expenseMillions:"1485",sourceYear:"FY2026 original 10-K 3-year statement"},
  {fiscalYear:2026,expenseMillions:"1643",sourceYear:"FY2026 original 10-K 3-year statement"},
 ],
} as const;
const adobeRD=[
 {fiscalYear:2023,expenseMillions:"3473",sourceYear:"FY2025 original 10-K 3-year statement"},
 {fiscalYear:2024,expenseMillions:"3944",sourceYear:"FY2025 original 10-K 3-year statement"},
 {fiscalYear:2025,expenseMillions:"4294",sourceYear:"FY2025 original 10-K 3-year statement"},
] as const;
const adobeFY="https://www.sec.gov/Archives/edgar/data/796343/000079634326000003/adbe-20251128.htm";
export type SoftwareIssuer="ADBE"|"ADSK";
export type TtmFinancials={
 issuer:SoftwareIssuer;fySourceUrl:string;interimSourceUrl:string;
 fiscalEnd:string;interimEnd:string;knownAsOf:string;
 ttm:{revenueMillions:string;operatingIncomeMillions:string;
  rndMillions:string;operatingCashFlowMillions:string;sbcAddbackMillions:string;
  cashFlowLessSbcMillions:string;operatingMarginBps:string;rAndDIntensityBps:string;
  operatingCashFlowToOperatingIncomeBps:string};
 latestBalance:{
  currentAssetsMillions:string|null;currentLiabilitiesMillions:string|null;
  deferredRevenueCurrentMillions:string|null;
  notesAndOtherDebtCarryingMillions:string|null;
  operatingLeaseTotalMillions:string|null;
  cashAndShortInvestmentsMillions:string|null;
 };
 sourceChecks:{name:string;actualMillions:string;expectedMillions:string;passed:boolean}[];
 capitalReturnEligible:false;independentSecondHumanReview:false;
};
const number=(v:string):bigint=>{
 if(!/^(0|[1-9]\d*)$/.test(v))throw Error("Original SEC filing numbers must be exact unsigned USD millions");
 return BigInt(v);
};
const p=(num:bigint,den:bigint):string=>{
 if(den<=0n)throw Error("Invalid denominator");
 return ((num*10000n+den/2n)/den).toString();
};
export function getSoftwareSourceHoldout(symbol:SoftwareIssuer):TtmFinancials{
 const isAdsk=symbol==="ADSK";
 const adobe=evaluateSecEconomicCapitalDraft("ADBE");
 const known=adobe.software;
 if(!known)throw Error("Adobe GAAP software baseline unavailable");
 if(autodesk.fy.filed>SEC_2J16_ASOF.slice(0,10)||
    autodesk.interim.filed>SEC_2J16_ASOF.slice(0,10)||
    adobe.asOf!==SEC_2J16_ASOF||
    autodesk.interim.end<=autodesk.fy.end)throw Error("Original source not yet public at valuation date");
 const fy=autodesk.fy,ytd=autodesk.interim;
 const data=isAdsk?[
  ["revenue",fy.revenue,ytd.ytdCurrent.revenue,ytd.ytdPrior.revenue,"7790"],
  ["operatingIncome",fy.operatingIncome,ytd.ytdCurrent.operatingIncome,ytd.ytdPrior.operatingIncome,"2041"],
  ["rnd",fy.rnd,ytd.ytdCurrent.rnd,ytd.ytdPrior.rnd,"1721"],
  ["cfo",fy.cfo,ytd.ytdCurrent.cfo,ytd.ytdPrior.cfo,"2896"],
  ["sbc",fy.sbc,ytd.ytdCurrent.sbc,ytd.ytdPrior.sbc,"706"],
 ] as const:[
  ["revenue","23769","19776","17575",known.ttmRevenueMillions],
  ["operatingIncome","8706","7010","6445",known.ttmOperatingIncomeMillions],
  ["rnd","4294","3596","3196",known.ttmResearchDevelopmentMillions],
  ["cfo","10031","7646","6871",known.ttmOperatingCashFlowMillions],
  ["sbc","1942","1582","1453",known.ttmStockBasedCompensationMillions],
 ] as const;
 const checks=data.map(([name,a,b,c,expected])=>{
  const actual=(number(a)+number(b)-number(c)).toString();
  return {name,actualMillions:actual,expectedMillions:expected,passed:actual===expected};
 });
 if(checks.some(x=>!x.passed))throw Error("Holdout original issuer SEC FY-plus-YTD bridge not reconciled");
 const n=(key:string)=>number(checks.find(x=>x.name===key)!.actualMillions);
 const e=n("operatingIncome"),rev=n("revenue"),rnd=n("rnd"),cfo=n("cfo"),sbc=n("sbc");
 if(sbc>cfo)throw Error("Invalid cash-flow addback");
 const balance=isAdsk?autodesk.interim.balance:null;
 const d=balance?(number(balance.currentShortTermDebt)+
  number(balance.currentNotes)+number(balance.longTermNotes)):null;
 const lease=balance?(number(balance.operatingLeaseCurrent)+number(balance.operatingLeaseNoncurrent)):null;
 const currentLiquid=balance?(number(balance.cash)+number(balance.shortTermInvestments)):null;
 const b=isAdsk?{
   currentAssetsMillions:balance!.currentAssets,currentLiabilitiesMillions:balance!.currentLiabilities,
   deferredRevenueCurrentMillions:balance!.deferredRevenueCurrent,
   notesAndOtherDebtCarryingMillions:d!.toString(),
   operatingLeaseTotalMillions:lease!.toString(),
   cashAndShortInvestmentsMillions:currentLiquid!.toString(),
 }: {
   currentAssetsMillions:adobe.liquidity.observedLiquidAssetsMillions===undefined?null:"9158",
   currentLiabilitiesMillions:"11888",
   deferredRevenueCurrentMillions:"7094",
   notesAndOtherDebtCarryingMillions:adobe.financing.nonleaseBorrowingCarryingMillions,
   operatingLeaseTotalMillions:adobe.financing.operatingLeaseExcludedMillions,
   cashAndShortInvestmentsMillions:adobe.liquidity.observedLiquidAssetsMillions,
 };
 if(isAdsk){
  if(d!==3478n||lease!==227n||currentLiquid!==4155n||number(balance!.currentAssets)!==5670n||
     number(balance!.currentLiabilities)!==6628n||
     number(balance!.deferredRevenueCurrent)!==4036n)throw Error("Holdout issuer debt/cash/operating liabilities out of balance");
 }
 return {
  issuer:symbol,
  fySourceUrl:isAdsk?autodesk.fy.source:adobeFY,
  interimSourceUrl:isAdsk?autodesk.interim.source:"https://www.sec.gov/Archives/edgar/data/796343/000079634326000156/adbe-20260828.htm",
  fiscalEnd:isAdsk?autodesk.fy.end:"2025-11-28",
  interimEnd:isAdsk?autodesk.interim.end:"2026-08-28",knownAsOf:SEC_2J16_ASOF,
  ttm:{revenueMillions:rev.toString(),operatingIncomeMillions:e.toString(),
   rndMillions:rnd.toString(),operatingCashFlowMillions:cfo.toString(),
   sbcAddbackMillions:sbc.toString(),cashFlowLessSbcMillions:(cfo-sbc).toString(),
   operatingMarginBps:p(e,rev),rAndDIntensityBps:p(rnd,rev),
   operatingCashFlowToOperatingIncomeBps:p(cfo,e)},
  latestBalance:b,sourceChecks:checks,
  capitalReturnEligible:false,independentSecondHumanReview:false,
 };
}

export type RDScenario={
 years:2|3|5;status:"mechanical_stock_only"|"missing_historical_cohorts";
 cohortSchedule:Array<{year:number;source:string;expenseMillions:string}>;
 totalReportedRDMillions:string|null;
 conditionalUnamortisedAssetMillions:string|null;
 ignoredPriorYearIncomeAmortisation:true;
 adjustedOperatingIncomeMillions:null;
 adjustedROCBps:null;comparableToReportedGAAP:false;rankingEligible:false;
};
export type RDReview={
 issuer:SoftwareIssuer;fiscalYearEnd:string;policyVersion:typeof SEC_2J16_VERSION;
 originalAnnualSourceUrl:string;
 ttmBasisNonoverlappingWithAnnualCohorts:false;
 methods:RDScenario[];
 softwareROCCertified:false;
 storedChanges:0;
};
const fixed6=(n:bigint,d:bigint):string=>{
 const scaled=(n*1000000n+d/2n)/d;
 return (scaled/1000000n).toString()+"."+(scaled%1000000n).toString().padStart(6,"0");
};
/** Year-end recognition convention:
 * newest FY R&D cohort weight 1; each earlier full FY cohort weight (L-k)/L.
 * Does NOT reconstruct the in-year amortisation of previously unobserved
 * cohorts, especially for 5 years: ADJUSTED EBIT AND ROC STAY NULL.
 * Latest TTM overlaps the last FY; never capitalise TTM as a new cohort.
 */
export function getRDPolicyStress(symbol:SoftwareIssuer):RDReview{
 const annual=symbol==="ADSK"?autodesk.annualRAndD:adobeRD;
 const latest=annual[annual.length-1];
 const all=annual.map(x=>({year:x.fiscalYear,source:x.sourceYear,expenseMillions:x.expenseMillions}));
 const methods=([2,3,5] as const).map(years=>{
  const subset=all.slice(-years);
  const complete=subset.length===years &&
   subset.every((c,i)=>c.year===latest.fiscalYear-years+1+i);
  if(!complete)return {
   years,status:"missing_historical_cohorts" as const,
   cohortSchedule:subset,totalReportedRDMillions:null,
   conditionalUnamortisedAssetMillions:null,
   ignoredPriorYearIncomeAmortisation:true as const,
   adjustedOperatingIncomeMillions:null,adjustedROCBps:null,
   comparableToReportedGAAP:false as const,rankingEligible:false as const,
  };
  const total=subset.reduce((a,c)=>a+number(c.expenseMillions),0n);
  const weighted=subset.reduce((a,c)=>
   a+number(c.expenseMillions)*BigInt(c.year-(latest.fiscalYear-years)),0n);
  return {
   years,status:"mechanical_stock_only" as const,cohortSchedule:subset,
   totalReportedRDMillions:total.toString(),
   conditionalUnamortisedAssetMillions:fixed6(weighted,BigInt(years)),
   ignoredPriorYearIncomeAmortisation:true as const,
   adjustedOperatingIncomeMillions:null,adjustedROCBps:null,
   comparableToReportedGAAP:false as const,rankingEligible:false as const,
  };
 });
 return {issuer:symbol,fiscalYearEnd:symbol==="ADSK"?"2026-01-31":"2025-11-28",
  policyVersion:SEC_2J16_VERSION,
  originalAnnualSourceUrl:symbol==="ADSK"?autodesk.fy.source:adobeFY,
  ttmBasisNonoverlappingWithAnnualCohorts:false,
  methods,softwareROCCertified:false,storedChanges:0};
}
