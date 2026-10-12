/**
 * Phase 2J14: original SEC filing arithmetic + market-date-aware valuation
 * counterfactual. All monetary statement values USD MILLIONS.
 *
 * Not a provider feed, reviewer sign-off, or source authentication. Point-
 * in-time as-of is pinned to 2026-10-09 close with filings published BEFORE
 * that date. No approved enterprise value, invested capital or scoring.
 */
import {SEC_2J13_SNAPSHOTS,type SecScenarioSymbol} from "./point-in-time-valuation-sensitivity.ts";
import {SEC_VALUATION_COHORT} from "./valuation-workbench.ts";
import {getIndependentSecReview} from "./independent-original-10k-review.ts";
export const SEC_2J14_POLICY="sec.research.ttm_financing_cash_scope.draft.v1.0.0" as const;
const CUTOFF="2026-10-09T20:00:00Z" as const;
const adobe10Q={
 accession:"0000796343-26-000156",
 form:"10-Q",
 sourceUrl:"https://www.sec.gov/Archives/edgar/data/796343/000079634326000156/adbe-20260828.htm",
 filedDate:"2026-09-22",
 periodEnd:"2026-08-28",
 prior9MonthsEnd:"2025-08-29",
 operatingIncome9Months2026:"7010",
 operatingIncome9Months2025:"6445",
 statement9MonthsRevenue2026:"19776",
 statement9MonthsCostOfRevenue2026:"2142",
 statement9MonthsOperatingExpenses2026:"10624",
 currentAssets:"9158",cash:"4359",shortTermInvestments:"1280",
 currentLiabilities:"11888",currentDebt:"1597",longTermDebt:"4766",
 currentSeniorNotes:"1349",commercialPaper:"248",
 noncurrentSeniorNotes:"4766",seniorNotesFaceValue:"6150",
 seniorNotesCurrentFace:"1350",seniorNotesNoncurrentFace:"4800",
 signedNoncurrentHedgeAdjustment:"-14",signedNoncurrentCosts:"-20",
 signedCurrentCosts:"-1",
 otherDebtCreditFacilityBorrowings:"0",
 propertyPlantEquipment:"1870",operatingLeaseCurrent:"89",operatingLeaseNoncurrent:"310",
 preferredIssuedValue:"0",deferredRevenueCurrent:"7094",
};
const cost10K={
 accession:SEC_VALUATION_COHORT.COST.accession,
 sourceUrl:SEC_VALUATION_COHORT.COST.official10k,
 filedDate:"2026-10-08",
 periodEnd:"2026-08-30",
 FYoperatingIncome:"11685",
 currentAssets:"46582",currentLiabilities:"43952",
 cashAndEquivalents:"20207",shortTermInvestments:"1094",
 unsettledCustomerCardReceivables:"2842",
 netPpe:"35633",borrowingsExLeases:"6162",
 financeLeaseCurrent:"94",financeLeaseNoncurrent:"1319",
 operatingLeaseCurrent:"192",operatingLeaseNoncurrent:"2414",
 financeRounotAlreadyInPpe:"1413",currentBorrowings:"2248",
 preferredIssuedValue:"0",
};
type USDInteger=string;
export type ScenarioOption="no_cash_deduction"|"cash_only_deducted"|"cash_plus_investments_deducted"|"liquidity_ceiling_adjusted";
export type ScenarioRecord={
 assumption:ScenarioOption;
 provisionalDeductionMillions:USDInteger;
 evProxyUsd:USDInteger;
 operatingEarningsYieldBps:USDInteger;
 investmentReturnOnCapitalBps:null;
 verifiedEV:false;eligibleForRanking:false;
};
export type Sec2J14Result={
 symbol:SecScenarioSymbol;
 policyVersion:typeof SEC_2J14_POLICY;
 priceDate:typeof CUTOFF;
 financialSource:{form:"10-K"|"10-Q";accession:string;filedDate:string;periodEnd:string;originalUrl:string};
 earnings:{basis:"reported_fy_latest_asof"|"fy_plus_current_9m_less_prior_9m";
 annualFyOperatingIncomeMillions:string;
 current9MonthsOperatingIncomeMillions:string|null;
 prior9MonthsOperatingIncomeMillions:string|null;
 trailing12MonthsOperatingIncomeMillions:string;
 reportedSourceArithmeticPass:boolean};
 latestBalance:{
 currentAssetsMillions:string;currentLiabilitiesMillions:string;
 cashMillions:string;shortInvestmentsMillions:string;
 carryingBorrowingsExLeasesMillions:string;
 operatingLeaseCurrentMillions:string;operatingLeaseNoncurrentMillions:string;
 financeLeaseLiabilitiesMillions:string|null;
 deferredRevenueCurrentMillions:string|null;
 cashAndInvestmentsMillions:string;
 cashDeductionCeilingMillions:string;
 cashCeilingReason:string;
 };
 financingBridges:Array<{name:string;components:string[];calculatedMillions:string;reportedMillions:string;pass:boolean}>;
 market:{
 proxyMarketCapUsd:string;pricedShares:string;shareCountAsOf:string;
 shareCountFiled:string;closePriceCents:string;
 sourceUrl:string;notExactMarketCap:true;
 };
 scenarios:ScenarioRecord[];
 capitalPolicyStatus:"industrial_issuer_pending_operational_liquidity_review"|"software_negative_working_capital_no_generic_roc";
 unresolved:Array<string>;
 controls:{
 asOfDateChecked:true;nonOperatingCashReviewed:false;
 nciAndAllFinancingClaimsReviewed:false;softwareCapitalPolicyApproved:false;
 independentlyVerifiedMarketCapitalization:false;
 allScenariosConditional:true;modelEligible:false;scoringEligible:false;storedChanges:0;
 };
};
const big=(x:string)=>{if(!/^(0|[1-9]\d*)$/.test(x))throw Error("Bad unsigned original SEC exact integer");return BigInt(x)};
const bridge=(name:string,inputs:string[],reported:string)=>{
 const sum=inputs.reduce((a,v)=>a+BigInt(v),0n).toString();
 return {name,components:inputs,calculatedMillions:sum,reportedMillions:reported,pass:sum===reported};
};
const bps=(a:bigint,b:bigint)=>((a*10000n+b/2n)/b).toString();
export function getSec2J14Reconciliation(symbol:SecScenarioSymbol):Sec2J14Result{
 const meta=SEC_2J13_SNAPSHOTS[symbol];
 const original=getIndependentSecReview(symbol);
 const source=SEC_VALUATION_COHORT[symbol];
 if(!original.arithmeticPass||original.accession!==source.accession||
    meta.closeAt!==CUTOFF||meta.sharesFiled>CUTOFF.slice(0,10)||
    meta.sharesAsOf>CUTOFF.slice(0,10))throw Error("Date, original identity or SEC bridge invalid");
 const isAdobe=symbol==="ADBE";
 const f=isAdobe?adobe10Q:cost10K;
 if(f.filedDate>CUTOFF.slice(0,10)||f.sourceUrl!== (isAdobe?adobe10Q.sourceUrl:source.official10k))
  throw Error("Accounting filing not publicly filed at valuation date");
 if(isAdobe&&adobe10Q.periodEnd<=source.periodEnd)throw Error("Current nine-month filing is not newer than FY");
 const fullFy=big(source.operatingIncomeUsd)/1000000n;
 const current9=isAdobe?big(adobe10Q.operatingIncome9Months2026):null;
 const prior9=isAdobe?big(adobe10Q.operatingIncome9Months2025):null;
 const ttm=fullFy+(current9??0n)-(prior9??0n);
 if(ttm<=0n)throw Error("Nonpositive operating income");
 const sourceCrossFoot=isAdobe?[
  bridge("Q3 2026 nine-month gross profit",["19776","-2142"],"17634"),
  bridge("Q3 2026 nine-month GAAP operating income",["17634","-10624"],adobe10Q.operatingIncome9Months2026),
  bridge("Q3 2025 nine-month GAAP operating income",["15673","-9228"],adobe10Q.operatingIncome9Months2025),
  bridge("FY2025 plus Q3 YTD FY2026 less prior FY2025 YTD",[
   fullFy.toString(),current9!.toString(),"-"+prior9!.toString()],ttm.toString()),
  bridge("Adobe latest senior notes current + commercial paper",[
   adobe10Q.currentSeniorNotes,adobe10Q.commercialPaper],adobe10Q.currentDebt),
  bridge("Adobe current and noncurrent debt carrying values",[
   adobe10Q.currentDebt,adobe10Q.longTermDebt],"6363"),
  bridge("Adobe noncurrent notes face less hedge/cost adjustment",[
   adobe10Q.seniorNotesNoncurrentFace,adobe10Q.signedNoncurrentHedgeAdjustment,
   adobe10Q.signedNoncurrentCosts],adobe10Q.longTermDebt),
  bridge("Adobe current notes face less issuance cost",[
   adobe10Q.seniorNotesCurrentFace,adobe10Q.signedCurrentCosts],adobe10Q.currentSeniorNotes),
  bridge("Adobe 2026 Q3 current assets",[
   adobe10Q.cash,adobe10Q.shortTermInvestments,"2081","1438"],adobe10Q.currentAssets),
  bridge("Adobe 2026 Q3 current liabilities",[
   "529","2516",adobe10Q.currentDebt,adobe10Q.deferredRevenueCurrent,
   "63",adobe10Q.operatingLeaseCurrent],adobe10Q.currentLiabilities),
 ]:[
  bridge("Costco cash and short investments",[
   cost10K.cashAndEquivalents,cost10K.shortTermInvestments],"21301"),
  bridge("Costco latest finance leases",[
   cost10K.financeLeaseCurrent,cost10K.financeLeaseNoncurrent],"1413"),
  bridge("Costco latest operating leases",[
   cost10K.operatingLeaseCurrent,cost10K.operatingLeaseNoncurrent],"2606"),
  bridge("Costco liquidity excluding unsettled card receivables",[
   "21301","-"+cost10K.unsettledCustomerCardReceivables],"18459"),
 ];
 if(sourceCrossFoot.some(x=>!x.pass))throw Error("SEC original/latest statement cross-foot FAILED");
 const currentAssets=big(isAdobe?adobe10Q.currentAssets:cost10K.currentAssets);
 const currentLiabilities=big(isAdobe?adobe10Q.currentLiabilities:cost10K.currentLiabilities);
 const cash=big(isAdobe?adobe10Q.cash:cost10K.cashAndEquivalents);
 const investments=big(isAdobe?adobe10Q.shortTermInvestments:cost10K.shortTermInvestments);
 const borrowing=big(isAdobe?"6363":cost10K.borrowingsExLeases);
 const operatingCurrent=big(isAdobe?adobe10Q.operatingLeaseCurrent:cost10K.operatingLeaseCurrent);
 const operatingLong=big(isAdobe?adobe10Q.operatingLeaseNoncurrent:cost10K.operatingLeaseNoncurrent);
 const financeLease=isAdobe?null:big(cost10K.financeLeaseCurrent)+big(cost10K.financeLeaseNoncurrent);
 const cap=big(meta.shares)*big(meta.closeCents)/100n;
 const ceiling=isAdobe?cash+investments:cash+investments-big(cost10K.unsettledCustomerCardReceivables);
 if(ceiling<0n)throw Error("Nonoperating balance cannot be negative");
 const names:ScenarioOption[]=isAdobe?[
  "no_cash_deduction","cash_only_deducted","cash_plus_investments_deducted",
 ]:[
  "no_cash_deduction","cash_only_deducted","liquidity_ceiling_adjusted",
 ];
 const scenarios=names.map(assumption=>{
  const proposed=assumption==="no_cash_deduction"?0n:
   assumption==="cash_only_deducted"?cash:
   assumption==="cash_plus_investments_deducted"?cash+investments:ceiling;
  // In Adobe, missing finance leases and noncontrolling interest are ZERO only
  // as an explicitly conditional hypothesis; never feed them into the model.
  const ev=cap+(borrowing+(financeLease??0n)-proposed)*1000000n;
  if(ev<=0n)throw Error("Invalid conditional enterprise value");
  return {
   assumption,provisionalDeductionMillions:proposed.toString(),
   evProxyUsd:ev.toString(),operatingEarningsYieldBps:bps(ttm*1000000n,ev),
   investmentReturnOnCapitalBps:null,
   verifiedEV:false as const,eligibleForRanking:false as const,
  };
 });
 const unresolved=isAdobe?[
  "Current FY2026 Q3 Adobe (not FY2025) balance sheet must be used with TTM earnings; restated Q3 2025 YTD was read directly from the Q3 2026 10-Q comparative.",
  "Note 14 reconciles senior notes and a further USD 248m outstanding commercial paper; adding paper to current debt USD 1,597m would DOUBLE COUNT.",
  "Finance lease liabilities/ROU not quantified independently. Zero is hypothetical for EV only, not reported or approved.",
  "Software subscription deferred revenue USD 7,094m, acquisition/goodwill and R&D-heavy tangible capital cannot use generic industrial return on capital to rank Adobe.",
  "USD 5,639m total cash/investments funds working capital and capital expenditures according to management, not verified wholly distributable.",
  "Unknown NCI, other financing and true share-class market capitalization at market price date remain blocked.",
 ]:[
  "Latest FY2026 audited 10-K is the latest full year available at October 9 close; no later operating quarter is known before that timestamp.",
  "USD 2,842m of USD 21,301m cash + short investments represents unsettled credit/debit-card receivables per Costco 10-K Liquidity.",
  "USD 18,459m is an UPPER BOUND on a hypothetical liquidity deduction after excluding disclosed unsettled cards, not a certified unrestricted cash figure.",
  "Additional operating cash needs, other financing claims, minority interests and equity share count timing remain uncertain.",
  "Positive industrial operating capital is not sufficient to establish a fully consistent Magic Formula ROIC.",
 ];
 return{
  symbol,policyVersion:SEC_2J14_POLICY,priceDate:CUTOFF,
  financialSource:{form:isAdobe?"10-Q":"10-K",accession:f.accession,filedDate:f.filedDate,
   periodEnd:f.periodEnd,originalUrl:f.sourceUrl},
  earnings:{basis:isAdobe?"fy_plus_current_9m_less_prior_9m":"reported_fy_latest_asof",
   annualFyOperatingIncomeMillions:fullFy.toString(),current9MonthsOperatingIncomeMillions:current9?.toString()??null,
   prior9MonthsOperatingIncomeMillions:prior9?.toString()??null,
   trailing12MonthsOperatingIncomeMillions:ttm.toString(),reportedSourceArithmeticPass:true},
  latestBalance:{
   currentAssetsMillions:currentAssets.toString(),
   currentLiabilitiesMillions:currentLiabilities.toString(),
   cashMillions:cash.toString(),shortInvestmentsMillions:investments.toString(),
   carryingBorrowingsExLeasesMillions:borrowing.toString(),
   operatingLeaseCurrentMillions:operatingCurrent.toString(),
   operatingLeaseNoncurrentMillions:operatingLong.toString(),
   financeLeaseLiabilitiesMillions:financeLease?.toString()??null,
   deferredRevenueCurrentMillions:isAdobe?adobe10Q.deferredRevenueCurrent:null,
   cashAndInvestmentsMillions:(cash+investments).toString(),
   cashDeductionCeilingMillions:ceiling.toString(),
   cashCeilingReason:isAdobe?
    "Pure reported cash plus investments, NOT proven free/unrestricted (hypothetical max only)":
    "Observed USD 21,301m less USD 2,842m unsettled card receivables; additional operating cash needs unknown",
  },
  financingBridges:sourceCrossFoot,
  market:{proxyMarketCapUsd:cap.toString(),pricedShares:meta.shares,
   shareCountAsOf:meta.sharesAsOf,shareCountFiled:meta.sharesFiled,
   closePriceCents:meta.closeCents,sourceUrl:meta.closeUrl,
   notExactMarketCap:true},
  scenarios,capitalPolicyStatus:isAdobe?
   "software_negative_working_capital_no_generic_roc":
   "industrial_issuer_pending_operational_liquidity_review",
  unresolved,
  controls:{asOfDateChecked:true,nonOperatingCashReviewed:false,
   nciAndAllFinancingClaimsReviewed:false,softwareCapitalPolicyApproved:false,
   independentlyVerifiedMarketCapitalization:false,allScenariosConditional:true,
   modelEligible:false,scoringEligible:false,storedChanges:0},
 };
}
