import {getIndependentSecReview} from "./independent-original-10k-review.ts";
import {SEC_VALUATION_COHORT} from "./valuation-workbench.ts";

/** Historical snapshot. Price at 2026-10-09 16:00 EDT; shares on DIFFERENT dates.
 * SEC financial statements are annual, not trailing-current at price date.
 * These are explicitly conditional arithmetic examples, NEVER eligible to score.
 */
export const SEC_2J13_SNAPSHOTS = {
 COST:{
  closeCents:"94692",closeAt:"2026-10-09T20:00:00Z",
  closeUrl:"https://investor.costco.com/stock-info/",
  closeCrossCheck:"https://ycharts.com/companies/COST/price",
  shares:"443129349",sharesAsOf:"2026-09-29",sharesFiled:"2026-10-08",
  sharesUrl:"https://www.sec.gov/Archives/edgar/data/909832/000090983226000093/cost-20260830.htm",
  sharesRounding:"exact" as const,
 },
 ADBE:{
  closeCents:"24227",closeAt:"2026-10-09T20:00:00Z",
  closeUrl:"https://ycharts.com/companies/ADBE/price",
  closeCrossCheck:"https://stockanalysis.com/stocks/adbe/history/",
  shares:"389200000",sharesAsOf:"2026-09-18",sharesFiled:"2026-09-22",
  sharesUrl:"https://www.sec.gov/Archives/edgar/data/796343/000079634326000156/adbe-20260828.htm",
  sharesRounding:"rounded_100k" as const,
 },
} as const;
export type SecScenarioSymbol=keyof typeof SEC_2J13_SNAPSHOTS;
export type CashTreatment="cash_retained"|"cash_excluded"|"cash_and_investments_excluded";
const valid=(x:string)=>/^(0|[1-9]\d*)$/.test(x);
const pct=(n:bigint,d:bigint)=>((n*10000n+d/2n)/d).toString();
export function getSecValuationScenarios(symbol:SecScenarioSymbol){
 const snap=SEC_2J13_SNAPSHOTS[symbol],caseFile=SEC_VALUATION_COHORT[symbol];
 const review=getIndependentSecReview(symbol);
 if(!review.arithmeticPass||review.accession!==caseFile.accession||
   review.sourceUrl!==caseFile.official10k||review.fiscalEnd!==caseFile.periodEnd||
   snap.sharesAsOf>snap.closeAt.slice(0,10)||
   snap.sharesFiled>snap.closeAt.slice(0,10))throw Error("Original SEC and date consistency not demonstrated");
 const n=(key:string)=>{
  const item=review.fields.find(f=>f.key===key);
  return item&&valid(item.amountMillions)?BigInt(item.amountMillions):null;
 };
 const mandatory=[
  "balance.currentAssetsUsd","balance.currentLiabilitiesUsd",
  "balance.cashAndEquivalentsInCurrentAssetsUsd","source.shortTermInvestments",
  "balance.netPpeUsd","balance.currentBorrowingsInCurrentLiabilitiesUsd",
  "balance.currentOperatingLeaseInCurrentLiabilitiesUsd",
  "financing.preferredEquityUsd",
 ] as const;
 if(mandatory.some(k=>n(k)===null))throw Error("Source financial-statement observation missing");
 const val=(key:string)=>n(key)!;
 const financeLeaseCurrent=n("financing.financeLeaseCurrentUsd"),
       financeLeaseLong=n("financing.financeLeaseNoncurrentUsd");
 const financeLeaseTotal=financeLeaseCurrent!==null&&financeLeaseLong!==null?
  financeLeaseCurrent+financeLeaseLong:null;
 const financeLeaseCurrentInCl=n("balance.currentFinanceLeaseInCurrentLiabilitiesUsd");
 const financeAssetNotInPpe=n("balance.financeLeaseRouNotAlreadyInNetPpeUsd");
 // Adobe 10-K does not separately quantify these positions, so its scenario
 // treats them as assumed zero FOR THE SENSITIVITY ONLY. Never call them verified.
 const conditionalZeros=financeLeaseTotal===null||
   financeLeaseCurrentInCl===null||financeAssetNotInPpe===null;
 const share=BigInt(snap.shares),close=BigInt(snap.closeCents);
 const equityUsd=share*close/100n;
 const ebit=BigInt(caseFile.operatingIncomeUsd)/1000000n;
 const debt=BigInt(caseFile.borrowingUsd)/1000000n;
 const scenario:CashTreatment[]=[
  "cash_retained","cash_excluded","cash_and_investments_excluded"];
 const cases=scenario.map(name=>{
  const deductedCash=name==="cash_retained"?0n:val("balance.cashAndEquivalentsInCurrentAssetsUsd");
  const deductedInvest=name==="cash_and_investments_excluded"?val("source.shortTermInvestments"):0n;
  const operatingAssets=val("balance.currentAssetsUsd")-deductedCash-deductedInvest;
  const nonfinCl=val("balance.currentLiabilitiesUsd")-
   val("balance.currentBorrowingsInCurrentLiabilitiesUsd")-
   val("balance.currentOperatingLeaseInCurrentLiabilitiesUsd")-
   (financeLeaseCurrentInCl??0n);
  const nwc=operatingAssets-nonfinCl;
  const capital=nwc+val("balance.netPpeUsd")+(financeAssetNotInPpe??0n);
  const evUsd=equityUsd+(debt+(financeLeaseTotal??0n)+
   val("financing.preferredEquityUsd")-deductedCash-deductedInvest)*1000000n;
  if(evUsd<=0n)throw Error("Invalid hypothetical financing claims");
  return {
   name,
   netOperatingWorkingCapitalMillions:nwc.toString(),
   operatingCapitalMillions:capital.toString(),
   returnOnCapitalBps:capital>0n?pct(ebit,capital):null,
   conditionalEnterpriseValueUsd:evUsd.toString(),
   conditionalEarningsYieldBps:pct(ebit*1000000n,evUsd),
   eligible:false as const,
  };
 });
 return {
  symbol,originalFiscalEnd:review.fiscalEnd,originalAccession:review.accession,
  priceAt:snap.closeAt,priceUsd:(Number(close)/100).toFixed(2),
  priceSourceUrl:snap.closeUrl,priceCrossCheckUrl:snap.closeCrossCheck,
  shares:snap.shares,sharesAsOf:snap.sharesAsOf,
  sharesFiled:snap.sharesFiled,sharesSourceUrl:snap.sharesUrl,
  sharesRounding:snap.sharesRounding,
  estimatedMarketCapitalizationUsd:equityUsd.toString(),
  estimatedMarketCapitalizationBillions:(Number(equityUsd)/1e9).toFixed(3),
  earningsMillions:ebit.toString(),
  observedDebtMillions:debt.toString(),
  financeLeaseSourceMillions:financeLeaseTotal?.toString()??null,
  sourceChecksPass:review.arithmeticPass,
  assumedMissingFinanceLeaseValuesZeroForScenarios:conditionalZeros,
  cases,
  limitations:[
   "Original annual earnings at FY2025 (Adobe) or FY2026 (Costco) are paired with later October 2026 closing price; no trailing earnings alignment.",
   "Equity capitalisation is last SEC reported share count × 2026-10-09 closing price, not exact share count at the close.",
   "Cash/short investments 0, full cash, or full cash+investments deducted from capital AND EV are accounting scenario choices, not independently verified unrestricted cash.",
   "Other nonoperating current assets remain in operating capital because their value is not independently allocated.",
   "All scenarios suppose zero noncontrolling interests, no unobserved financing claims, and no net adjustments beyond the disclosed debt/finance leases. These cannot be treated as established absence.",
   ...(conditionalZeros?["Adobe finance lease current, long-term and ROU components are not separately observed; ZERO is assumed for scenario arithmetic only."]:[]),
   "Nonpositive capital makes ROC ineligible. Not comparable across asset-light software and warehouse retail without sector treatment.",
  ],
  pointInTimeMarketCapExact:false as const,
  financialCapitalPolicyApproved:false as const,
  modelEligible:false as const,
  scoringEligible:false as const,
  storedChanges:0 as const,
 };
}
