/**
 * Phase 2J19 — versioned, purely hypothetical operating-capital accounting matrix.
 *
 * Starts from disclosed FY balance-sheet components, not a certified ROC
 * denominator. Every policy change is an EXPLICIT delta against the same
 * incomplete book-capital bridge, not a new balance-sheet asset or a rank.
 *
 * Source inputs: Phase 2J18 original issuer 10-K disclosure register and
 * Phase 2J17 nonoverlapping five-year hypothetical research roll-forward.
 * All arithmetic exact BigInt micro-USD millions; no writes or live scores.
 */
import {
 evaluateSoftwareOperatingCapitalPerimeter,
 type SoftwareCapitalReview,
} from "./software-operating-capital-perimeter.ts";
import {
 annualRDRollforward,
 type SoftwareHoldout,
} from "./rd-rollforward-third-issuer.ts";

export const SEC_2J19_POLICY="sec.research.software_capital_policy_matrix.draft.v1.0.0" as const;
export type AcquisitionTreatment="tangible_only"|"acquisition_inclusive";
export type DeferredRevenueTreatment="full_face"|"half_face"|"excluded_from_nwc";
export type OperatingLeaseTreatment="rent_inclusive"|"capitalized_lease";
export type ResearchTreatment="gaap_expensed"|"hypothetical_five_year";
export type SoftwareCapitalPolicy={
 acquisitions:AcquisitionTreatment;
 deferredRevenue:DeferredRevenueTreatment;
 operatingLeases:OperatingLeaseTreatment;
 research:ResearchTreatment;
};
export type SoftwareCapitalScenario={
 issuer:SoftwareHoldout;
 fiscalEnd:string;
 original10K:string;
 policyVersion:typeof SEC_2J19_POLICY;
 policy:SoftwareCapitalPolicy;
 reportedCurrentAssetsMillions:string;
 reportedCurrentLiabilitiesMillions:string;
 reportedNetPpeMillions:string;
 rawCurrentAssetsLessLiabilitiesPlusPpeMillions:string;
 observedCurrentOperatingLeaseLiabilityAdjustmentMillions:string;
 noncurrentContractCostIncludedOnceMillions:string|null;
 additivePolicyDeltas:{
  acquisitionsMillions:string;
  deferredRevenueReclassificationMillions:string;
  leaseRouCapitalMillions:string;
  hypotheticalResearchAssetMillions:string;
  knownPolicyDeltaMillions:string;
 };
 deferredRevenueRetainedInNwcMillions:string;
 operatingLeaseFinancingClaimInIllustrativeEVMillions:string;
 conditionalBookBridgeMillions:string|null;
 compatibleIllustrativeAnnualOperatingIncomeMillions:string|null;
 compatibleIllustrativeAnnualOperatingMarginBps:string|null;
 missingRequiredBookComponents:string[];
 blockers:string[];
 evidence:{
  originalAvailableCrossFootsMatched:boolean;
  originalContractLongTermSplitVerified:boolean;
  originalFinanceLeasePerimeterComplete:boolean;
  originalAcquiredTechnologyIsSubset:true;
  economicOperatingCashKnown:false;
  operatingDebtAndRestrictedAssetsReconciled:false;
  fullIntangiblesAndAcquisitionCapitalReviewed:false;
  actualDeferredRevenueCostToServeReviewed:false;
  operatingLeaseEarningsAndFinancingSymmetrical:boolean;
  pointInTimeCurrentCapital:false;
  independentHumanSecondReview:false;
 };
 investableCapitalMillions:null;
 economicallyComparableROCBps:null;
 enterpriseValueUsd:null;
 rankable:false;
 modelEligible:false;
 scoringEligible:false;
 writes:0;
};
const micros=1000000n;
const int=(v:string)=>{
 if(!/^(0|[1-9]\d*)$/.test(v))throw Error("Invalid original 10-K integer USD millions");
 return BigInt(v)*micros;
};
const fixed=(v:string)=>{
 if(!/^-?(0|[1-9]\d*)\.\d{6}$/.test(v))throw Error("Invalid original R&D six-decimal USD millions");
 const sign=v.startsWith("-")?-1n:1n;
 const t=v.replace("-","").replace(".","");
 return sign*BigInt(t);
};
const fmt=(v:bigint)=>{
 const s=v<0n?"-":"",a=v<0n?-v:v;
 return s+(a/micros).toString()+"."+(a%micros).toString().padStart(6,"0");
};
const bps=(n:bigint,d:bigint)=>{
 if(d<=0n)throw Error("Invalid original GAAP revenue");
 return ((n*10000n+d/2n)/d).toString();
};
const take=(r:SoftwareCapitalReview,key:string):string|null=>{
 const x=r.observed.find(x=>x.key===key);
 if(!x)throw Error("Missing original issuer reporting line "+key);
 return x.amountMillions;
};
const required=(r:SoftwareCapitalReview,key:string):bigint=>{
 const v=take(r,key);
 if(v===null)throw Error("Required original issuer line unquantified "+key);
 return int(v);
};
const ALL_ACQ:readonly AcquisitionTreatment[]=["tangible_only","acquisition_inclusive"];
const ALL_DEF:readonly DeferredRevenueTreatment[]=["full_face","half_face","excluded_from_nwc"];
const ALL_LEASE:readonly OperatingLeaseTreatment[]=["rent_inclusive","capitalized_lease"];
const ALL_RD:readonly ResearchTreatment[]=["gaap_expensed","hypothetical_five_year"];
export const DEFAULT_2J19_POLICY:SoftwareCapitalPolicy={
 acquisitions:"tangible_only",deferredRevenue:"full_face",
 operatingLeases:"rent_inclusive",research:"gaap_expensed",
};
export const SOFTWARE_POLICY_MATRIX:SoftwareCapitalPolicy[]=
 ALL_ACQ.flatMap(acquisitions=>ALL_DEF.flatMap(deferredRevenue=>
  ALL_LEASE.flatMap(operatingLeases=>ALL_RD.map(research=>({
   acquisitions,deferredRevenue,operatingLeases,research,
  })))));
function validatedPolicy(policy:SoftwareCapitalPolicy){
 if(!ALL_ACQ.includes(policy.acquisitions)||
  !ALL_DEF.includes(policy.deferredRevenue)||
  !ALL_LEASE.includes(policy.operatingLeases)||
  !ALL_RD.includes(policy.research))
  throw Error("Unapproved software economic-capital stress policy");
}
export function calculateSoftwareCapitalScenario(
 issuer:SoftwareHoldout,policy:SoftwareCapitalPolicy,
):SoftwareCapitalScenario{
 validatedPolicy(policy);
 const r=evaluateSoftwareOperatingCapitalPerimeter(issuer);
 const annual=annualRDRollforward(issuer,5);
 if(annual.fiscalPeriodEnd!==r.source.fiscalEnd||
  annual.sourceOriginalAnnualCohorts[5].original10k!==r.source.original10k||
  !r.gates.eachAvailableBridgePass||!r.gates.historicalFYMatchesRAndD||
  r.gates.modelEligible!==false||
  r.checks.some(x=>x.result!=="matched"&&x.result!=="cannot_check"))
  throw Error("Original SEC FY, arithmetic evidence or eligibility gate inconsistent");
 const CA=required(r,"current_assets_reported");
 const CL=int(r.report.unadjustedGAAPCurrentLiabilitiesMillions);
 const PPE=required(r,"net_ppe_reported");
 const currentOpLease=required(r,"operating_lease_current_liability");
 const longtermCommission=take(r,"contract_acquisition_noncurrent");
 const goodwill=required(r,"goodwill");
 const purchased=required(r,"acquired_intangibles_net");
 const developed=take(r,"acquired_developed_technology_net");
 const deferred=required(r,"deferred_revenue_current");
 const rou=required(r,"operating_lease_rou");
 const leaseCurrent=required(r,"operating_lease_current_liability");
 const leaseLong=required(r,"operating_lease_noncurrent_liability");
 if(developed!==null&&int(developed)>purchased)
  throw Error("Acquired technology is an overlapping intangible subset, not a second asset");
 const revenue=int(annual.revenueMillions);
 const gaapIncome=int(annual.reportedGAAPOperatingIncomeMillions);
 const raw=CA-CL+PPE;
 const acquisitionDelta=policy.acquisitions==="acquisition_inclusive"?goodwill+purchased:0n;
 const defRetained=policy.deferredRevenue==="full_face"?deferred:
  policy.deferredRevenue==="half_face"?deferred/2n:0n;
 const defReclass=deferred-defRetained;
 // Under BOTH lease methods the current obligation is classified as
 // financing rather than an operating payable. Capitalized-lease method also
 // adds its ROU to the capital bridge, but CANNOT calculate adjusted earnings
 // without disclosed rent, ROU depreciation and embedded lease financing.
 const leaseDelta=policy.operatingLeases==="capitalized_lease"?rou:0n;
 const leaseClaim=policy.operatingLeases==="capitalized_lease"?leaseCurrent+leaseLong:0n;
 const rnd=policy.research==="hypothetical_five_year"?
  fixed(annual.closingAssetMillions):0n;
 const delta=acquisitionDelta+defReclass+leaseDelta+rnd;
 const contractNoncurrent=longtermCommission===null?null:int(longtermCommission);
 const bookSubtotal=contractNoncurrent===null?null:
  raw+currentOpLease+contractNoncurrent+delta;
 const compatibleEarnings=policy.operatingLeases==="capitalized_lease"?null:
  policy.research==="hypothetical_five_year"?
   fixed(annual.illustrativeAdjustedAnnualOperatingIncomeMillions):gaapIncome;
 const finance=take(r,"finance_lease_liability");
 const missing:string[]=[];
 if(contractNoncurrent===null)
  missing.push("Original issuer FY noncurrent deferred commission split unquantified");
 if(finance===null)
  missing.push("Finance-lease liability not independently quantified for this issuer");
 const blockers=[
  "Current book assets minus book liabilities plus PPE is NOT an economic operating-capital definition: reported cash, nonoperating investments, current borrowings and other financing items are not removed.",
  "Only noncurrent contract acquisition costs are added to the partial bridge; any current component is already in reported current assets. Other long-lived operating assets remain unmeasured.",
  "Goodwill and acquired intangibles, when included, are hypothetical ADDITIONS to the narrow CA-CL+PPE subset, not an increase to GAAP recorded assets or a validated source of economic value.",
  "Acquired developed technology is within purchased intangibles: NEVER add the technology subset separately.",
  "Deferred-revenue face/half/none is a mechanical operating-liability reclassification, not a cost-to-serve estimate. Noncurrent deferred revenue is not in current liabilities and is unchanged.",
  "Every lease alternative removes current operating lease financing liability from the reported NWC subtotal; lease-capitalized alternative adds ROU and the current+noncurrent claim without adjusted EBIT, because rent/depreciation/interest cannot be source-matched.",
  "Five-year hypothetical R&D capital remains unvalidated against internally capitalized development expenditure and acquisition technology; its annual profit effect has no matching full issuer economic-capital base.",
  "Cash distributability, current borrowing and finance-lease overlap, contract asset allocation, goodwill acquisition economics and period-aligned historic shares are not approved.",
  "No independently signed original SEC accountant review or validated out-of-sample sector test; all resulting policy changes are sensitivity diagnostics only.",
  ...missing,
 ];
 return {
  issuer,fiscalEnd:r.source.fiscalEnd,original10K:r.source.original10k,
  policyVersion:SEC_2J19_POLICY,policy,
  reportedCurrentAssetsMillions:fmt(CA),
  reportedCurrentLiabilitiesMillions:fmt(CL),
  reportedNetPpeMillions:fmt(PPE),
  rawCurrentAssetsLessLiabilitiesPlusPpeMillions:fmt(raw),
  observedCurrentOperatingLeaseLiabilityAdjustmentMillions:fmt(currentOpLease),
  noncurrentContractCostIncludedOnceMillions:contractNoncurrent===null?null:fmt(contractNoncurrent),
  additivePolicyDeltas:{
   acquisitionsMillions:fmt(acquisitionDelta),
   deferredRevenueReclassificationMillions:fmt(defReclass),
   leaseRouCapitalMillions:fmt(leaseDelta),
   hypotheticalResearchAssetMillions:fmt(rnd),
   knownPolicyDeltaMillions:fmt(delta),
  },
  deferredRevenueRetainedInNwcMillions:fmt(defRetained),
  operatingLeaseFinancingClaimInIllustrativeEVMillions:fmt(leaseClaim),
  conditionalBookBridgeMillions:bookSubtotal===null?null:fmt(bookSubtotal),
  compatibleIllustrativeAnnualOperatingIncomeMillions:
   compatibleEarnings===null?null:fmt(compatibleEarnings),
  compatibleIllustrativeAnnualOperatingMarginBps:
   compatibleEarnings===null?null:bps(compatibleEarnings,revenue),
  missingRequiredBookComponents:missing,blockers,
  evidence:{
   originalAvailableCrossFootsMatched:r.checks.every(x=>x.result==="matched"||x.result==="cannot_check"),
   originalContractLongTermSplitVerified:contractNoncurrent!==null,
   originalFinanceLeasePerimeterComplete:finance!==null,
   originalAcquiredTechnologyIsSubset:true,
   economicOperatingCashKnown:false,
   operatingDebtAndRestrictedAssetsReconciled:false,
   fullIntangiblesAndAcquisitionCapitalReviewed:false,
   actualDeferredRevenueCostToServeReviewed:false,
   operatingLeaseEarningsAndFinancingSymmetrical:policy.operatingLeases==="rent_inclusive",
   pointInTimeCurrentCapital:false,independentHumanSecondReview:false,
  },
  investableCapitalMillions:null,economicallyComparableROCBps:null,
  enterpriseValueUsd:null,rankable:false,modelEligible:false,scoringEligible:false,writes:0,
 };
}
export function buildSoftwareCapitalMatrix(){
 const companies=(["ADBE","ADSK","NOW"] as const).map(issuer=>({
  issuer,
  cases:SOFTWARE_POLICY_MATRIX.map(policy=>calculateSoftwareCapitalScenario(issuer,policy)),
 }));
 return {
  version:SEC_2J19_POLICY,sourceAsOf:"2026-10-09T20:00:00Z",
  companies,totalCases:companies.reduce((n,x)=>n+x.cases.length,0),
  comparableReturnOnCapitalAvailable:false as const,
  eligibleForMagicFormula:false as const,eligibleForRadar:false as const,writes:0 as const,
 };
}