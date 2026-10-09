/**
 * S&P 500 July 2026 published eligibility screening, NOT index selection odds.
 * https://www.spglobal.com/spdji/en/documents/methodologies/methodology-sp-us-indices.pdf
 * Thresholds are subject to quarterly review: analyst must reconfirm.
 */
import type { AnticipationCriterion } from "./anticipatory-model";

export const SP500_PREFLIGHT_VERSION="sp500.eligibility.preflight.v2026.07";
export const SP500_JULY_2026={
 companyMarketCapUsd:22_700_000_000,securityFloatMarketCapUsd:11_350_000_000,
 investableWeightFactor:0.1,monthlySharesTraded:250_000,floatAdjustedLiquidityRatio:0.75,
} as const;
export const SP500_METHODOLOGY_URL="https://www.spglobal.com/spdji/en/documents/methodologies/methodology-sp-us-indices.pdf";
export type EvidenceFact<T>={value:T|null;sourceUrl:string;sourceName:string;sourcePublishedAt:string;observedAt:string};
export interface SP500FactPacket {
 symbol:string;
 methodologyReviewedAt:string;
 methodologyVersion:"2026-07";
 currentMember:EvidenceFact<boolean>|null;
 usDomicile:EvidenceFact<boolean>|null;
 eligibleUsListing:EvidenceFact<boolean>|null;
 eligibleSecurityType:EvidenceFact<boolean>|null;
 companyMarketCapUsd:EvidenceFact<number>|null;
 securityFloatMarketCapUsd:EvidenceFact<number>|null;
 investableWeightFactor:EvidenceFact<number>|null;
 lastSixMonthlySharesTraded:EvidenceFact<number[]>|null;
 annualFloatAdjustedLiquidityRatio:EvidenceFact<number>|null;
 gaapContinuingNetIncomeLatestQuarterUsd:EvidenceFact<number>|null;
 gaapContinuingNetIncomeTrailingFourQuartersUsd:EvidenceFact<number>|null;
}
export interface SP500PreflightResult {
 state:"withheld"|"eligible_for_review"|"partial_research"|"excluded";
 criteria:AnticipationCriterion[];missing:string[];failed:string[];passed:number;
 modelVersion:string;probability:null;scoreAdjustment:0;explanation:string;
}
type CriterionCode=
 "not_current_member"|"us_domicile"|"eligible_us_listing"|"eligible_security_type"|
 "market_cap_threshold"|"float_adjusted_market_cap"|"investable_weight_factor"|
 "monthly_share_volume"|"float_adjusted_liquidity"|"gaap_latest_quarter"|"gaap_trailing_four_quarters";
function https(url:string):boolean{
 try{const u=new URL(url);return u.protocol==="https:"&&!u.username&&!u.password;}
 catch{return false;}
}
function usable<T>(f:EvidenceFact<T>|null,now:number):f is EvidenceFact<T>{
 if(!f || f.value===null || !f.sourceName.trim() || !https(f.sourceUrl))return false;
 const published=Date.parse(f.sourcePublishedAt),seen=Date.parse(f.observedAt);
 return Number.isFinite(published)&&Number.isFinite(seen)&&
  published<=seen+2000&&seen<=now&&now-seen<=30*86_400_000;
}
function criterion<T>(code:CriterionCode,field:EvidenceFact<T>|null,now:number,
 pass:(v:T)=>boolean,label:string):AnticipationCriterion{
 const known=usable(field,now);
 return {code,state:!known?"unknown":pass(field.value as T)?"pass":"fail",
  observedAt:known?field.observedAt:new Date(now).toISOString(),
  sourceUrl:known?field.sourceUrl:SP500_METHODOLOGY_URL,
  note:known?label+": "+String(Array.isArray(field.value)?field.value.join(","):field.value)+". Source: "+field.sourceName
   :label+": no current, dated issuer-specific source."};
}
export function screenSP500Preflight(packet:SP500FactPacket,asOf:Date=new Date()):SP500PreflightResult{
 const now=asOf.getTime(),checked=Date.parse(packet.methodologyReviewedAt);
 const currentMethod=packet.methodologyVersion==="2026-07"&&Number.isFinite(checked)&&
  checked<=now&&now-checked<=90*86_400_000;
 const rules=SP500_JULY_2026;
 const criteria:AnticipationCriterion[]=[
  criterion("not_current_member",packet.currentMember,now,v=>v===false,"Verified non-member"),
  criterion("us_domicile",packet.usDomicile,now,v=>v===true,"US domicile"),
  criterion("eligible_us_listing",packet.eligibleUsListing,now,v=>v===true,"Eligible US exchange"),
  criterion("eligible_security_type",packet.eligibleSecurityType,now,v=>v===true,"Eligible equity type"),
  criterion("market_cap_threshold",currentMethod?packet.companyMarketCapUsd:null,now,
   v=>Number.isFinite(v)&&v>=rules.companyMarketCapUsd,"Company market cap USD"),
  criterion("float_adjusted_market_cap",currentMethod?packet.securityFloatMarketCapUsd:null,now,
   v=>Number.isFinite(v)&&v>=rules.securityFloatMarketCapUsd,"Security float-adjusted cap USD"),
  criterion("investable_weight_factor",packet.investableWeightFactor,now,
   v=>Number.isFinite(v)&&v>=rules.investableWeightFactor&&v<=1,"Investable weight factor"),
  criterion("monthly_share_volume",packet.lastSixMonthlySharesTraded,now,
   v=>v.length===6&&v.every(q=>Number.isFinite(q)&&q>=rules.monthlySharesTraded),"Shares traded in EACH of six months"),
  criterion("float_adjusted_liquidity",packet.annualFloatAdjustedLiquidityRatio,now,
   v=>Number.isFinite(v)&&v>=rules.floatAdjustedLiquidityRatio,"Float-adjusted liquidity ratio"),
  criterion("gaap_latest_quarter",packet.gaapContinuingNetIncomeLatestQuarterUsd,now,
   v=>Number.isFinite(v)&&v>0,"Most recent quarter GAAP continuing income"),
  criterion("gaap_trailing_four_quarters",packet.gaapContinuingNetIncomeTrailingFourQuartersUsd,now,
   v=>Number.isFinite(v)&&v>0,"Sum of latest four quarters GAAP continuing income"),
 ];
 const missing=criteria.filter(c=>c.state==="unknown").map(c=>c.code);
 const failed=criteria.filter(c=>c.state==="fail").map(c=>c.code);
 const passed=criteria.filter(c=>c.state==="pass").length;
 let state:SP500PreflightResult["state"]="withheld";
 let explanation="Missing current source-backed non-membership. No potential addition is asserted.";
 if(criteria[0].state==="fail"){state="excluded";explanation="Already an index constituent.";}
 else if(criteria[0].state==="pass"){
  if(failed.length){state="excluded";explanation="A published eligibility requirement fails.";}
  else if(!currentMethod){explanation="Quarterly updated S&P size threshold must be reconfirmed.";}
  else if(!missing.length){state="eligible_for_review";explanation="Eligible for analyst review only; S&P selection remains discretionary.";}
  else if(passed>=2){state="partial_research";explanation="Partial documented eligibility; not an inclusion forecast.";}
 }
 return {state,criteria,missing,failed,passed,modelVersion:SP500_PREFLIGHT_VERSION,
  probability:null,scoreAdjustment:0,explanation};
}
