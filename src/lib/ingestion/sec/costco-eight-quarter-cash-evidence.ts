/**
 * Phase 2J17: FULL FY2025+FY2026 quarterly-period-end Costco operating card
 * settlement liquidity observations from original SEC filings, plus FY2024
 * opening base. All amounts USD MILLIONS as described in MD&A Liquidity.
 * Treat cash minus card unsettled as OBSERVED BOOK RESIDUAL, not surplus cash.
 * Dates are financial period ends, not original public market availability;
 * historical point-in-time backtesting requires original acceptance timestamp.
 */
import {getCostcoSeasonalLiquidityReview} from "./costco-cash-seasonality-review.ts";
export const COSTCO_2J17_POLICY="sec.research.costco_two_fy_card_liquidity.draft.v1.0.0" as const;
const CASH_LINES=[
 {end:"2024-09-01",liquid:"11144",cards:"2519",
  form:"10-K",url:"https://www.sec.gov/Archives/edgar/data/909832/000090983224000049/cost-20240901.htm"},
 {end:"2024-11-24",liquid:"11827",cards:"2789",
  form:"10-Q",url:"https://www.sec.gov/Archives/edgar/data/909832/000090983224000079/cost-20241124.htm"},
 {end:"2025-02-16",liquid:"13158",cards:"2292",
  form:"10-Q",url:"https://www.sec.gov/Archives/edgar/data/909832/000090983225000015/cost-20250216.htm"},
 {end:"2025-05-11",liquid:"14850",cards:"2587",
  form:"10-Q",url:"https://www.sec.gov/Archives/edgar/data/909832/000090983225000033/cost-20250511.htm"},
 {end:"2025-08-31",liquid:"15284",cards:"2670",
  form:"10-K",url:"https://www.sec.gov/Archives/edgar/data/909832/000090983225000157/costannualreport2025.pdf"},
 {end:"2025-11-23",liquid:"17183",cards:"3095",
  form:"10-Q",url:"https://www.sec.gov/Archives/edgar/data/909832/000090983225000169/cost-20251123.htm"},
 {end:"2026-02-15",liquid:"18240",cards:"2872",
  form:"10-Q",url:"https://www.sec.gov/Archives/edgar/data/909832/000090983226000029/cost-20260215.htm"},
 {end:"2026-05-10",liquid:"19996",cards:"3078",
  form:"10-Q",url:"https://www.sec.gov/Archives/edgar/data/909832/000090983226000051/cost-20260510.htm"},
 {end:"2026-08-30",liquid:"21301",cards:"2842",
  form:"10-K",url:"https://www.sec.gov/Archives/edgar/data/909832/000090983226000093/cost-20260830.htm"},
] as const;
const amount=(s:string)=>{
 if(!/^(0|[1-9]\d*)$/.test(s))throw Error("Invalid source USD millions");
 return BigInt(s);
};
export function getCostcoOriginalEightQuarterCash(){
 const prior=getCostcoSeasonalLiquidityReview();
 if(prior.storedChanges!==0||prior.modelEligible!==false||
    prior.observedQuarters.length!==3)throw Error("Prior Costco accounting review not confirmed");
 const series=CASH_LINES.map((s,i)=>{
  if(i>0&&s.end<=CASH_LINES[i-1].end)throw Error("Not chronological");
  if(!s.url.startsWith("https://www.sec.gov/Archives/edgar/data/909832/")||
     s.end>"2026-10-09")throw Error("Not eligible original filing");
  const cash=amount(s.liquid),cards=amount(s.cards);
  if(cards>cash)throw Error("Book cash less card settlements is negative");
  return {
   periodEnd:s.end,reportedLiquidAssetsMillions:cash.toString(),
   unsettledCardReceivablesMillions:cards.toString(),
   postSettlementBookLiquidityMillions:(cash-cards).toString(),
   sourceUrl:s.url,sourceForm:s.form,
   independentlyReviewedSurplusMillions:null,
   firstSeenAtExactSECInstant:null,
  };
 });
 const previous=new Map<string,(typeof prior.observedQuarters)[number]>(
  prior.observedQuarters.map(q=>[q.observedAt,q]),
 );
 for(const q of series){
  const prev=previous.get(q.periodEnd);
  if(prev&&(prev.liquidBookAssetsMillions!==q.reportedLiquidAssetsMillions||
    prev.cardSettlementFundsMillions!==q.unsettledCardReceivablesMillions||
    prev.residualBookLiquidityMillions!==q.postSettlementBookLiquidityMillions))
   throw Error("Prior Costco SEC source observation mismatch");
 }
 const residuals=series.map(s=>amount(s.postSettlementBookLiquidityMillions));
 const sorted=[...residuals].sort((a,b)=>a<b?-1:a>b?1:0);
 const quarters=series.slice(1);
 if(quarters.length!==8||series.length!==9)throw Error("Not eight full quarter intervals");
 return {
  policyVersion:COSTCO_2J17_POLICY,issuer:"COST" as const,
  marketCutoff:"2026-10-09T20:00:00Z",
  priorYearOpening:series[0],
  twoFullFiscalYears:quarters,
  fullSeries:series,
  completeQuarterIntervals:8,
  bookResidualRangeMillions:{lowest:sorted[0].toString(),highest:sorted[sorted.length-1].toString()},
  cardSettlementRangeMillions:{
   lowest:series.map(s=>amount(s.unsettledCardReceivablesMillions)).reduce((a,b)=>a<b?a:b).toString(),
   highest:series.map(s=>amount(s.unsettledCardReceivablesMillions)).reduce((a,b)=>a>b?a:b).toString(),
  },
  sourceBoundary:{
   rawForm10KAnd10QOnly:true as const,
   cashBalanceIsNotCashFlow:true as const,
   filingAcceptanceTimestampsForHistoricalBacktestKnown:false as const,
   sameDayOperatingCashNeedMeasured:false as const,
   operatingCashReserveApproved:false as const,
   noAutomaticModelInput:true as const,
  },
  limits:[
   "Nine period-end book values across exactly eight retail fiscal-quarter intervals, not actual daily/weekly operating cash needs.",
   "Older 2025 comparative data may also be in later annual statements: future point-in-time backtests must store original SEC acceptance time, not backdate source observations.",
   "Only unsettled card settlement balances are identified operating components; inventory/payable, supplier, payroll, membership and tax liquidity needs remain unquantified.",
   "Retail inventory/payables and funds seasonality cannot be inferred from monotonic ending cash balances.",
   "Residual book liquidity after cards is NOT free distributable surplus; operating-reserve and restricted-cash signoffs remain missing.",
  ],
  modelEligible:false as const,scoringEligible:false as const,
  storedChanges:0 as const,
 };
}
