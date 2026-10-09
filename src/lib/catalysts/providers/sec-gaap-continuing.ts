/**
 * Conservative source adapter for SEC EDGAR CompanyFacts.
 * IMPORTANT: uses only direct us-gaap:IncomeLossFromContinuingOperations
 * USD QUARTER facts and SEC submissions accession acceptance timestamps.
 * Never equate company-wide NetIncomeLoss with continuing-operations income.
 * Missing Q4, custom XBRL tags, non-calendar filers or USD facts => unknown.
 */
export const SEC_GAAP_EVIDENCE_VERSION="sec.companyfacts.continuing-income.v0.1";
export interface SecCompanyFacts {
  cik?:unknown;
  facts?:{["us-gaap"]?:Record<string,unknown>};
}
export interface SecQuarterIncome {
  start:string;end:string;valueUsd:number;
  accession:string;form:string;acceptedAt:string;sourceUrl:string;
}
export interface SecGaapProfitability {
  state:"complete_direct_quarters"|"insufficient"|"ambiguous";
  latestQuarterUsd:number|null;
  trailingFourQuarterUsd:number|null;
  quarterFacts:SecQuarterIncome[];
  earliestAcceptedAt:string|null;
  latestAcceptedAt:string|null;
  providerVersion:string;
  explanation:string;
  /** These are evidence observations, NOT an eligibility approval. */
  requiresIndependentReview:true;
}
interface RawFact { start?:unknown;end?:unknown;val?:unknown;accn?:unknown;form?:unknown;frame?:unknown; }
const accessionPattern=/^\d{10}-\d{2}-\d{6}$/;
function iso(value:string):boolean{
 return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
 &&Number.isFinite(Date.parse(value));
}
function dateOnly(value:unknown):value is string{
 return typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)
 &&new Date(value+"T00:00:00Z").toISOString().slice(0,10)===value;
}
function quarterDuration(start:string,end:string):boolean{
 const days=(Date.parse(end+"T00:00:00Z")-Date.parse(start+"T00:00:00Z"))/86_400_000+1;
 return Number.isFinite(days)&&days>=65&&days<=115;
}
function unknown(state:SecGaapProfitability["state"],message:string):SecGaapProfitability{
 return {state,latestQuarterUsd:null,trailingFourQuarterUsd:null,quarterFacts:[],
   earliestAcceptedAt:null,latestAcceptedAt:null,providerVersion:SEC_GAAP_EVIDENCE_VERSION,
   explanation:message,requiresIndependentReview:true};
}
export function extractSecGaapContinuingIncome(
  facts:SecCompanyFacts,acceptedAtByAccession:Record<string,string>,
  asOf:Date=new Date(),
):SecGaapProfitability {
  const cik=facts.cik;
  if(!Number.isSafeInteger(cik)||Number(cik)<=0)
    return unknown("insufficient","Missing valid SEC CIK.");
  const concept=facts.facts?.["us-gaap"]?.IncomeLossFromContinuingOperations as
    {units?:{USD?:RawFact[]}}|undefined;
  const items=concept?.units?.USD;
  if(!Array.isArray(items))return unknown("insufficient",
    "No direct us-gaap IncomeLossFromContinuingOperations in USD; manual issuer accounting review required.");
  if(items.length>5000)return unknown("ambiguous","Unexpectedly large SEC fact series.");
  const cutoff=asOf.getTime();
  const byQuarter=new Map<string,SecQuarterIncome>();
  for(const fact of items){
    if(!dateOnly(fact.start)||!dateOnly(fact.end)||!quarterDuration(fact.start,fact.end)||
       typeof fact.frame!=="string"||!/^CY20\d{2}Q[1-4]$/.test(fact.frame)||
       typeof fact.val!=="number"||!Number.isFinite(fact.val)||
       typeof fact.accn!=="string"||!accessionPattern.test(fact.accn)||
       !["10-Q","10-Q/A","10-K","10-K/A"].includes(String(fact.form)))continue;
    const accepted=acceptedAtByAccession[fact.accn];
    if(!accepted||!iso(accepted)||Date.parse(accepted)>cutoff||
       Date.parse(accepted)<Date.parse(fact.end+"T00:00:00Z"))continue;
    const current:SecQuarterIncome={start:fact.start,end:fact.end,valueUsd:fact.val,
      accession:fact.accn,form:String(fact.form),acceptedAt:accepted,
      sourceUrl:"https://www.sec.gov/Archives/edgar/data/"+Number(cik)+"/"+fact.accn.replaceAll("-","")+"/"};
    const key=fact.frame;
    const previous=byQuarter.get(key);
    if(!previous||Date.parse(accepted)>Date.parse(previous.acceptedAt))byQuarter.set(key,current);
    else if(previous.acceptedAt===accepted&&previous.valueUsd!==fact.val)
      return unknown("ambiguous","Conflicting facts at the same SEC filing acceptance time.");
  }
  const sorted=[...byQuarter.values()].sort((a,b)=>b.end.localeCompare(a.end));
  const recent=sorted.slice(0,4);
  if(recent.length<4)return unknown("insufficient",
    "Fewer than four distinct directly reported quarterly continuing-income facts were accepted by the cutoff.");
  for(let i=0;i<3;i++){
    const gap=(Date.parse(recent[i].end+"T00:00:00Z")-
      Date.parse(recent[i+1].end+"T00:00:00Z"))/86_400_000;
    if(gap<70||gap>110||recent[i+1].end>=recent[i].start)
      return unknown("insufficient","Quarter observations are missing, nonconsecutive or overlap.");
  }
  const sum=recent.reduce((total,f)=>total+f.valueUsd,0);
  if(!Number.isFinite(sum))return unknown("ambiguous","Invalid USD aggregation.");
  const ordered=[...recent].sort((a,b)=>a.acceptedAt.localeCompare(b.acceptedAt));
  return {state:"complete_direct_quarters",
    latestQuarterUsd:recent[0].valueUsd,trailingFourQuarterUsd:sum,
    quarterFacts:recent,
    earliestAcceptedAt:ordered[0].acceptedAt,latestAcceptedAt:ordered.at(-1)!.acceptedAt,
    providerVersion:SEC_GAAP_EVIDENCE_VERSION,
    explanation:"Four direct dated continuing-operations facts; separate human GAAP/issuer review required. Missing/custom-tag companies stay unknown.",
    requiresIndependentReview:true};
}
