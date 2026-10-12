/**
 * Phase 2J20 — original SEC FY 10-K liquidity/current borrowing/contract and
 * operating lease EXPENSE evidence. Manual original-source extraction and
 * arithmetic checks only, not audited economic capital or human sign-off.
 *
 * This layer is intentionally a successor to the 2J19 capital *stress*.
 * An observed cash amount is not a verified surplus-cash deduction; an observed
 * rental expense is not ROU depreciation or embedded borrowing interest.
 */
import {
 evaluateSoftwareOperatingCapitalPerimeter,
 type SoftwareCapitalReview,
} from "./software-operating-capital-perimeter.ts";
import {
 annualRDRollforward,type SoftwareHoldout,
} from "./rd-rollforward-third-issuer.ts";
import {
 calculateSoftwareCapitalScenario,DEFAULT_2J19_POLICY,
} from "./software-capital-policy-matrix.ts";

export const SEC_2J20_POLICY="sec.research.original_fy_gap_closure.draft.v1.0.0" as const;
export const SEC_2J20_ASOF="2026-10-09T20:00:00Z" as const;
type CurrentBorrowingEvidence="explicit_zero_line"|"no_separate_debt_line_scope_unresolved";
type Fact={
 amountMillions:string|null;
 section:string;
 sourceUrl:string;
 sourceStatus:"explicit_reported"|"explicit_reported_absence"|"not_quantified";
};
type RecordRow={
 sourceUrl:string;fiscalEnd:string;
 liquidity:{
  cash:string;shortInvestments:string;otherCurrentComponents:readonly string[];
  identifiableRestrictedCashOutsideCashAndEquivalents:string|null;
  restrictedCashLocation:string|null;
  noncurrentInvestments:string|null;
 };
 financing:{
  currentBorrowings:string|null;
  currentBorrowingEvidence:CurrentBorrowingEvidence;
  noncurrentBorrowings:string;
  financeLeases:string|null;
  operatingLeaseCurrent:string;operatingLeaseNoncurrent:string;
 };
 leases:{
  annualOperatingLeaseExpense:string;
  separatelyIdentifiedFixedLeaseCost:string|null;
  separatelyIdentifiedVariableLeaseCost:string|null;
  cashPaidOperatingLeases:string;
  rouAnnualDepreciation:string|null;
  operatingLeaseInterest:string|null;
 };
};
const ADBE="https://www.sec.gov/Archives/edgar/data/796343/000079634326000003/adbe-20251128.htm";
const ADSK="https://www.sec.gov/Archives/edgar/data/769397/000076939726000015/adsk-20260131.htm";
const NOW="https://www.sec.gov/Archives/edgar/data/1373715/000137371526000007/now-20251231.htm";
export const ORIGINAL_FY_2J20_EVIDENCE:Record<SoftwareHoldout,RecordRow>={
 ADBE:{
  sourceUrl:ADBE,fiscalEnd:"2025-11-28",
  liquidity:{cash:"5431",shortInvestments:"1164",otherCurrentComponents:["2344","1224"],
   identifiableRestrictedCashOutsideCashAndEquivalents:null,restrictedCashLocation:null,
   noncurrentInvestments:null},
  financing:{currentBorrowings:"0",currentBorrowingEvidence:"explicit_zero_line",
   noncurrentBorrowings:"6210",financeLeases:"0",operatingLeaseCurrent:"77",operatingLeaseNoncurrent:"361"},
  leases:{annualOperatingLeaseExpense:"92",separatelyIdentifiedFixedLeaseCost:null,
   separatelyIdentifiedVariableLeaseCost:null,cashPaidOperatingLeases:"95",
   rouAnnualDepreciation:null,operatingLeaseInterest:null},
 },
 ADSK:{
  sourceUrl:ADSK,fiscalEnd:"2026-01-31",
  liquidity:{cash:"2249",shortInvestments:"348",otherCurrentComponents:["1439","906"],
   identifiableRestrictedCashOutsideCashAndEquivalents:null,restrictedCashLocation:null,
   noncurrentInvestments:"376"},
  financing:{currentBorrowings:"0",currentBorrowingEvidence:"explicit_zero_line",
   noncurrentBorrowings:"2483",financeLeases:null,operatingLeaseCurrent:"52",operatingLeaseNoncurrent:"199"},
  leases:{annualOperatingLeaseExpense:"68",separatelyIdentifiedFixedLeaseCost:"58",
   separatelyIdentifiedVariableLeaseCost:"10",cashPaidOperatingLeases:"89",
   rouAnnualDepreciation:null,operatingLeaseInterest:null},
 },
 NOW:{
  sourceUrl:NOW,fiscalEnd:"2025-12-31",
  liquidity:{cash:"3726",shortInvestments:"2558",otherCurrentComponents:["2627","590","970"],
   identifiableRestrictedCashOutsideCashAndEquivalents:"6",
   restrictedCashLocation:"Prepaid expenses and other current assets (NOT part of 3,726 cash/equivalents)",
   noncurrentInvestments:"3771"},
  financing:{currentBorrowings:null,currentBorrowingEvidence:"no_separate_debt_line_scope_unresolved",
   noncurrentBorrowings:"1491",financeLeases:"0",operatingLeaseCurrent:"112",operatingLeaseNoncurrent:"800"},
  leases:{annualOperatingLeaseExpense:"147",separatelyIdentifiedFixedLeaseCost:null,
   separatelyIdentifiedVariableLeaseCost:null,cashPaidOperatingLeases:"107",
   rouAnnualDepreciation:null,operatingLeaseInterest:null},
 },
};
const money=(v:string):bigint=>{
 if(!/^(0|[1-9]\d*)$/.test(v))throw Error("Invalid source original USD million number");
 return BigInt(v);
};
const bridge=(name:string,parts:readonly string[],reported:string)=>{
 const sum=parts.reduce((a,v)=>a+money(v),0n);
 if(sum!==money(reported))throw Error("Original SEC statement crossfoot FAILED: "+name);
 return {name,originalComponents:parts,reportedMillions:reported,computedMillions:sum.toString(),
  passed:true as const};
};
const observed=(amountMillions:string|null,section:string,sourceUrl:string,
 absent=false):Fact=>({
 amountMillions,section,sourceUrl,
 sourceStatus:amountMillions===null?"not_quantified":
  absent?"explicit_reported_absence":"explicit_reported",
});
export function reconcileSoftwareFiscalEvidence(issuer:SoftwareHoldout){
 const x=ORIGINAL_FY_2J20_EVIDENCE[issuer];
 if(!x)throw Error("Unapproved issuer 2J20");
 const orig=evaluateSoftwareOperatingCapitalPerimeter(issuer);
 const FY=annualRDRollforward(issuer,5);
 if(orig.source.original10k!==x.sourceUrl||orig.source.fiscalEnd!==x.fiscalEnd||
  FY.fiscalPeriodEnd!==x.fiscalEnd||
  !orig.checks.every(c=>c.result==="matched"||c.result==="cannot_check")||
  !orig.gates.eachAvailableBridgePass||
  orig.gates.modelEligible!==false||
  orig.gates.scoringEligible!==false)
  throw Error("Original-source identity/reconciliation gate failed");
 const o=x.liquidity,f=x.financing,l=x.leases;
 const CA=money(orig.report.unadjustedGAAPCurrentAssetsMillions);
 const cash=money(o.cash),short=money(o.shortInvestments);
 const visibleCash=cash+short;
 const longCash=o.noncurrentInvestments===null?null:money(o.noncurrentInvestments);
 const checks=[
  bridge("original reported current asset components",[
   o.cash,o.shortInvestments,...o.otherCurrentComponents],CA.toString()),
  bridge("reported current cash + short-investment subtotal",
   [o.cash,o.shortInvestments],visibleCash.toString()),
  bridge("original reported operating lease liabilities",[
   f.operatingLeaseCurrent,f.operatingLeaseNoncurrent],
   (money(f.operatingLeaseCurrent)+money(f.operatingLeaseNoncurrent)).toString()),
 ];
 if(l.separatelyIdentifiedFixedLeaseCost!==null&&l.separatelyIdentifiedVariableLeaseCost!==null)
  checks.push(bridge("operating lease fixed and variable cost disaggregation",
   [l.separatelyIdentifiedFixedLeaseCost,l.separatelyIdentifiedVariableLeaseCost],
   l.annualOperatingLeaseExpense));
 const knownFinance=orig.observed.find(v=>v.key==="finance_lease_liability")?.amountMillions;
 if(knownFinance!==f.financeLeases)throw Error("Original finance-lease absence or missing-value conflict");
 if(f.currentBorrowingEvidence==="explicit_zero_line"&&f.currentBorrowings!=="0")
  throw Error("Explicit original year current borrowing must be zero");
 if(f.currentBorrowingEvidence==="no_separate_debt_line_scope_unresolved"&&f.currentBorrowings!==null)
  throw Error("No independently presented current debt amount is not zero");
 if(l.rouAnnualDepreciation!==null||l.operatingLeaseInterest!==null)
  throw Error("No matching lease operating-interest/depreciation split has been reviewed");
 const base=calculateSoftwareCapitalScenario(issuer,DEFAULT_2J19_POLICY);
 if(base.policy.operatingLeases!=="rent_inclusive"||
  base.rankable!==false||base.writes!==0)
  throw Error("Original partial software book-capital baseline no longer safe");
 const cashVsCapitalStress=[
  {policy:"retain_all_reported_liquid_assets" as const,amount:0n},
  {policy:"remove_reported_cash_equivalents_only" as const,amount:cash},
  {policy:"remove_reported_cash_and_current_securities" as const,amount:visibleCash},
 ];
 const partial=base.conditionalBookBridgeMillions===null?
  null:BigInt(base.conditionalBookBridgeMillions.replace(".",""));
 const scenarios=cashVsCapitalStress.map(v=>({
  name:v.policy,originalBookLiquidAssetRemovalMillions:v.amount.toString(),
  conditionalUnapprovedCapitalSubsetMillions:partial===null?null:
   (()=>{
    const res=partial-v.amount*1000000n;
    const abs=res<0n?-res:res,sign=res<0n?"-":"";
    return sign+(abs/1000000n).toString()+"."+(abs%1000000n).toString().padStart(6,"0");
   })(),
  verifiedSurplusCashDeductionMillions:null,
  validOperatingCapital:false as const,
 }));
 const FYop=money(FY.reportedGAAPOperatingIncomeMillions);
 const leaseExpense=money(l.annualOperatingLeaseExpense);
 const sourceFacts={
  reportedCashAndEquivalents:observed(o.cash,"Original FY consolidated balance sheet",x.sourceUrl),
  reportedShortTermSecurities:observed(o.shortInvestments,"Original FY consolidated balance sheet",x.sourceUrl),
  otherCurrentAssetsKnown:observed((CA-visibleCash).toString(),
   "Original FY consolidated balance sheet, all remaining current-asset components",x.sourceUrl),
  currentInterestBorrowings:observed(f.currentBorrowings,"Original FY consolidated balance sheet and debt note",x.sourceUrl,f.currentBorrowings==="0"),
  longtermBorrowingsCarrying:observed(f.noncurrentBorrowings,"Original FY consolidated balance sheet / debt note",x.sourceUrl),
  financeLeases:observed(f.financeLeases,"Original FY lease policy, explicit absence where disclosed",x.sourceUrl,f.financeLeases==="0"),
  operatingLeaseExpense:observed(l.annualOperatingLeaseExpense,"Original FY lease note, total lease costs",x.sourceUrl),
  fixedLeaseExpense:observed(l.separatelyIdentifiedFixedLeaseCost,
   "Original FY lease note — separately named operating lease fixed component",x.sourceUrl),
  variableLeaseExpense:observed(l.separatelyIdentifiedVariableLeaseCost,
   "Original FY lease note — separately named variable component",x.sourceUrl),
  operatingLeaseCashPaid:observed(l.cashPaidOperatingLeases,"Original FY lease note / cash paid disclosure",x.sourceUrl),
  leaseRouDepreciation:observed(null,"No separate verified ASC842 operating ROU amortization/depreciation",x.sourceUrl),
  leaseFinancingInterest:observed(null,"No separate verified lease interest expense for operating leases",x.sourceUrl),
  reportedRestrictedCashOutsideEquivalents:observed(o.identifiableRestrictedCashOutsideCashAndEquivalents,
   "Original FY operating cash-flow reconciliation; included in prepaid/other assets if observed",x.sourceUrl),
  contractAssetCurrentSplit:observed(
   orig.observed.find(y=>y.key==="contract_assets_total")?.amountMillions===null?
    null:null,
   "Original FY contract asset note; current/long-term split is unavailable",x.sourceUrl),
  contractCostNoncurrentSplit:observed(
   orig.observed.find(y=>y.key==="contract_acquisition_noncurrent")?.amountMillions??null,
   "Original FY contract acquisition accounting note",x.sourceUrl),
 };
 return {
  issuer,sourceFY:x.fiscalEnd,official10K:x.sourceUrl,policyVersion:SEC_2J20_POLICY,
  cutoff:SEC_2J20_ASOF,
  checks,
  finance:{
   reportedCurrentBorrowingMillions:f.currentBorrowings,
   currentBorrowingEvidence:f.currentBorrowingEvidence,
   reportedLongtermBorrowingCarryingMillions:f.noncurrentBorrowings,
   explicitFinanceLeaseMillions:f.financeLeases,
   currentOperatingLeaseLiabilityMillions:f.operatingLeaseCurrent,
   noncurrentOperatingLeaseLiabilityMillions:f.operatingLeaseNoncurrent,
   comprehensiveFinancingPerimeterApproved:false as const,
  },
  liquidity:{
   cashMillions:o.cash,shortTermSecuritiesMillions:o.shortInvestments,
   reportedLiquidBookAmountMillions:visibleCash.toString(),
   noncurrentInvestmentBookAmountMillions:longCash?.toString()??null,
   explicitlyLocatedRestrictedCashOutsideCashMillions:
    o.identifiableRestrictedCashOutsideCashAndEquivalents,
   restrictedCashLocation:o.restrictedCashLocation,
   reviewedOperatingCashBufferMillions:null,
   reviewedFreelyAvailableCashMillions:null,
   bookCashIsNotEconomicallySurplus:true as const,
   alreadyBookedRestrictedCashNotSubtractedFromCashTwice:true as const,
   scenarios,
  },
  leases:{
   originalReportedAnnualOperatingExpenseMillions:l.annualOperatingLeaseExpense,
   separatelyIdentifiedFixedCostMillions:l.separatelyIdentifiedFixedLeaseCost,
   separatelyIdentifiedVariableCostMillions:l.separatelyIdentifiedVariableLeaseCost,
   originalOperatingLeaseCashPaidMillions:l.cashPaidOperatingLeases,
   sourceObservationPretaxOperatingIncomeBeforeDisclosedLeaseCostMillions:
    (FYop+leaseExpense).toString(),
   rouAmortizationWithinGAAPOperatingExpenseMillions:null,
   leaseImpliedInterestExpenseMillions:null,
   compatibleCapitalizedLeaseEBITMillions:null,
   compatibleCapitalizedLeaseOperatingMarginBps:null,
   observationIsNotCapitalizedLeaseEBIT:true as const,
   leaseMatchedNumeratorDenominatorApproved:false as const,
  },
  contractAssets:{
   currentLongtermAssetLocationResolved:false as const,
   longtermCapitalizedCommissionMillions:
    orig.observed.find(y=>y.key==="contract_acquisition_noncurrent")?.amountMillions??null,
   noteContractCostReconciled:orig.report.contractCostCurrentNoncurrentReconciled,
   contractCommissionExpenseNotResearch:true as const,
  },
  sourceFacts,
  unresolved:[
   "Reported cash and investments are NOT unrestricted excess funds: payroll, acquisitions, vendor/hosting obligations, buybacks, tax and covenant requirements remain.",
   "No objective FY minimum operating cash, required liquidity buffer, market-timestamped availability or cash-location restriction policy established.",
   "Reported FY finance borrowing balances do not prove every other supplier-finance, financial guarantee or hybrid economic claim absent.",
   "Contract assets are embedded in current/long-term reported totals with no independently verified current/noncurrent breakdown; don't add the entire contract asset to current assets.",
   "Lease expense is observed but operating-lease ROU amortization and implicit finance interest cannot be isolated; an expense add-back is NOT valid lease-adjusted EBIT.",
   "Historical fiscal-year-end balance and GAAP earnings differ from October 2026 market date and 2026 interim updates; do not price/rank as contemporaneous.",
   "Separate human original SEC accounting attestation and independently sourced held-out issuer audit remain outstanding.",
  ],
  gates:{
   originalStatementArithmeticChecksPassed:true as const,
   originalReportedSourceMatchesPreviousReview:true as const,
   independentlyReviewedFinancialClassification:false as const,
   verifiedFreelyAvailableSurplusCash:false as const,
   contractAssetSplitComplete:false as const,
   totalFinancingPerimeterComplete:false as const,
   leaseEBITToCapitalReconciliationComplete:false as const,
   issuerEconomicCapitalComplete:false as const,
   comparableReturnOnCapitalBps:null,
   modelEligible:false as const,scoringEligible:false as const,
   databaseWrites:0 as const,
  },
 };
}
export function verifyThreeSoftwareFYSourceGaps(){
 const cases=(["ADBE","ADSK","NOW"] as const).map(reconcileSoftwareFiscalEvidence);
 return {
  version:SEC_2J20_POLICY,sourceAsOf:SEC_2J20_ASOF,
  cases,verifiedEconomicReturns:0 as const,readyForModel:false as const,
  readyForRanking:false as const,databaseWrites:0 as const,
 };
}