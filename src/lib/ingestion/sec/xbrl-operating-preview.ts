/**
 * Phase 2J7 - source-only, deterministic SEC CompanyFacts extractor.
 *
 * NEVER returns scored STMT_EBIT, STMT_TOTAL_DEBT, or verified share issuance.
 * Each observation is from ONE original 10-K accession and the issuer's own
 * report period, never CompanyFacts restated comparatives from later 10-Ks.
 */
export type SecObservationStatus="found"|"missing"|"ambiguous";
export type SecFactObservation={
  status:SecObservationStatus;
  tag:string;
  value:string|null;
  end:string|null;
  filed:string|null;
  start:string|null;
  note:string;
};
export type SecDebtPreview={
  status:"components_match"|"incomplete"|"ambiguous";
  subtotalUsd:string|null;
  componentTags:string[];
  observations:SecFactObservation[];
  ignoredPrincipalMaturities:SecFactObservation;
  borrowingScope:"carrying_value_notes_and_separate_short_term_borrowings_excluding_leases";
  modelApproved:false;
};
export type SecOperatingPreview={
  accession:string;periodEnd:string;cik:number;
  operatingIncome:SecFactObservation;
  debt:SecDebtPreview;
  leases:SecFactObservation[];
  yearEndCommonShares:SecFactObservation;
  coverPageShares:SecFactObservation;
  coverDateAfterFiscalEnd:boolean;
  ebitAdjustmentPolicy:"operating_income_only_not_ebit";
  sectorPolicy:"preselected_nonfinancial_pilot_not_industry_verified";
  shareIssuancePolicy:"period_end_outstanding_requires_class_and_split_review";
  modelEligible:false;scoringEligible:false;
};
type SecRecord={accn?:string;end?:string;start?:string;val?:unknown;form?:string;filed?:string};
type SecConcept={units?:Record<string,SecRecord[]>};
export type SecCompanyFacts={
  cik?:number;facts?:{
    "us-gaap"?:Record<string,SecConcept>;
    dei?:Record<string,SecConcept>;
  };
};
export type SecSelector={cik:number;accession:string;periodEnd:string};
const isDate=(d:string):boolean=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&
  !Number.isNaN(Date.parse(d+"T00:00:00Z"));
function daysBetween(a:string,b:string):number{
  return Math.round((Date.parse(b+"T00:00:00Z")-
    Date.parse(a+"T00:00:00Z"))/86400000);
}
function lookup(
  doc:SecCompanyFacts,selector:SecSelector,
  namespace:"us-gaap"|"dei",tag:string,unit:"USD"|"shares",
  timing:"annual"|"instant"|"cover",
):SecFactObservation{
  const entries=doc.facts?.[namespace]?.[tag]?.units?.[unit]??[];
  const relevant=entries.filter(e=>{
    if(e.accn!==selector.accession||e.form!=="10-K"||
      !isDate(e.end??"")||!isDate(e.filed??""))return false;
    if(timing==="cover"){
      return e.start===undefined&&e.end!>=selector.periodEnd &&
        daysBetween(selector.periodEnd,e.end!)<=120;
    }
    if(e.end!==selector.periodEnd)return false;
    if(timing==="instant")return e.start===undefined;
    return isDate(e.start??"")&&
      daysBetween(e.start!,e.end!)>=330&&daysBetween(e.start!,e.end!)<=380;
  });
  const values=new Set(relevant.map(e=>String(e.val)));
  const consistent=relevant.length>0&&values.size===1&&
    relevant.every(e=>typeof e.val==="number"&&
      Number.isSafeInteger(e.val)&&e.val>=0);
  const note=relevant.length===0?"Not observed in exact original accession and period":
    !consistent?"Conflicting, unsafe, or nonintegral SEC source observations":
    "Direct original 10-K accession-matched tag; not a model certification";
  const status:SecObservationStatus=relevant.length===0?"missing":
    consistent?"found":"ambiguous";
  const item=consistent?relevant[0]:null;
  return{
    status,tag,value:item?String(item.val):null,
    end:item?.end??null,filed:item?.filed??null,
    start:item?.start??null,note,
  };
}
function pick(doc:SecCompanyFacts,sel:SecSelector,tag:string,
 unit:"USD"|"shares",kind:"annual"|"instant"|"cover"="instant",
 namespace:"us-gaap"|"dei"="us-gaap"):SecFactObservation{
  return lookup(doc,sel,namespace,tag,unit,kind);
}
export function extractOriginalSecOperatingPreview(
 doc:SecCompanyFacts,sel:SecSelector,
):SecOperatingPreview{
  if(!Number.isSafeInteger(sel.cik)||sel.cik<=0||
    doc.cik!==sel.cik||
    !/^\d{10}-\d{2}-\d{6}$/.test(sel.accession)||
    !isDate(sel.periodEnd))throw new Error("SEC issuer, accession or period identity mismatch");

  const operatingIncome=pick(doc,sel,"OperatingIncomeLoss","USD","annual");
  const current=pick(doc,sel,"LongTermDebtCurrent","USD");
  const noncurrent=pick(doc,sel,"LongTermDebtNoncurrent","USD");
  const paper=pick(doc,sel,"CommercialPaper","USD");
  const otherShort=pick(doc,sel,"ShortTermBorrowings","USD");
  const parent=pick(doc,sel,"LongTermDebt","USD");
  const principal=pick(doc,sel,
    "LongTermDebtMaturitiesRepaymentsOfPrincipalInNextTwelveMonths","USD");

  const components=[current,noncurrent,paper,otherShort];
  const componentTags=components.filter(x=>x.status==="found").map(x=>x.tag);
  const both=current.status==="found"&&noncurrent.status==="found";
  const extraConflict=paper.status==="found"&&otherShort.status==="found"&&
    BigInt(paper.value!)>0n&&BigInt(otherShort.value!)>0n;
  const missingCritical=[current,noncurrent].some(x=>x.status==="missing");
  const ambiguous=components.some(x=>x.status==="ambiguous")||extraConflict;
  // LongTermDebt is a parent/aggregate concept. It must NEVER be added
  // to current or noncurrent components. Principal maturities can differ
  // from carrying value; they are shown separately but never summed.
  const status:SecDebtPreview["status"]=ambiguous?"ambiguous":
    both&&!missingCritical?"components_match":"incomplete";
  const subtotalUsd=status==="components_match"?
    components.filter(x=>x.status==="found")
      .reduce((n,v)=>n+BigInt(v.value!),0n).toString():null;
  const leaseTags=[
    "OperatingLeaseLiabilityCurrent","OperatingLeaseLiabilityNoncurrent",
    "FinanceLeaseLiabilityCurrent","FinanceLeaseLiabilityNoncurrent",
  ];
  const leases=leaseTags.map(tag=>pick(doc,sel,tag,"USD"));
  const yearEndCommonShares=pick(doc,sel,"CommonStockSharesOutstanding",
    "shares","instant");
  const coverPageShares=pick(doc,sel,"EntityCommonStockSharesOutstanding",
    "shares","cover","dei");
  // Even when official CompanyFacts describes no separate short-term loans,
  // the reported sum is only the *observed* borrowing component scope.
  // External financial note/lease policy remains necessary.
  return{
    accession:sel.accession,periodEnd:sel.periodEnd,cik:sel.cik,
    operatingIncome,
    debt:{
      status,subtotalUsd,componentTags,
      observations:[current,noncurrent,paper,otherShort,parent],
      ignoredPrincipalMaturities:principal,
      borrowingScope:"carrying_value_notes_and_separate_short_term_borrowings_excluding_leases",
      modelApproved:false,
    },
    leases,
    yearEndCommonShares,coverPageShares,
    coverDateAfterFiscalEnd:coverPageShares.status==="found"&&
      (coverPageShares.end??"")>sel.periodEnd,
    ebitAdjustmentPolicy:"operating_income_only_not_ebit",
    sectorPolicy:"preselected_nonfinancial_pilot_not_industry_verified",
    shareIssuancePolicy:"period_end_outstanding_requires_class_and_split_review",
    modelEligible:false,scoringEligible:false,
  };
}
