/**
 * Phase 2J18 — manually sourced original FY 10-K operating capital perimeter.
 * Immutable reporting evidence and NO computed economic ROIC or rankings.
 *
 * USD millions; direct original issuer balance/notes, not issuer-approved
 * economic capital nor independent human reviewer attestation. A balance
 * sheet component that is already embedded must NEVER be added a second time.
 */
import {
 annualRDRollforward,SIX_YEAR_ORIGINAL_RD,
 type SoftwareHoldout,
} from "./rd-rollforward-third-issuer.ts";

export const SEC_2J18_POLICY="sec.research.software_capital_perimeter.draft.v1.0.0" as const;
export type PolicyDisposition=
 "book_asset_already_in_balance_sheet"|
 "book_liability_already_in_balance_sheet"|
 "original_note_amount_not_separately_allocated"|
 "not_quantified_do_not_impute_zero"|
 "reported_absent"|
 "hypothetical_rnd_not_a_gaap_asset";
export type DisclosedFact={
 key:string;
 amountMillions:string|null;
 sourceSection:string;
 sourceUrl:string;
 disposition:PolicyDisposition;
 classification:string;
};
type IssuerOriginal={
 periodEnd:string;
 sourceUrl:string;
 observations:{
 currentAssets:string;currentLiabilities:string;
 netPpe:string;
 goodwill:string;goodwillPrior:string;
 goodwillAcquisitions:string;goodwillFxAndOther:string;
 netPurchasedIntangibles:string;grossPurchasedIntangibles:string;accumulatedIntangibleAmortization:string;
 purchasedDevelopedTechnologyNet:string|null;
 contractAcquisitionTotal:string;contractAcquisitionCurrent:string|null;contractAcquisitionNoncurrent:string|null;
 contractAssets:string|null;
 deferredRevenueCurrent:string;deferredRevenueNoncurrent:string;
 operatingLeaseRou:string;operatingLeaseLiabilityCurrent:string;operatingLeaseLiabilityNoncurrent:string;
 financeLeaseLiability:string|null;
 };
 policy:{
 contractCostDescription:string;
 contractAssetDescription:string;
 developedSoftwareDescription:string;
 financeLeaseStatus:"unverified"|"explicit_absence";
 };
};
const ADBE="https://www.sec.gov/Archives/edgar/data/796343/000079634326000003/adbe-20251128.htm";
const ADSK="https://www.sec.gov/Archives/edgar/data/769397/000076939726000015/adsk-20260131.htm";
const NOW="https://www.sec.gov/Archives/edgar/data/1373715/000137371526000007/now-20251231.htm";
export const ORIGINAL_SOFTWARE_CAPITAL_EVIDENCE:Record<SoftwareHoldout,IssuerOriginal>={
 ADBE:{
  periodEnd:"2025-11-28",sourceUrl:ADBE,
  observations:{
   currentAssets:"10163",currentLiabilities:"10200",netPpe:"1873",
   goodwill:"12857",goodwillPrior:"12788",goodwillAcquisitions:"14",goodwillFxAndOther:"55",
   grossPurchasedIntangibles:"2521",accumulatedIntangibleAmortization:"2026",
   netPurchasedIntangibles:"495",purchasedDevelopedTechnologyNet:"28",
   contractAcquisitionTotal:"721",contractAcquisitionCurrent:"257",contractAcquisitionNoncurrent:"464",
   contractAssets:"241",deferredRevenueCurrent:"6905",deferredRevenueNoncurrent:"125",
   operatingLeaseRou:"312",operatingLeaseLiabilityCurrent:"77",operatingLeaseLiabilityNoncurrent:"361",
   financeLeaseLiability:null,
  },
  policy:{
   contractCostDescription:"FY2025 Note 2: costs to obtain customer contracts 721, of which 464 in other assets, remainder embedded in prepaid/current assets; 5-year cost-benefit amortisation.",
   contractAssetDescription:"FY2025 Note 2: conditional customer-contract asset 241, split between prepaid/current and other/long-term assets not separately quantified; do NOT add whole 241 to current assets.",
   developedSoftwareDescription:"Purchased technology net 28 is separately identified within the 495 acquired intangible balance. In-house software development capitalisation is not independently separated.",
   financeLeaseStatus:"unverified",
  },
 },
 ADSK:{
  periodEnd:"2026-01-31",sourceUrl:ADSK,
  observations:{
   currentAssets:"4942",currentLiabilities:"5808",netPpe:"121",
   goodwill:"4295",goodwillPrior:"4242",goodwillAcquisitions:"0",goodwillFxAndOther:"53",
   grossPurchasedIntangibles:"2069",accumulatedIntangibleAmortization:"1602",
   netPurchasedIntangibles:"467",purchasedDevelopedTechnologyNet:"242",
   contractAcquisitionTotal:"913",contractAcquisitionCurrent:null,contractAcquisitionNoncurrent:null,
   contractAssets:null,deferredRevenueCurrent:"4406",deferredRevenueNoncurrent:"287",
   operatingLeaseRou:"157",operatingLeaseLiabilityCurrent:"52",operatingLeaseLiabilityNoncurrent:"199",
   financeLeaseLiability:null,
  },
  policy:{
   contractCostDescription:"FY2026 Note 2: costs to obtain customer contracts 913, embedded across prepaid/current and long-term other assets. Allocation between current/noncurrent not separately stated; no assumed split. Related accrued commission liabilities 550 are already in reported liabilities.",
   contractAssetDescription:"FY2026 Note 2: revenue contract assets described as not material; do not fabricate a zero or a numerical asset.",
   developedSoftwareDescription:"FY2026 Note 9: acquired developed technologies net 242 already in total acquired intangible assets 467. Internal-use capitalised software development costs were not material at FY end; not a certified zero.",
   financeLeaseStatus:"unverified",
  },
 },
 NOW:{
  periodEnd:"2025-12-31",sourceUrl:NOW,
  observations:{
   currentAssets:"10471",currentLiabilities:"10443",netPpe:"2289",
   goodwill:"3578",goodwillPrior:"1273",goodwillAcquisitions:"2225",goodwillFxAndOther:"80",
   grossPurchasedIntangibles:"1709",accumulatedIntangibleAmortization:"588",
   netPurchasedIntangibles:"1121",purchasedDevelopedTechnologyNet:null,
   contractAcquisitionTotal:"1704",contractAcquisitionCurrent:"590",contractAcquisitionNoncurrent:"1114",
   contractAssets:null,deferredRevenueCurrent:"8314",deferredRevenueNoncurrent:"120",
   operatingLeaseRou:"806",operatingLeaseLiabilityCurrent:"112",operatingLeaseLiabilityNoncurrent:"800",
   financeLeaseLiability:"0",
  },
  policy:{
   contractCostDescription:"FY2025 original balance sheet: deferred commissions 590 current plus 1,114 noncurrent, already inside total assets. Recognised contract acquisition cost, not a new R&D asset.",
   contractAssetDescription:"FY2025 note describes contract billings and receivables; no separately verified nonzero contract asset to map. Unknown, not a certified zero.",
   developedSoftwareDescription:"FY2025 Note 1: technological feasibility to product release development cost immaterial and all software development costs expensed in R&D; no new GAAP internal software asset is imputed. Gross acquired developed tech 1,316 is part of acquired intangible gross 1,709, not a separately quantified net asset.",
   financeLeaseStatus:"explicit_absence",
  },
 },
};
const money=(s:string):bigint=>{
 if(!/^(0|[1-9]\d*)$/.test(s))throw Error("Exact SEC integer USD millions required");
 return BigInt(s);
};
const split=(total:string,current:string|null,longterm:string|null)=>{
 if(current===null||longterm===null)return null;
 return money(current)+money(longterm)===money(total);
};
export interface ReconciliationCheck{
 name:string;expectedMillions:string;calculatedMillions:string|null;
 result:"matched"|"cannot_check";
}
export interface SoftwareCapitalReview{
 issuer:SoftwareHoldout;policyVersion:typeof SEC_2J18_POLICY;
 source:{fiscalEnd:string;original10k:string;rdAnnualSource:string;cutoff:"2026-10-09T20:00:00Z"};
 observed:DisclosedFact[];
 checks:ReconciliationCheck[];
 report:{
  contractCostCurrentNoncurrentReconciled:boolean|null;
  contractCostAlreadyInReportedAssets:true;
  acquiredIntangiblesAlreadyInReportedAssets:true;
  operatingRouAlreadyInReportedAssets:true;
  deferredRevenueAlreadyInCurrentAndNoncurrentLiabilities:true;
  separateFinanceLeaseQuantified:boolean;
  unverifiedCurrentAssetContractAllocation:boolean;
  negativeWorkingCapitalMillions:string|null;
  fiveYearHypotheticalRAndDAssetMillions:string;
  fiveYearHypotheticalAdjustedOperatingIncomeMillions:string;
  fiveYearHypotheticalRDAdjustmentNotInGAAPBalanceSheet:true;
  unadjustedGAAPCurrentAssetsMillions:string;
  unadjustedGAAPCurrentLiabilitiesMillions:string;
  auditedBookAssetSubtotalNotAdditionalCapitalMillions:string;
  missingAccountingDecisions:string[];
 };
 gates:{
  eachAvailableBridgePass:true;
  historicalFYMatchesRAndD:true;
  independentHumanReviewerSigned:false;
  sameDateTTMAvailable:false;
  cashDistributabilityReviewed:false;
  contractAssetsFullyAllocated:false;
  acquiredIntangibleOverlapReviewed:false;
  leaseAndDeferredRevenuePolicyApproved:false;
  operatingEconomicCapitalUsd:null;
  returnOnCapitalBps:null;
  validMagicFormulaRank:false;
  modelEligible:false;scoringEligible:false;storedChanges:0;
 };
}
export function evaluateSoftwareOperatingCapitalPerimeter(issuer:SoftwareHoldout):SoftwareCapitalReview{
 const original=ORIGINAL_SOFTWARE_CAPITAL_EVIDENCE[issuer];
 if(!original)throw Error("Unrecognised original software issuer");
 const rd=annualRDRollforward(issuer,5);
 const x=original.observations;
 if(rd.fiscalPeriodEnd!==original.periodEnd||
    rd.sourceOriginalAnnualCohorts[5].original10k!==original.sourceUrl||
    !original.sourceUrl.startsWith("https://www.sec.gov/Archives/edgar/data/")){
  throw Error("Original SEC FY and R&D review source mismatch");
 }
 const check=(name:string,expected:string,items:Array<string|null>):ReconciliationCheck=>{
  const amount=items.some(v=>v===null)?null:
   items.reduce<bigint>((sum,v)=>sum+money(v!),0n).toString();
  if(amount!==null&&amount!==expected)throw Error("Original SEC balance/notes bridge inconsistent: "+name);
  return {name,expectedMillions:expected,calculatedMillions:amount,
   result:amount===null?"cannot_check" as const:"matched" as const};
 };
 const checks=[
  check("acquired gross intangibles less accumulated amortisation",x.netPurchasedIntangibles,
   [x.grossPurchasedIntangibles,"-"+x.accumulatedIntangibleAmortization]),
  check("goodwill prior + acquired + foreign exchange",x.goodwill,
   [x.goodwillPrior,x.goodwillAcquisitions,x.goodwillFxAndOther]),
  check("capitalised contract costs current + noncurrent",x.contractAcquisitionTotal,
   [x.contractAcquisitionCurrent,x.contractAcquisitionNoncurrent]),
  check("operating leases current and noncurrent",(
   money(x.operatingLeaseLiabilityCurrent)+money(x.operatingLeaseLiabilityNoncurrent)).toString(),
   [x.operatingLeaseLiabilityCurrent,x.operatingLeaseLiabilityNoncurrent]),
  check("total current and noncurrent deferred revenue",(
   money(x.deferredRevenueCurrent)+money(x.deferredRevenueNoncurrent)).toString(),
   [x.deferredRevenueCurrent,x.deferredRevenueNoncurrent]),
 ];
 const lines:Array<{key:string;value:string|null;section:string;disposition:PolicyDisposition;classification:string}>=[
  {key:"current_assets_reported",value:x.currentAssets,section:"Consolidated balance sheet",disposition:"book_asset_already_in_balance_sheet",classification:"Reported total: includes current contract costs when identified; never add separately"},
  {key:"net_ppe_reported",value:x.netPpe,section:"Consolidated balance sheet",disposition:"book_asset_already_in_balance_sheet",classification:"Net tangible fixed capital; already includes any booked internal-use software within PPE"},
  {key:"goodwill",value:x.goodwill,section:"Consolidated balance sheet and goodwill note",disposition:"book_asset_already_in_balance_sheet",classification:"Acquisition premium; goodwill policy for economic capital not approved"},
  {key:"acquired_intangibles_net",value:x.netPurchasedIntangibles,section:"Acquired intangible assets note",disposition:"book_asset_already_in_balance_sheet",classification:"Finite-life purchased IP and client assets; already recognised, not internal R&D capital"},
  {key:"acquired_developed_technology_net",value:x.purchasedDevelopedTechnologyNet,section:"Acquired intangible assets note",disposition:x.purchasedDevelopedTechnologyNet===null?"original_note_amount_not_separately_allocated":"book_asset_already_in_balance_sheet",classification:"Subset of acquired intangibles, never another additive capital item"},
  {key:"contract_acquisition_costs_total",value:x.contractAcquisitionTotal,section:"Contract acquisition costs or deferred commissions note",disposition:"book_asset_already_in_balance_sheet",classification:"Capitalised sales-contract acquisition costs already in current/long-term assets"},
  {key:"contract_acquisition_current",value:x.contractAcquisitionCurrent,section:"Balance sheet and contract cost note",disposition:x.contractAcquisitionCurrent===null?"original_note_amount_not_separately_allocated":"book_asset_already_in_balance_sheet",classification:"If known, already included in current assets"},
  {key:"contract_acquisition_noncurrent",value:x.contractAcquisitionNoncurrent,section:"Balance sheet and contract cost note",disposition:x.contractAcquisitionNoncurrent===null?"original_note_amount_not_separately_allocated":"book_asset_already_in_balance_sheet",classification:"If known, already included in other long-term assets"},
  {key:"contract_assets_total",value:x.contractAssets,section:"Revenue recognition/contract assets note",disposition:x.contractAssets===null?"not_quantified_do_not_impute_zero":"book_asset_already_in_balance_sheet",classification:"Do not add contract assets to current assets: long-term/current split may be unknown"},
  {key:"deferred_revenue_current",value:x.deferredRevenueCurrent,section:"Consolidated balance sheet",disposition:"book_liability_already_in_balance_sheet",classification:"Operating performance obligation, not automatically full cash-debt or free financing"},
  {key:"deferred_revenue_noncurrent",value:x.deferredRevenueNoncurrent,section:"Consolidated balance sheet",disposition:"book_liability_already_in_balance_sheet",classification:"Deferred customer performance obligation, cash cost-to-serve policy unresolved"},
  {key:"operating_lease_rou",value:x.operatingLeaseRou,section:"Consolidated balance sheet",disposition:"book_asset_already_in_balance_sheet",classification:"ROU booked outside reported net PPE; baseline GAAP rent-inclusive return policy excludes separate lease financing capital"},
  {key:"operating_lease_current_liability",value:x.operatingLeaseLiabilityCurrent,section:"Consolidated balance sheet",disposition:"book_liability_already_in_balance_sheet",classification:"Already in current liabilities, not additional enterprise value debt under draft rent-inclusive policy"},
  {key:"operating_lease_noncurrent_liability",value:x.operatingLeaseLiabilityNoncurrent,section:"Consolidated balance sheet",disposition:"book_liability_already_in_balance_sheet",classification:"Excluded EV under draft operating lease rent-income policy"},
  {key:"finance_lease_liability",value:x.financeLeaseLiability,section:issuer==="NOW"?"FY2025 accounting policy Note 1":"FY annual filing lease note",disposition:x.financeLeaseLiability===null?"not_quantified_do_not_impute_zero":"reported_absent",classification:"NOW explicitly discloses NO finance leases; other issuers not cleared to zero"},
  {key:"hypothetical_5y_rd_asset",value:rd.closingAssetMillions,section:"2J17 separate six-year original SEC R&D roll-forward",disposition:"hypothetical_rnd_not_a_gaap_asset",classification:"Counterfactual R&D capital, not automatically additive to already booked development costs"},
 ].map(({key,value,section,disposition,classification})=>({
  key,amountMillions:value,sourceSection:section,
  sourceUrl:key==="hypothetical_5y_rd_asset"?rd.sourceOriginalAnnualCohorts[5].original10k:original.sourceUrl,
  disposition,classification,
 }));
 const notes=[
  "Do not sum reported net purchased intangibles, purchased technology subset, goodwill, operating ROU, contract assets and booked current assets into a new balance sheet. Identify embedding first.",
  "Do not treat contract acquisition amortisation as research amortisation; FY R&D source series are a separate hypothetical cohort convention.",
  "Do not automatically remove the entire face value of deferred revenue from operating capital; cost-to-serve and contract accounting need reviewed operating policy.",
  "Operating lease ROU and operating lease funding must be symmetrical with rent-inclusive GAAP operating earnings. No standalone lease-adjusted ROC produced.",
  "Acquisition intangibles and goodwill inclusion/exclusion materially changes capital denominator; accounting for acquisitions requires invested capital and earnings scope alignment.",
  "Cash and investments classified as operational vs nonoperational and finance lease liabilities are still not resolved across all issuers.",
  original.policy.contractCostDescription,original.policy.contractAssetDescription,
  original.policy.developedSoftwareDescription,
 ];
 if(issuer==="NOW")notes.push("The original 2025 10-K expressly states no financing leases; this issuer-specific absence is not generalised.");
 if(issuer==="ADSK")notes.push("A 913m contract-cost asset with unknown current/noncurrent split is not a reason to write either component as zero.");
 const otherAssets=money(x.netPurchasedIntangibles)+money(x.goodwill)+money(x.operatingLeaseRou)+money(x.contractAcquisitionTotal);
 return {
  issuer,policyVersion:SEC_2J18_POLICY,
  source:{fiscalEnd:original.periodEnd,original10k:original.sourceUrl,rdAnnualSource:rd.sourceOriginalAnnualCohorts[5].original10k,cutoff:"2026-10-09T20:00:00Z"},
  observed:lines,checks,
  report:{
   contractCostCurrentNoncurrentReconciled:split(x.contractAcquisitionTotal,x.contractAcquisitionCurrent,x.contractAcquisitionNoncurrent),
   contractCostAlreadyInReportedAssets:true,acquiredIntangiblesAlreadyInReportedAssets:true,
   operatingRouAlreadyInReportedAssets:true,deferredRevenueAlreadyInCurrentAndNoncurrentLiabilities:true,
   separateFinanceLeaseQuantified:x.financeLeaseLiability!==null,
   unverifiedCurrentAssetContractAllocation:x.contractAssets!==null||x.contractAcquisitionCurrent===null,
   negativeWorkingCapitalMillions:(money(x.currentAssets)-money(x.currentLiabilities)).toString(),
   fiveYearHypotheticalRAndDAssetMillions:rd.closingAssetMillions,
   fiveYearHypotheticalAdjustedOperatingIncomeMillions:rd.illustrativeAdjustedAnnualOperatingIncomeMillions,
   fiveYearHypotheticalRDAdjustmentNotInGAAPBalanceSheet:true,
   unadjustedGAAPCurrentAssetsMillions:x.currentAssets,unadjustedGAAPCurrentLiabilitiesMillions:x.currentLiabilities,
   auditedBookAssetSubtotalNotAdditionalCapitalMillions:otherAssets.toString(),
   missingAccountingDecisions:notes,
  },
  gates:{
   eachAvailableBridgePass:true,historicalFYMatchesRAndD:true,
   independentHumanReviewerSigned:false,sameDateTTMAvailable:false,cashDistributabilityReviewed:false,
   contractAssetsFullyAllocated:false,acquiredIntangibleOverlapReviewed:false,
   leaseAndDeferredRevenuePolicyApproved:false,operatingEconomicCapitalUsd:null,returnOnCapitalBps:null,
   validMagicFormulaRank:false,modelEligible:false,scoringEligible:false,storedChanges:0,
  },
 };
}
export function assessThreeSoftwarePerimeters(){
 const assessments=(["ADBE","ADSK","NOW"] as const).map(evaluateSoftwareOperatingCapitalPerimeter);
 return {version:SEC_2J18_POLICY,assessments,
  scope:"FY-only original 10-K issuer accounting; NOT current-to-October 9 capital, no production ROI.",
  canCompareCapitalReturns:false as const,canScore:false as const,storedChanges:0 as const};
}
