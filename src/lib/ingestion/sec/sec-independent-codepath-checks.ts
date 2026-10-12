/**
 * Phase 2J22 — SECOND CODE PATH / original SEC issuer holdout challenges.
 * Numerically independent fixed expectations checked against the 2J17–2J20
 * implementation, not an independent human accounting attestation.
 *
 * The purpose is to detect semantic conflicts and silent regressions; a
 * successful source crossfoot does NOT approve financial capital or scores.
 */
import {reconcileSoftwareFiscalEvidence} from "./software-fy-source-gap-closure.ts";
import {annualRDRollforward} from "./rd-rollforward-third-issuer.ts";
import {getCostcoOriginalEightQuarterCash} from "./costco-eight-quarter-cash-evidence.ts";
import {getIndependentSecReview} from "./independent-original-10k-review.ts";
import type {ReviewSubject} from "./sec-methodology-gates.ts";

export const SEC_2J22_VERSION="sec.original_accounting.second_implementation_check.v1" as const;
type Check={
 field:string;expect:string;actual:string|null;pass:boolean;
 originalUrl:string;independentHumanReviewed:false;
};
type Validation={
 subject:ReviewSubject;version:typeof SEC_2J22_VERSION;
 checks:Check[];failed:number;passed:number;
 accountSourceConsistency:boolean;
 verifiedEconomicCapital:false;
 secondHumanReviewerSigned:false;
 safeForAutomaticScore:false;
};
type LiteralAnchor={key:string;expected:string;sourceUrl:string};
const proof=(facts:LiteralAnchor[],get:(key:string)=>string|null):Check[]=>
 facts.map(a=>({field:a.key,expect:a.expected,actual:get(a.key),
  originalUrl:a.sourceUrl,pass:a.expected===get(a.key),
  independentHumanReviewed:false as const,
 }));
const anchors={
 ADBE:{source:"https://www.sec.gov/Archives/edgar/data/796343/000079634326000003/adbe-20251128.htm",
  cash:"5431",securities:"1164",currentAssets:"10163",
  longDebt:"6210",financeLease:"0",annualRD:"4294"},
 ADSK:{source:"https://www.sec.gov/Archives/edgar/data/769397/000076939726000015/adsk-20260131.htm",
  cash:"2249",securities:"348",currentAssets:"4942",
  longDebt:"2483",financeLease:null,annualRD:"1643"},
 NOW:{source:"https://www.sec.gov/Archives/edgar/data/1373715/000137371526000007/now-20251231.htm",
  cash:"3726",securities:"2558",currentAssets:"10471",
  longDebt:"1491",financeLease:"0",annualRD:"2960"},
} as const;
function software(issuer:"ADBE"|"ADSK"|"NOW"):Validation{
 const report=reconcileSoftwareFiscalEvidence(issuer),orig=anchors[issuer];
 const rd=annualRDRollforward(issuer,5);
 const facts:LiteralAnchor[]=[
  {key:"cash",expected:orig.cash,sourceUrl:orig.source},
  {key:"securities",expected:orig.securities,sourceUrl:orig.source},
  {key:"currentAssets",expected:orig.currentAssets,sourceUrl:orig.source},
  {key:"longDebt",expected:orig.longDebt,sourceUrl:orig.source},
  {key:"annualRD",expected:orig.annualRD,sourceUrl:orig.source},
 ];
 if(orig.financeLease!==null)facts.push({
  key:"financeLease",expected:orig.financeLease,sourceUrl:orig.source,
 });
 const current=(field:string):string|null=>({
  cash:report.liquidity.cashMillions,
  securities:report.liquidity.shortTermSecuritiesMillions,
  currentAssets:report.checks[0].reportedMillions,
  longDebt:report.finance.reportedLongtermBorrowingCarryingMillions,
  annualRD:rd.researchAdditionMillions,
  financeLease:report.finance.explicitFinanceLeaseMillions,
 } as Record<string,string|null>)[field]??null;
 const checks=proof(facts,current);
 // A second independent invariant catches asset-source classification drift:
 // "restricted cash" in NOW is outside cash and cannot be subtracted twice.
 if(issuer==="NOW")checks.push({
  field:"restrictedOutsideEquivalents",expect:"6",
  actual:report.liquidity.explicitlyLocatedRestrictedCashOutsideCashMillions,
  originalUrl:orig.source,
  pass:report.liquidity.explicitlyLocatedRestrictedCashOutsideCashMillions==="6"&&
    report.liquidity.alreadyBookedRestrictedCashNotSubtractedFromCashTwice,
  independentHumanReviewed:false,
 });
 const passed=checks.filter(x=>x.pass).length;
 return {
  subject:issuer,version:SEC_2J22_VERSION,checks,passed,failed:checks.length-passed,
  accountSourceConsistency:passed===checks.length,
  verifiedEconomicCapital:false,secondHumanReviewerSigned:false,
  safeForAutomaticScore:false,
 };
}
function costco():Validation{
 const r=getCostcoOriginalEightQuarterCash();
 const source="https://www.sec.gov/Archives/edgar/data/909832/000090983226000093/cost-20260830.htm";
 const latest=r.fullSeries[r.fullSeries.length-1];
 const checks=proof([
  {key:"cashAndInvestments",expected:"21301",sourceUrl:source},
  {key:"settlementCard",expected:"2842",sourceUrl:source},
  {key:"postCardBookLiquidity",expected:"18459",sourceUrl:source},
  {key:"periods",expected:"9",sourceUrl:source},
  {key:"completeIntervals",expected:"8",sourceUrl:source},
 ],key=>({
  cashAndInvestments:latest.reportedLiquidAssetsMillions,
  settlementCard:latest.unsettledCardReceivablesMillions,
  postCardBookLiquidity:latest.postSettlementBookLiquidityMillions,
  periods:r.fullSeries.length.toString(),
  completeIntervals:r.completeQuarterIntervals.toString(),
 } as Record<string,string>)[key]??null);
 const passed=checks.filter(x=>x.pass).length;
 return {subject:"COST",version:SEC_2J22_VERSION,checks,passed,
  failed:checks.length-passed,accountSourceConsistency:passed===checks.length,
  verifiedEconomicCapital:false,secondHumanReviewerSigned:false,
  safeForAutomaticScore:false};
}
function amazon():Validation{
 const r=getIndependentSecReview("AMZN");
 const source="https://www.sec.gov/Archives/edgar/data/1018724/000101872426000004/amzn-20251231.htm";
 const observed=(key:string)=>r.fields.find(f=>f.key===key)?.amountMillions??null;
 const checks=proof([
  {key:"source.longTermDebtCurrent",expected:"2748",sourceUrl:source},
  {key:"source.shortTermCreditFacilities",expected:"455",sourceUrl:source},
 ],observed);
 // Explicit note correction must NOT enter as complete combined economic debt.
 const incomplete=r.borrowingPerimeter==="incomplete";
 checks.push({field:"completeBorrowingNotCertified",expect:"incomplete",
  actual:r.borrowingPerimeter,pass:incomplete,
  originalUrl:source,independentHumanReviewed:false});
 const passed=checks.filter(x=>x.pass).length;
 return {subject:"AMZN",version:SEC_2J22_VERSION,checks,passed,
  failed:checks.length-passed,accountSourceConsistency:passed===checks.length,
  verifiedEconomicCapital:false,secondHumanReviewerSigned:false,
  safeForAutomaticScore:false};
}
export function validateSecIssuerSecondPath(issuer:ReviewSubject):Validation{
 switch(issuer){
  case "ADBE":case "ADSK":case "NOW":return software(issuer);
  case "COST":return costco();
  case "AMZN":return amazon();
  default:throw Error("No original SEC validation cohort");
 }
}
export function runSecIndependentCodePathValidation(){
 const subjects=["ADBE","ADSK","NOW","COST","AMZN"] as const;
 const reports=subjects.map(validateSecIssuerSecondPath);
 return {
  version:SEC_2J22_VERSION,reports,
  checksPassed:reports.reduce((a,r)=>a+r.passed,0),
  checksFailed:reports.reduce((a,r)=>a+r.failed,0),
  independentImplementations:2,
  independentHumanReviewerAttested:false as const,
  heldOutSoftwareCompany:"NOW" as const,
  validationComplete:reports.every(r=>r.accountSourceConsistency),
  modelPromotionAllowed:false as const,
 };
}
