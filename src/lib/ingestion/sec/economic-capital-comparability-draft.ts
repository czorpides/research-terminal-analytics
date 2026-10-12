/**
 * Phase 2J15: DRAFT economic capital/financing perimeter and software
 * comparability decision record. No database, market API, model write or rank.
 *
 * Source fields are manually transcribed from original SEC 10-K/10-Q and
 * arithmetically cross-checked. "Observed" is NOT reviewer-approved economic
 * classification. Missing financing claims never become approved zero.
 */
import {getSec2J14Reconciliation} from "./latest-asof-reconciliation.ts";
import type {SecScenarioSymbol} from "./point-in-time-valuation-sensitivity.ts";

export const SEC_2J15_POLICY = "sec.research.economic_capital_comparability.draft.v1.0.0" as const;
const ADBE_ORIGINAL_FY_10K="https://www.sec.gov/Archives/edgar/data/796343/000079634326000003/adbe-20251128.htm";
const ADBE_ORIGINAL_Q3_10Q="https://www.sec.gov/Archives/edgar/data/796343/000079634326000156/adbe-20260828.htm";

type FinancingClaimStatus="observed"|"embedded_do_not_add"|"policy_excluded"|"unresolved";
export type FinancingClaim={
 category:"borrowing"|"commercial_paper"|"finance_lease"|"operating_lease"|
  "preferred"|"noncontrolling_interest"|"other_financing";
 status:FinancingClaimStatus;
 observedMillions:string|null;
 includedInIllustrativeEV:boolean;
 sourceUrl:string|null;
 evidence:string;
};
export type LiquidityStress={
 label:"none_deducted"|"half_of_unprotected_book_liquidity"|"full_unprotected_book_liquidity";
 hypotheticalDeductionMillions:string;
 residualOperationalBookLiquidityMillions:string;
 conditionalEVUsd:string;
 conditionalOperatingEarningsYieldBps:string;
 approved:false;
};
export type SecEconomicReview={
 symbol:SecScenarioSymbol;
 asOf:"2026-10-09T20:00:00Z";
 policyVersion:typeof SEC_2J15_POLICY;
 sourceAccession:string;
 sourceUrl:string;
 liquidity:{
  observedLiquidAssetsMillions:string;
  observedSettlementReceivablesMillions:string|null;
  observedProtectedFundsBasis:"unsettled_card_receivables"|"unquantified";
  unprotectedBookLiquidityCeilingMillions:string;
  economicallyRequiredOperatingCashMillions:null;
  reviewedSurplusCashMillions:null;
  liquidityPolicy:"cash_reserve_and_distributability_unreviewed";
  scenarios:LiquidityStress[];
 };
 financing:{
  ledger:FinancingClaim[];
  nonleaseBorrowingCarryingMillions:string;
  financeLeaseAddedMillions:string|null;
  operatingLeaseExcludedMillions:string;
  preferredIssuedMillions:string;
  commercialPaperAlreadyInDebtMillions:string|null;
  unquantifiedFinancingClaims:boolean;
  economicEVApproved:false;
 };
 software:null|{
  ttmRevenueMillions:string;
  ttmOperatingIncomeMillions:string;
  ttmResearchDevelopmentMillions:string;
  ttmOperatingCashFlowMillions:string;
  ttmStockBasedCompensationMillions:string;
  ttmCashFlowLessSbcDiagnosticMillions:string;
  ttmOperatingMarginBps:string;
  ttmResearchDevelopmentIntensityBps:string;
  ttmOperatingCashFlowToOperatingEarningsBps:string;
  ttmCashFlowLessSbcToOperatingEarningsBps:string;
  statementArithmeticChecks:Array<{label:string;bridge:string;expected:string;pass:boolean}>;
  cashFlowNotFreeCashFlow:true;
  grossROCBasis:"excluded_negative_or_uncertain_operating_tangible_capital";
  genericMagicFormulaROCBps:null;
  capitalizedRAndDRocBps:null;
  softwareEconomicCapitalApproval:"blocked_lacks_historical_rnd_amortization_and_deferred_revenue_policy";
  intersectorComparable:false;
 };
 blockers:string[];
 governance:{
  independentReviewerAttestation:false;
  reviewedOperatingCashBuffer:false;
  fullyReconciledFinancingClaims:false;
  contemporaneousExactEquityCap:false;
  sectorComparableReturnOnCapital:false;
  readyForCrossCompanyRanking:false;
  readyForRadar:false;
  modelEligible:false;
  scoringEligible:false;
  storedChanges:0;
 };
};
const whole=(s:string):bigint=>{
 if(!/^(0|[1-9]\d*)$/.test(s))throw new Error("Nonnegative exact SEC statement USD millions required");
 return BigInt(s);
};
const bps=(n:bigint,d:bigint)=>((n*10000n+d/2n)/d).toString();
const bridge=(label:string,a:string,b:string,c:string,result:string)=>{
 const actual=(whole(a)+whole(b)-whole(c)).toString();
 return {label,bridge:a+" + "+b+" - "+c,expected:result,pass:actual===result};
};
/**
 * All operating income/TTM, financing and price inputs are imported ONLY from
 * already cross-footed 2J14. This cannot confer a verified source credential.
 */
export function evaluateSecEconomicCapitalDraft(symbol:SecScenarioSymbol):SecEconomicReview{
 const old=getSec2J14Reconciliation(symbol);
 if(old.financingBridges.some(x=>!x.pass)||old.earnings.reportedSourceArithmeticPass!==true||
    old.controls.modelEligible!==false||old.controls.scoringEligible!==false||
    old.priceDate!=="2026-10-09T20:00:00Z"){
  throw new Error("Source bridge, original as-of or no-scoring gate was violated");
 }
 const isAdobe=symbol==="ADBE",liquid=whole(old.latestBalance.cashAndInvestmentsMillions);
 const unsettled=isAdobe?null:2842n;
 const protectedForStress=unsettled??0n; // unobserved != confirmed absence
 const ceiling=liquid-protectedForStress;
 if(ceiling<0n||ceiling.toString()!==old.latestBalance.cashDeductionCeilingMillions)
  throw new Error("Cash scope does not reconcile with original latest balance");
 const debt=whole(old.latestBalance.carryingBorrowingsExLeasesMillions);
 const financeLease=old.latestBalance.financeLeaseLiabilitiesMillions===null?
  null:whole(old.latestBalance.financeLeaseLiabilitiesMillions);
 const leaseOperating=whole(old.latestBalance.operatingLeaseCurrentMillions)+
  whole(old.latestBalance.operatingLeaseNoncurrentMillions);
 const note=old.financialSource.originalUrl;
 const claim=(category:FinancingClaim["category"],status:FinancingClaimStatus,
  amount:string|null,add:boolean,evidence:string,sourceUrl:string|null=note):FinancingClaim=>({
   category,status,observedMillions:amount,includedInIllustrativeEV:add,sourceUrl,evidence,
  });
 const ledger:FinancingClaim[]=[
  claim("borrowing","observed",debt.toString(),true,
   isAdobe?
    "Q3 FY2026 Note 14 current 1,597 + noncurrent 4,766; paper 248 already inside current":
    "FY2026 10-K Note 4 current and noncurrent debt 2,248 + 3,914"),
  claim("commercial_paper",isAdobe?"embedded_do_not_add":"unresolved",
   isAdobe?"248":null,false,
   isAdobe?
    "Short-term commercial paper 248 is ALREADY in Adobe current carrying debt 1,597; do not add again":
    "Separate paper borrowing status was not independently reconciled for this issuer",
   isAdobe?note:null),
  claim("finance_lease",financeLease===null?"unresolved":"observed",
   financeLease?.toString()??null,financeLease!==null,
   financeLease===null?
    "Not separately quantified in the reviewed Q3 filing; unavailable and not verified zero":
    "FY2026 Note 5 current finance 94 + noncurrent finance 1,319"),
  claim("operating_lease","policy_excluded",leaseOperating.toString(),false,
   "Draft rent-inclusive GAAP operating-income policy excludes operating leases from EV; fully capitalised lease-adjusted policy would require a new version"),
  claim("preferred","observed","0",false,
   "Latest original filed balance sheet shows preferred shares authorised but none issued"),
  claim("noncontrolling_interest","unresolved",null,false,
   "No independently reviewed current noncontrolling-interest claim or certified zero"),
  claim("other_financing","unresolved",null,false,
   "No independently comprehensive instrument-by-instrument economic obligations note reconciliation"),
 ];
 const cp=ledger.find(x=>x.category==="commercial_paper")!;
 const borrow=ledger.find(x=>x.category==="borrowing")!;
 if(!borrow.includedInIllustrativeEV||cp.includedInIllustrativeEV||
    ledger.filter(x=>x.category==="borrowing"&&x.includedInIllustrativeEV).length!==1||
    (isAdobe&&cp.status!=="embedded_do_not_add")||
    ledger.find(x=>x.category==="noncontrolling_interest")!.observedMillions!==null){
  throw new Error("Overlapping financing claims or unverified zero NCI");
 }
 const equity=whole(old.market.proxyMarketCapUsd),earnings=whole(old.earnings.trailing12MonthsOperatingIncomeMillions);
 const shocks=[
  {label:"none_deducted" as const,deduct:0n},
  {label:"half_of_unprotected_book_liquidity" as const,deduct:ceiling/2n},
  {label:"full_unprotected_book_liquidity" as const,deduct:ceiling},
 ];
 const cases:LiquidityStress[]=shocks.map(s=>{
  // Absent financing claims remain **unknown**. This is a hypothetical EV
  // conditional on those unobserved claims being zero; NOT certified debt.
  const hypotheticalEV=equity+(debt+(financeLease??0n)-s.deduct)*1000000n;
  if(hypotheticalEV<=0n)throw new Error("Nonpositive conditional EV");
  return {
   label:s.label,hypotheticalDeductionMillions:s.deduct.toString(),
   residualOperationalBookLiquidityMillions:(liquid-s.deduct).toString(),
   conditionalEVUsd:hypotheticalEV.toString(),
   conditionalOperatingEarningsYieldBps:bps(earnings*1000000n,hypotheticalEV),
   approved:false,
  };
 });
 let software:SecEconomicReview["software"]=null;
 if(isAdobe){
  // Independent original issuer 10-K FY2025 and original Q3 FY2026 10-Q
  // YTD comparatives. Never use subscription ARR in place of GAAP revenue.
  const fiscal={revenue:"23769",rnd:"4294",cfo:"10031",sbc:"1942"};
  const ytd26={revenue:"19776",rnd:"3596",cfo:"7646",sbc:"1582"};
  const ytd25={revenue:"17575",rnd:"3196",cfo:"6871",sbc:"1453"};
  const ttm={revenue:"25970",rnd:"4694",cfo:"10806",sbc:"2071"};
  const checks=[
   bridge("GAAP total revenue",fiscal.revenue,ytd26.revenue,ytd25.revenue,ttm.revenue),
   bridge("GAAP research and development",fiscal.rnd,ytd26.rnd,ytd25.rnd,ttm.rnd),
   bridge("GAAP operating cash flow",fiscal.cfo,ytd26.cfo,ytd25.cfo,ttm.cfo),
   bridge("GAAP stock compensation added back in cash-flow statement",fiscal.sbc,ytd26.sbc,ytd25.sbc,ttm.sbc),
  ];
  if(checks.some(x=>!x.pass)||old.earnings.trailing12MonthsOperatingIncomeMillions!=="9271")
   throw new Error("Adobe trailing economic quality source cross-foot mismatch");
  const revenue=whole(ttm.revenue),rnd=whole(ttm.rnd),cfo=whole(ttm.cfo),sbc=whole(ttm.sbc);
  if(sbc>cfo||earnings!==9271n||revenue<=0n)throw new Error("Invalid GAAP earnings/quality bridge");
  software={
   ttmRevenueMillions:revenue.toString(),ttmOperatingIncomeMillions:earnings.toString(),
   ttmResearchDevelopmentMillions:rnd.toString(),ttmOperatingCashFlowMillions:cfo.toString(),
   ttmStockBasedCompensationMillions:sbc.toString(),
   ttmCashFlowLessSbcDiagnosticMillions:(cfo-sbc).toString(),
   ttmOperatingMarginBps:bps(earnings,revenue),
   ttmResearchDevelopmentIntensityBps:bps(rnd,revenue),
   ttmOperatingCashFlowToOperatingEarningsBps:bps(cfo,earnings),
   ttmCashFlowLessSbcToOperatingEarningsBps:bps(cfo-sbc,earnings),
   statementArithmeticChecks:checks,
   cashFlowNotFreeCashFlow:true,
   grossROCBasis:"excluded_negative_or_uncertain_operating_tangible_capital",
   genericMagicFormulaROCBps:null,capitalizedRAndDRocBps:null,
   softwareEconomicCapitalApproval:"blocked_lacks_historical_rnd_amortization_and_deferred_revenue_policy",
   intersectorComparable:false,
  };
 }
 const blockers=[
  "Enterprise value still hypothetical: outstanding NCI and other financing claims are not proven zero.",
  "Capital and market values must have aligned SEC availability/share-class coverage; October quote × earlier reported shares is only a proxy.",
  "No verified minimum operating cash, unrestricted liquidity, debt covenant or working capital reserve; stress percentages are NOT evidence of distributability.",
  "Operating lease baseline exclusion only matches rent-inclusive reported earnings; no mixed lease-adjusted EBIT.",
  "Actual enterprise value and cross-company Magic Formula rankings are not approved.",
  ...(isAdobe?[
   "No independently quantified finance lease liability/ROU assets: hypothetical EV omits unknown lease finance claims.",
   "Deferred revenue, multi-year R&D capitalization/amortization, acquisition and intangible assets invalidate unmodified industrial tangible-capital ROC.",
   "Operating cash flow includes stock compensation add-back. CFO minus SBC is only an informative sensitivity, NOT free cash flow, and no capital-based return is produced.",
  ]:[
   "Customer card settlement receivables 2,842m protected by analytical policy from surplus deductions; other operational cash needs unmeasured.",
   "Capital employed needs separate operational cash and issuer financing perimeter sign-off before Greenblatt ROC.",
  ]),
 ];
 return {
  symbol,asOf:"2026-10-09T20:00:00Z",policyVersion:SEC_2J15_POLICY,
  sourceAccession:old.financialSource.accession,sourceUrl:old.financialSource.originalUrl,
  liquidity:{
   observedLiquidAssetsMillions:liquid.toString(),
   observedSettlementReceivablesMillions:unsettled?.toString()??null,
   observedProtectedFundsBasis:isAdobe?"unquantified":"unsettled_card_receivables",
   unprotectedBookLiquidityCeilingMillions:ceiling.toString(),
   economicallyRequiredOperatingCashMillions:null,reviewedSurplusCashMillions:null,
   liquidityPolicy:"cash_reserve_and_distributability_unreviewed",
   scenarios:cases,
  },
  financing:{
   ledger,nonleaseBorrowingCarryingMillions:debt.toString(),
   financeLeaseAddedMillions:financeLease?.toString()??null,
   operatingLeaseExcludedMillions:leaseOperating.toString(),
   preferredIssuedMillions:"0",commercialPaperAlreadyInDebtMillions:cp.observedMillions,
   unquantifiedFinancingClaims:true,economicEVApproved:false,
  },
  software,blockers,
  governance:{
   independentReviewerAttestation:false,reviewedOperatingCashBuffer:false,
   fullyReconciledFinancingClaims:false,contemporaneousExactEquityCap:false,
   sectorComparableReturnOnCapital:false,readyForCrossCompanyRanking:false,
   readyForRadar:false,modelEligible:false,scoringEligible:false,storedChanges:0,
  },
 };
}
