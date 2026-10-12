/**
 * Phase 2J16: Costco operational card-settlement cash observation series,
 * sourced from original FY2026 10-K and original May-2026 10-Q comparative.
 * These balances are not "surplus cash", a cash forecast or a reserve floor.
 */
import {getSec2J14Reconciliation} from "./latest-asof-reconciliation.ts";
export const COST_2J16_CASH_POLICY="sec.research.cost_operating_liquidity_history.draft.v1.0.0" as const;
const obs=[
 {asOf:"2025-08-31",liquid:"15284",card:"2670",sourcePeriod:"FY2025 comparative in FY2026 Q3 10-Q and FY2026 10-K",
  sourceUrl:"https://www.sec.gov/Archives/edgar/data/909832/000090983226000093/cost-20260830.htm",
  publicSourceDate:"2026-10-07"},
 {asOf:"2026-05-10",liquid:"19996",card:"3078",sourcePeriod:"FY2026 Q3 10-Q, Item 2 liquidity",
  sourceUrl:"https://www.sec.gov/Archives/edgar/data/909832/000090983226000051/cost-20260510.htm",
  publicSourceDate:"2026-06-03"},
 {asOf:"2026-08-30",liquid:"21301",card:"2842",sourcePeriod:"Original FY2026 10-K, Item 7 liquidity",
  sourceUrl:"https://www.sec.gov/Archives/edgar/data/909832/000090983226000093/cost-20260830.htm",
  publicSourceDate:"2026-10-07"},
] as const;
const num=(s:string)=>{if(!/^(0|[1-9]\d*)$/.test(s))throw Error("Invalid original USD millions");return BigInt(s)};
export function getCostcoSeasonalLiquidityReview(){
 const original=getSec2J14Reconciliation("COST");
 if(original.priceDate!=="2026-10-09T20:00:00Z"||
   original.earnings.trailing12MonthsOperatingIncomeMillions!=="11685"||
   original.financingBridges.some(x=>!x.pass))throw Error("Costco annual source and cash scope not verified");
 const three=obs.map((x,i)=>{
  if(x.publicSourceDate>original.priceDate.slice(0,10)||
    (i>0&&x.asOf<=obs[i-1].asOf))throw Error("Not as-of eligible");
  const liquid=num(x.liquid),card=num(x.card);
  if(card>liquid)throw Error("Negative amount after settlement");
  return {
   observedAt:x.asOf,liquidBookAssetsMillions:liquid.toString(),
   cardSettlementFundsMillions:card.toString(),
   residualBookLiquidityMillions:(liquid-card).toString(),
   sourcePeriod:x.sourcePeriod,sourceUrl:x.sourceUrl,
   publicSourceDate:x.publicSourceDate,
   identifiedOperatingCashOnly:"card_settlement_liquidity" as const,
   otherWorkingCapitalReserveMeasured:false as const,
  };
 });
 if(three[2].liquidBookAssetsMillions!==original.latestBalance.cashAndInvestmentsMillions||
    three[2].cardSettlementFundsMillions!=="2842"||
    three[2].residualBookLiquidityMillions!==original.latestBalance.cashDeductionCeilingMillions)
    throw Error("Published Costco latest SEC liquidity figure diverged");
 return {
  policyVersion:COST_2J16_CASH_POLICY,
  issuer:"COST" as const,
  sourceMarketAsOf:original.priceDate,
  observedQuarters:three,
  latestNonleaseBorrowingMillions:original.latestBalance.carryingBorrowingsExLeasesMillions,
  latestFinanceLeaseMillions:original.latestBalance.financeLeaseLiabilitiesMillions,
  latestOperatingLeaseMillions:(
   num(original.latestBalance.operatingLeaseCurrentMillions)+
   num(original.latestBalance.operatingLeaseNoncurrentMillions)).toString(),
  borrowingAndLeasePerimeter:"reported_components_only_not_economic_finance_approval",
  roughVisibleResidualMinMillions:three.reduce((v,r)=>num(r.residualBookLiquidityMillions)<v?
   num(r.residualBookLiquidityMillions):v,num(three[0].residualBookLiquidityMillions)).toString(),
  roughVisibleResidualMaxMillions:three.reduce((v,r)=>num(r.residualBookLiquidityMillions)>v?
   num(r.residualBookLiquidityMillions):v,num(three[0].residualBookLiquidityMillions)).toString(),
  possibleAnnualCashFlowEvidence:{
   fiscal2024CfoMillions:"11339",fiscal2025CfoMillions:"13335",fiscal2026CfoMillions:"15817",
   sourceUrl:"https://www.sec.gov/Archives/edgar/data/909832/000090983226000093/cost-20260830.htm",
   cfoIsNotAvailableSurplusCash:true as const,
  },
  unresolved:[
   "Only 3 irregular period-end snapshots, not every month of retail operating cash seasonality.",
   "2025 comparative amount appears in 2026 source; not falsely assumed to have been public in 2025 for historical backtests.",
   "Unsettled card receivables protect an operating claim in reported liquid book amounts; other operating liquidity needs cannot be inferred from observed residual minimum.",
   "Purchase payments, inventory settlement, fees and seasonal capital expenditures require separate cash-cycle reconstruction.",
   "Other financing obligations, NCI and restricted/inaccessible cash remain unreviewed.",
  ],
  allowedForEV:false as const,
  allowedForOperatingCapital:false as const,
  modelEligible:false as const,scoringEligible:false as const,storedChanges:0 as const,
 };
}
