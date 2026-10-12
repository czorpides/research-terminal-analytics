/**
 * 2J17, research only. Source: original issuer SEC annual 10-Ks, USD millions.
 * Full-year R&D capitalized at year-end; amortized equally over FOLLOWING L
 * fiscal years. This is an experimental model, not reported GAAP, a booked
 * intangible, or a reviewed Magic Formula ROC.
 */
export const RD_ROLLFORWARD_POLICY="sec.research.rd_rollforward.v1.draft" as const;
export type SoftwareHoldout="ADBE"|"ADSK"|"NOW";
export type AnnualRAndD={fiscalYear:number;expenseMillions:string;original10k:string};
type Issuer={
 name:string;fiscalYear:number;periodEnd:string;
 revenueMillions:string;gaapOperatingIncomeMillions:string;
 fiscalIncome10K:string;cohorts:AnnualRAndD[];
};
const A20="https://www.sec.gov/Archives/edgar/data/796343/000079634323000007/adbe-20221202.htm";
const A25="https://www.sec.gov/Archives/edgar/data/796343/000079634326000003/adbe-20251128.htm";
const D23="https://www.sec.gov/Archives/edgar/data/769397/000076939723000036/adsk-20230131.htm";
const D26="https://www.sec.gov/Archives/edgar/data/769397/000076939726000015/adsk-20260131.htm";
const N22="https://www.sec.gov/Archives/edgar/data/1373715/000137371523000035/now-20221231.htm";
const N25="https://www.sec.gov/Archives/edgar/data/1373715/000137371526000007/now-20251231.htm";
const series=(base:number,a:readonly string[],older:string,newer:string):AnnualRAndD[]=>a.map((v,i)=>({
 fiscalYear:base+i,expenseMillions:v,original10k:i<3?older:newer,
}));
export const SIX_YEAR_ORIGINAL_RD:Record<SoftwareHoldout,Issuer>={
 ADBE:{name:"Adobe Inc.",fiscalYear:2025,periodEnd:"2025-11-28",
  revenueMillions:"23769",gaapOperatingIncomeMillions:"8706",fiscalIncome10K:A25,
  cohorts:series(2020,["2188","2540","2987","3473","3944","4294"],A20,A25)},
 ADSK:{name:"Autodesk, Inc.",fiscalYear:2026,periodEnd:"2026-01-31",
  revenueMillions:"7206",gaapOperatingIncomeMillions:"1578",fiscalIncome10K:D26,
  cohorts:series(2021,["932","1115","1219","1373","1485","1643"],D23,D26)},
 NOW:{name:"ServiceNow, Inc.",fiscalYear:2025,periodEnd:"2025-12-31",
  revenueMillions:"13278",gaapOperatingIncomeMillions:"1824",fiscalIncome10K:N25,
  cohorts:series(2020,["1024","1397","1768","2124","2543","2960"],N22,N25)},
};
const money=(v:string):bigint=>{
 if(!/^(0|[1-9]\d*)$/.test(v))throw Error("Invalid exact original SEC R&D USD millions");
 return BigInt(v);
};
const micro=(numerator:bigint,denominator:bigint)=>(
 numerator*1000000n+denominator/2n)/denominator;
const renderMicro=(m:bigint)=>{
 const neg=m<0n?"-":"";
 const abs=m<0n?-m:m;
 return neg+(abs/1000000n).toString()+"."+(abs%1000000n).toString().padStart(6,"0");
};
const roundedBps=(n:bigint,d:bigint)=>{
 if(d<=0n)throw Error("Invalid profitability denominator");
 return ((n*10000n+d/2n)/d).toString();
};
export type RDRollforward={
 issuer:SoftwareHoldout;fiscalYear:number;fiscalPeriodEnd:string;
 asOf:"2026-10-09T20:00:00Z";policyVersion:typeof RD_ROLLFORWARD_POLICY;
 hypotheticalResearchLife:2|3|5;
 sourceOriginalAnnualCohorts:AnnualRAndD[];
 openingAssetMillions:string;
 researchAdditionMillions:string;
 assumedAnnualAmortisationMillions:string;
 closingAssetMillions:string;
 reportedGAAPOperatingIncomeMillions:string;
 illustrativeAdjustedAnnualOperatingIncomeMillions:string;
 reportedGAAPOperatingMarginBps:string;
 illustrativeAdjustedOperatingMarginBps:string;
 revenueMillions:string;
 identityVerified:true;
 yearEndRecognitionAssumption:true;
 notRestatedGAAP:true;
 onlyAnnualFYNotTTM:true;
 otherEconomicCapitalUnreconciled:true;
 adjustedTTMEarnings:null;adjustedReturnOnCapital:null;
 approvedForIssuerComparisons:false;approvedForScoring:false;storedChanges:0;
};
export function annualRDRollforward(issuer:SoftwareHoldout,life:2|3|5):RDRollforward{
 const d=SIX_YEAR_ORIGINAL_RD[issuer];
 if(!d||![2,3,5].includes(life))throw Error("Invalid issuer or life for controlled R&D study");
 if(d.cohorts.length!==6||d.cohorts.some((c,i)=>c.fiscalYear!==d.fiscalYear-5+i)||
  d.cohorts.some(c=>!c.original10k.startsWith("https://www.sec.gov/Archives/edgar/data/"))||
  d.fiscalIncome10K!==d.cohorts[5].original10k)
  throw Error("Original non-overlapping six-year FY SEC sequence not complete");
 const prior=d.cohorts.slice(5-life,5);
 if(prior.length!==life)throw Error("Missing opening R&D vintage");
 const current=money(d.cohorts[5].expenseMillions);
 // Before FY t: prior annual cohorts oldest..latest weighted 1/L..L/L.
 const openingNumerator=prior.reduce((sum,v,i)=>sum+
  money(v.expenseMillions)*BigInt(i+1),0n);
 const amortNumerator=prior.reduce((sum,v)=>sum+money(v.expenseMillions),0n);
 const impliedClosingNumerator=openingNumerator+current*BigInt(life)-amortNumerator;
 const closingByCohorts=current*BigInt(life)+prior.slice(1).reduce((sum,v,i)=>
  sum+money(v.expenseMillions)*BigInt(i+1),0n);
 if(impliedClosingNumerator!==closingByCohorts||impliedClosingNumerator<0n)
  throw Error("Original annual R&D amortisation identity failed");
 const openingMicro=micro(openingNumerator,BigInt(life));
 const amortMicro=micro(amortNumerator,BigInt(life));
 // Force exact displayed cash-like rollforward; rounding difference from
 // independently rounded cohort model cannot exceed 1 USD.
 const closingMicro=openingMicro+current*1000000n-amortMicro;
 const theoreticalClosing=micro(impliedClosingNumerator,BigInt(life));
 if(closingMicro<0n||
  (closingMicro>theoreticalClosing?closingMicro-theoreticalClosing:
   theoreticalClosing-closingMicro)>1n)
  throw Error("Fractional annual R&D amortisation reconciliation error");
 const gaap=money(d.gaapOperatingIncomeMillions),revenue=money(d.revenueMillions);
 const adjustedMicro=gaap*1000000n+current*1000000n-amortMicro;
 if(adjustedMicro<=0n)throw Error("Nonpositive hypothetical operating earnings");
 return {
  issuer,fiscalYear:d.fiscalYear,fiscalPeriodEnd:d.periodEnd,asOf:"2026-10-09T20:00:00Z",
  policyVersion:RD_ROLLFORWARD_POLICY,hypotheticalResearchLife:life,
  sourceOriginalAnnualCohorts:d.cohorts,
  openingAssetMillions:renderMicro(openingMicro),
  researchAdditionMillions:current.toString(),
  assumedAnnualAmortisationMillions:renderMicro(amortMicro),
  closingAssetMillions:renderMicro(closingMicro),
  reportedGAAPOperatingIncomeMillions:gaap.toString(),
  illustrativeAdjustedAnnualOperatingIncomeMillions:renderMicro(adjustedMicro),
  reportedGAAPOperatingMarginBps:roundedBps(gaap,revenue),
  illustrativeAdjustedOperatingMarginBps:roundedBps(adjustedMicro,revenue*1000000n),
  revenueMillions:revenue.toString(),identityVerified:true,
  yearEndRecognitionAssumption:true,notRestatedGAAP:true,onlyAnnualFYNotTTM:true,
  otherEconomicCapitalUnreconciled:true,adjustedTTMEarnings:null,adjustedReturnOnCapital:null,
  approvedForIssuerComparisons:false,approvedForScoring:false,storedChanges:0,
 };
}
export function originalSecResearchComparison(){
 const studies=(["ADBE","ADSK","NOW"] as const).flatMap(symbol=>
  ([2,3,5] as const).map(life=>annualRDRollforward(symbol,life)));
 return {
  policyVersion:RD_ROLLFORWARD_POLICY,
  studies,
  warning:"Two FY2025 reporters (Adobe/ServiceNow) vs one FY2026 reporter (Autodesk). Annual GAAP adjusted earnings only; TTM and all sector-level ROIC remain unavailable.",
  reviewerAttested:false as const,modelEligible:false as const,
  scoringEligible:false as const,storedChanges:0 as const,
 };
}
