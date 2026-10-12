/**
 * Phase 2J7 read-only direct SEC CompanyFacts candidate extractor.
 *
 * A candidate is NOT a model-ready EBIT or EV debt value. Never blend
 * concept tags with inconsistent accounting definitions; reject ambiguous
 * accession matches, conflicting tags, periods or fiscal units.
 */
export type SecConceptValue={accn?:string;form?:string;end?:string;start?:string;val?:number;filed?:string};
export type SecConcept={units?:Record<string,SecConceptValue[]>};
export type SecGaap=Record<string,SecConcept>;
export type ExtractedCandidate={
  kind:"operating_income"|"borrowings_excluding_leases"|"period_end_shares";
  status:"candidate"|"unavailable"|"ambiguous"|"requires_accounting_review";
  amount:string|null;currencyOrUnit:"USD"|"shares";
  originalAccession:string;originalPeriod:string;
  components:Array<{tag:string;value:string}>;
  caveats:string[];
  scoringEligible:false;
  modelEligible:false;
};
export interface SecOriginalContext {
  accession:string;periodEnd:string;filedDate:string;
  sector:"nonfinancial"|"financial"|"reit"|"utility"|"unclassified";
}
type PickResult={status:"found"|"missing"|"ambiguous";tag?:string;value?:bigint};
const USD="USD",SHARES="shares";
const opTag=["OperatingIncomeLoss"];
const currentBorrowingTags=[
  "LongTermDebtCurrent","LongTermDebtAndCapitalLeaseObligationsCurrent",
  "ShortTermBorrowings","ShortTermDebtCurrent","CommercialPaper",
];
const longBorrowingTags=[
  "LongTermDebtNoncurrent","LongTermDebtAndCapitalLeaseObligations",
];
const datedSharesTags=["CommonStockSharesOutstanding"];
const iso=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&
  !Number.isNaN(Date.parse(s+"T00:00:00Z"))&&
  new Date(s+"T00:00:00Z").toISOString().startsWith(s);
const annual=(start:string,end:string)=>{
  if(!iso(start)||!iso(end))return false;
  const days=(Date.parse(end)-Date.parse(start))/86400000;
  return days>=330&&days<=400;
};
const toInteger=(x:number)=>Number.isSafeInteger(x)?BigInt(x):null;
function directTag(gaap:SecGaap,tag:string,unit:string,context:SecOriginalContext,duration:boolean):PickResult {
  const matched=(gaap[tag]?.units?.[unit]??[]).filter(v=>
    v.accn===context.accession&&v.form==="10-K"&&v.end===context.periodEnd&&
    (duration?typeof v.start==="string"&&annual(v.start,v.end):!v.start)&&
    typeof v.filed==="string"&&iso(v.filed)&&v.filed<=context.filedDate
  );
  if(!matched.length)return{status:"missing"};
  const values=matched.map(v=>typeof v.val==="number"?toInteger(v.val):null);
  if(values.some(v=>v===null))return{status:"ambiguous"};
  const dedup=[...new Set(values.map(v=>v!.toString()))];
  if(dedup.length!==1)return{status:"ambiguous"};
  return{status:"found",tag,value:BigInt(dedup[0]!)};
}
function alternatives(gaap:SecGaap,tags:readonly string[],unit:string,c:SecOriginalContext,duration:boolean):PickResult{
 const results=tags.map(t=>directTag(gaap,t,unit,c,duration));
 if(results.some(x=>x.status==="ambiguous"))return{status:"ambiguous"};
 const found=results.filter(x=>x.status==="found");
 if(found.length===0)return{status:"missing"};
 if(new Set(found.map(x=>x.value!.toString())).size>1)return{status:"ambiguous"};
 // Equivalent values can still have different semantic definitions, hence an
 // overlapping current borrowing tag is never summed twice.
 return found[0]!;
}
const candidate=(kind:ExtractedCandidate["kind"],status:ExtractedCandidate["status"],
 amount:bigint|null,unit:ExtractedCandidate["currencyOrUnit"],ctx:SecOriginalContext,
 parts:Array<{tag:string;value:string}>,caveats:string[]):ExtractedCandidate=>({
 kind,status,amount:amount?.toString()??null,currencyOrUnit:unit,
 originalAccession:ctx.accession,originalPeriod:ctx.periodEnd,
 components:parts,caveats,scoringEligible:false,modelEligible:false,
});
const blocked=(kind:ExtractedCandidate["kind"],ctx:SecOriginalContext,unit:ExtractedCandidate["currencyOrUnit"],reason:string)=>
 candidate(kind,"unavailable",null,unit,ctx,[],[reason]);

export function extractSecOperatingModelCandidates(gaap:SecGaap,ctx:SecOriginalContext):ExtractedCandidate[]{
 if(!/^\d{10}-\d{2}-\d{6}$/.test(ctx.accession)||!iso(ctx.periodEnd)||!iso(ctx.filedDate)||
    ctx.filedDate<ctx.periodEnd)
  throw new Error("Invalid original SEC accession, fiscal period or filing date");
 if(ctx.sector!=="nonfinancial"){
  const reason="Issuer sector not independently confirmed as nonfinancial; sector-specific accounts cannot use an industrial EBIT/borrowings policy";
  return [
   blocked("operating_income",ctx,USD,reason),
   blocked("borrowings_excluding_leases",ctx,USD,reason),
   blocked("period_end_shares",ctx,SHARES,reason),
  ];
 }
 const op=alternatives(gaap,opTag,USD,ctx,true);
 const operating=op.status!=="found"?candidate("operating_income",
   op.status==="ambiguous"?"ambiguous":"unavailable",null,USD,ctx,[],
   ["No unique original-year GAAP operating-income duration fact"])
  :candidate("operating_income","requires_accounting_review",op.value!,USD,ctx,
   [{tag:op.tag!,value:op.value!.toString()}],
   ["Consolidated operating income is not universally EBIT; interest and nonoperating adjustments require original 10-K review"]);
 const current=alternatives(gaap,currentBorrowingTags,USD,ctx,false);
 const long=alternatives(gaap,longBorrowingTags,USD,ctx,false);
 // Some issuers report commercial paper AND a current portion; blindly
 // choosing one loses debt. This conservative mapping intentionally refuses
 // to sum these until a filer-specific classification is documented.
 const components=[current,long].filter(r=>r.status==="found").map(r=>({
  tag:r.tag!,value:r.value!.toString(),
 }));
 let debt:ExtractedCandidate;
 if(current.status==="ambiguous"||long.status==="ambiguous")
  debt=candidate("borrowings_excluding_leases","ambiguous",null,USD,ctx,components,
    ["Overlapping or conflicting debt concept values; no borrowing total inferred"]);
 else if(long.status!=="found"||current.status!=="found")
  debt=candidate("borrowings_excluding_leases","unavailable",null,USD,ctx,components,
    ["Missing an explicit current or noncurrent interest-bearing debt component; absence is not zero"]);
 else {
  debt=candidate("borrowings_excluding_leases","requires_accounting_review",
    current.value!+long.value!,USD,ctx,components,[
    "Candidate is only two nonoverlapping current and noncurrent borrowing concepts",
    "Commercial paper and other current borrowings might be separately reported; incomplete issuer debt perimeter",
    "Finance leases, convertible borrowings and classification policies need original debt-note reconciliation before EV",
   ]);
 }
 const shares=alternatives(gaap,datedSharesTags,SHARES,ctx,false);
 const shareResult=shares.status==="found"?
  candidate("period_end_shares","requires_accounting_review",shares.value!,SHARES,ctx,
   [{tag:shares.tag!,value:shares.value!.toString()}],
   ["Common shares outstanding tag requires class coverage, split/as-of date and source-statement verification; cover-page DEI post-year-end counts are rejected"])
  :candidate("period_end_shares",shares.status==="ambiguous"?"ambiguous":"unavailable",
     null,SHARES,ctx,[],["No unambiguous instant common shares outstanding on original fiscal-year end"]);
 return[operating,debt,shareResult];
}
