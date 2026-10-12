/**
 * Phase 2J12 — independent original SEC fiscal-year line-item cross-check.
 *
 * These snapshots are manually transcribed from the issuer's ORIGINAL annual
 * filing, checked against a second statement/note presentation where possible
 * and arithmetically cross-footed. They are NOT a second independent reviewer,
 * automatic XBRL import, valuation approval or audited model input.
 *
 * All amounts are USD millions, as printed in the respective original 10-K.
 * Exact source line and interpretation are kept separate: a security or cash
 * balance is not automatically 'nonoperating' or free cash for EV.
 */
export type EvidenceIssuer="AMZN"|"ADBE"|"COST";
export type EvidenceObservation={
 key:string;amountMillions:string;sourceSection:string;
 interpretation:"direct_balance_sheet"|"direct_debt_or_lease_note"|"no_financial_reclassification";
};
export type EvidenceBridge={
 id:string;sourceSection:string;components:Array<{label:string;amountMillions:string}>;
 expectedMillions:string;
};
export type SourceReview={
 symbol:EvidenceIssuer;
 sourceUrl:string;accession:string;fiscalEnd:string;
 fields:EvidenceObservation[];bridges:EvidenceBridge[];
 flags:string[];
 borrowingPerimeter:"incomplete"|"note_subset_verified_total_not_certified";
 marketCap:"missing_contemporaneous_independently_sourced_equity_value";
 reviewerAttestation:"not_performed";
 modelEligible:false;scoringEligible:false;
};
/** Original note source and printed amounts; no unpublished guessed zeros. */
const reviews:Record<EvidenceIssuer,SourceReview>={
 AMZN:{
  symbol:"AMZN",accession:"0001018724-26-000004",fiscalEnd:"2025-12-31",
  sourceUrl:"https://www.sec.gov/Archives/edgar/data/1018724/000101872426000004/amzn-20251231.htm",
  fields:[
   {key:"balance.currentAssetsUsd",amountMillions:"229083",sourceSection:"Consolidated Balance Sheets p39 — total current assets",interpretation:"direct_balance_sheet"},
   {key:"balance.currentLiabilitiesUsd",amountMillions:"218005",sourceSection:"Consolidated Balance Sheets p39 — total current liabilities",interpretation:"direct_balance_sheet"},
   {key:"balance.cashAndEquivalentsInCurrentAssetsUsd",amountMillions:"86810",sourceSection:"Consolidated Balance Sheets p39 — cash and cash equivalents",interpretation:"direct_balance_sheet"},
   {key:"balance.netPpeUsd",amountMillions:"357025",sourceSection:"Consolidated Balance Sheets p39 and Note 3 — net property and equipment",interpretation:"direct_balance_sheet"},
   {key:"balance.currentBorrowingsInCurrentLiabilitiesUsd",amountMillions:"3203",sourceSection:"Note 6 Debt — current LT debt 2,748 plus other short-term credit 455 (Accrued expenses and other)",interpretation:"direct_debt_or_lease_note"},
   {key:"balance.currentFinanceLeaseInCurrentLiabilitiesUsd",amountMillions:"1544",sourceSection:"Note 4 Leases — finance current; classified in accrued expenses and other",interpretation:"direct_debt_or_lease_note"},
   {key:"balance.currentOperatingLeaseInCurrentLiabilitiesUsd",amountMillions:"12655",sourceSection:"Note 4 Leases — operating current; classified in accrued expenses and other",interpretation:"direct_debt_or_lease_note"},
   {key:"balance.financeLeaseRouNotAlreadyInNetPpeUsd",amountMillions:"0",sourceSection:"Note 4 Leases — finance lease assets included in PPE: no additional amount to add",interpretation:"no_financial_reclassification"},
   {key:"financing.financeLeaseCurrentUsd",amountMillions:"1544",sourceSection:"Note 4 Leases — finance current portion",interpretation:"direct_debt_or_lease_note"},
   {key:"financing.financeLeaseNoncurrentUsd",amountMillions:"10742",sourceSection:"Note 4 Leases — finance noncurrent portion",interpretation:"direct_debt_or_lease_note"},
   {key:"financing.operatingLeaseCurrentUsd",amountMillions:"12655",sourceSection:"Note 4 Leases — operating current portion",interpretation:"direct_debt_or_lease_note"},
   {key:"financing.operatingLeaseNoncurrentUsd",amountMillions:"76597",sourceSection:"Note 4 Leases — operating noncurrent portion",interpretation:"direct_debt_or_lease_note"},
   {key:"financing.preferredEquityUsd",amountMillions:"0",sourceSection:"Consolidated Balance Sheets p39 — no preferred shares issued",interpretation:"direct_balance_sheet"},
   {key:"source.longTermDebtCurrent",amountMillions:"2748",sourceSection:"Note 6 Debt — current portion of long-term debt",interpretation:"direct_debt_or_lease_note"},
   {key:"source.longTermDebtNoncurrent",amountMillions:"65648",sourceSection:"Note 6 Debt — long-term debt",interpretation:"direct_debt_or_lease_note"},
   {key:"source.shortTermCreditFacilities",amountMillions:"455",sourceSection:"Note 6 Debt — other short-term credit facilities outstanding",interpretation:"direct_debt_or_lease_note"},
   {key:"source.currentFinancingObligations",amountMillions:"358",sourceSection:"Note 7 Commitments — current financing obligations, excludes interest",interpretation:"direct_debt_or_lease_note"},
   {key:"source.noncurrentFinancingObligations",amountMillions:"7800",sourceSection:"Note 7 Commitments — other long-term financing obligations, reported as 7.8bn rounded",interpretation:"direct_debt_or_lease_note"},
  ],
  bridges:[
   {id:"current-assets",sourceSection:"Consolidated Balance Sheets p39",components:[{label:"cash",amountMillions:"86810"},{label:"marketable securities",amountMillions:"36219"},{label:"inventories",amountMillions:"38325"},{label:"receivables and other",amountMillions:"67729"}],expectedMillions:"229083"},
   {id:"current-liabilities",sourceSection:"Consolidated Balance Sheets p39",components:[{label:"payables",amountMillions:"121909"},{label:"accrued and other",amountMillions:"75520"},{label:"unearned revenue",amountMillions:"20576"}],expectedMillions:"218005"},
   {id:"reported-long-term-debt",sourceSection:"Note 6 Debt",components:[{label:"current LT",amountMillions:"2748"},{label:"noncurrent LT",amountMillions:"65648"}],expectedMillions:"68396"},
   {id:"identified-short-term-and-long-term-borrowings",sourceSection:"Note 6 Debt",components:[{label:"long-term carrying debt",amountMillions:"68396"},{label:"other short-term facilities",amountMillions:"455"}],expectedMillions:"68851"},
   {id:"finance-leases",sourceSection:"Note 4 Leases",components:[{label:"current",amountMillions:"1544"},{label:"noncurrent",amountMillions:"10742"}],expectedMillions:"12286"},
   {id:"operating-leases",sourceSection:"Note 4 Leases",components:[{label:"current",amountMillions:"12655"},{label:"noncurrent",amountMillions:"76597"}],expectedMillions:"89252"},
  ],
  borrowingPerimeter:"incomplete",
  flags:[
   "Prior USD 68,396m anchor reconciles ONLY long-term debt, not complete non-lease borrowings; other short-term facilities USD 455m must not disappear.",
   "Identifiable borrowed-money balance USD 68,851m remains incomplete for enterprise value until financing obligations are classified.",
   "Additional financing obligations approximately USD 358m current + USD 7.8bn noncurrent (Note 7), with financing/nonlease policy unresolved.",
   "Marketable securities USD 36,219m require independent nonoperating/restricted and liquid EV treatment; do not auto-deduct.",
   "Reported net PPE includes finance lease assets; additional ROU is exactly zero under this *presentation* mapping.",
  ],
  marketCap:"missing_contemporaneous_independently_sourced_equity_value",
  reviewerAttestation:"not_performed",modelEligible:false,scoringEligible:false,
 },
 ADBE:{
  symbol:"ADBE",accession:"0000796343-26-000003",fiscalEnd:"2025-11-28",
  sourceUrl:"https://www.sec.gov/Archives/edgar/data/796343/000079634326000003/adbe-20251128.htm",
  fields:[
   {key:"balance.currentAssetsUsd",amountMillions:"10163",sourceSection:"Consolidated Balance Sheets p47 — current assets",interpretation:"direct_balance_sheet"},
   {key:"balance.currentLiabilitiesUsd",amountMillions:"10200",sourceSection:"Consolidated Balance Sheets p47 — current liabilities",interpretation:"direct_balance_sheet"},
   {key:"balance.cashAndEquivalentsInCurrentAssetsUsd",amountMillions:"5431",sourceSection:"Consolidated Balance Sheets p47 — cash",interpretation:"direct_balance_sheet"},
   {key:"balance.currentBorrowingsInCurrentLiabilitiesUsd",amountMillions:"0",sourceSection:"Consolidated Balance Sheets p47 — current debt explicitly dash/zero",interpretation:"direct_balance_sheet"},
   {key:"balance.netPpeUsd",amountMillions:"1873",sourceSection:"Consolidated Balance Sheets p47 and Note 6 — net PPE",interpretation:"direct_balance_sheet"},
   {key:"balance.currentOperatingLeaseInCurrentLiabilitiesUsd",amountMillions:"77",sourceSection:"Consolidated Balance Sheets p47 — current operating lease liabilities",interpretation:"direct_balance_sheet"},
   {key:"financing.operatingLeaseCurrentUsd",amountMillions:"77",sourceSection:"Consolidated Balance Sheets p47 — operating lease current",interpretation:"direct_balance_sheet"},
   {key:"financing.operatingLeaseNoncurrentUsd",amountMillions:"361",sourceSection:"Consolidated Balance Sheets p47 — operating lease noncurrent",interpretation:"direct_balance_sheet"},
   {key:"financing.preferredEquityUsd",amountMillions:"0",sourceSection:"Consolidated Balance Sheets p47 — preferred shares authorised; none issued",interpretation:"direct_balance_sheet"},
   {key:"source.shortTermInvestments",amountMillions:"1164",sourceSection:"Consolidated Balance Sheets p47 and investment note",interpretation:"direct_balance_sheet"},
  ],
  bridges:[
   {id:"current-assets",sourceSection:"Consolidated Balance Sheets p47",components:[{label:"cash",amountMillions:"5431"},{label:"short-term investments",amountMillions:"1164"},{label:"receivables",amountMillions:"2344"},{label:"prepaid and other",amountMillions:"1224"}],expectedMillions:"10163"},
   {id:"current-liabilities",sourceSection:"Consolidated Balance Sheets p47",components:[{label:"accounts payable",amountMillions:"417"},{label:"accrued",amountMillions:"2648"},{label:"current debt",amountMillions:"0"},{label:"deferred revenue",amountMillions:"6905"},{label:"tax",amountMillions:"153"},{label:"operating lease",amountMillions:"77"}],expectedMillions:"10200"},
   {id:"operating-leases",sourceSection:"Consolidated Balance Sheets and Note 7",components:[{label:"current",amountMillions:"77"},{label:"noncurrent",amountMillions:"361"}],expectedMillions:"438"},
  ],
  borrowingPerimeter:"note_subset_verified_total_not_certified",
  flags:[
   "Note 7 discloses operating leases; no separate finance-lease values observed, which is NOT proof that finance lease balances equal zero.",
   "USD 1,164m short-term investments are not automatically free cash or nonoperating EV deductions.",
   "Deferred revenue affects operating working capital materially; compare software business returns with suitable policy.",
   "No independently sourced contemporaneous full-share-class market capitalization for earnings yield.",
  ],
  marketCap:"missing_contemporaneous_independently_sourced_equity_value",
  reviewerAttestation:"not_performed",modelEligible:false,scoringEligible:false,
 },
 COST:{
  symbol:"COST",accession:"0000909832-26-000093",fiscalEnd:"2026-08-30",
  sourceUrl:"https://www.sec.gov/Archives/edgar/data/909832/000090983226000093/cost-20260830.htm",
  fields:[
   {key:"balance.currentAssetsUsd",amountMillions:"46582",sourceSection:"Consolidated Balance Sheets p39 — current assets",interpretation:"direct_balance_sheet"},
   {key:"balance.currentLiabilitiesUsd",amountMillions:"43952",sourceSection:"Consolidated Balance Sheets p39 — current liabilities",interpretation:"direct_balance_sheet"},
   {key:"balance.cashAndEquivalentsInCurrentAssetsUsd",amountMillions:"20207",sourceSection:"Consolidated Balance Sheets p39 — cash and equivalents",interpretation:"direct_balance_sheet"},
   {key:"balance.currentBorrowingsInCurrentLiabilitiesUsd",amountMillions:"2248",sourceSection:"Consolidated Balance Sheets p39 — current long-term debt",interpretation:"direct_balance_sheet"},
   {key:"balance.currentFinanceLeaseInCurrentLiabilitiesUsd",amountMillions:"94",sourceSection:"Note 5 Leases — current finance; included in other current liabilities",interpretation:"direct_debt_or_lease_note"},
   {key:"balance.currentOperatingLeaseInCurrentLiabilitiesUsd",amountMillions:"192",sourceSection:"Note 5 Leases — current operating; included in other current liabilities",interpretation:"direct_debt_or_lease_note"},
   {key:"balance.netPpeUsd",amountMillions:"35633",sourceSection:"Consolidated Balance Sheets p39 — net PPE",interpretation:"direct_balance_sheet"},
   {key:"balance.financeLeaseRouNotAlreadyInNetPpeUsd",amountMillions:"1413",sourceSection:"Note 5 Leases — finance lease assets included in OTHER long-term assets, not PPE",interpretation:"direct_debt_or_lease_note"},
   {key:"financing.financeLeaseCurrentUsd",amountMillions:"94",sourceSection:"Note 5 Leases — current finance liability",interpretation:"direct_debt_or_lease_note"},
   {key:"financing.financeLeaseNoncurrentUsd",amountMillions:"1319",sourceSection:"Note 5 Leases — noncurrent finance liability",interpretation:"direct_debt_or_lease_note"},
   {key:"financing.operatingLeaseCurrentUsd",amountMillions:"192",sourceSection:"Note 5 Leases — current operating liability",interpretation:"direct_debt_or_lease_note"},
   {key:"financing.operatingLeaseNoncurrentUsd",amountMillions:"2414",sourceSection:"Note 5 Leases — noncurrent operating liability",interpretation:"direct_debt_or_lease_note"},
   {key:"financing.preferredEquityUsd",amountMillions:"0",sourceSection:"Consolidated Balance Sheets p39 — no preferred shares issued",interpretation:"direct_balance_sheet"},
   {key:"source.shortTermInvestments",amountMillions:"1094",sourceSection:"Consolidated Balance Sheets p39 — short-term investments",interpretation:"direct_balance_sheet"},
  ],
  bridges:[
   {id:"current-assets",sourceSection:"Consolidated Balance Sheets p39",components:[{label:"cash",amountMillions:"20207"},{label:"short investments",amountMillions:"1094"},{label:"receivables",amountMillions:"3959"},{label:"inventory",amountMillions:"19324"},{label:"other current",amountMillions:"1998"}],expectedMillions:"46582"},
   {id:"current-liabilities",sourceSection:"Consolidated Balance Sheets p39",components:[{label:"AP",amountMillions:"22591"},{label:"salaries",amountMillions:"5641"},{label:"rewards",amountMillions:"3037"},{label:"fees deferred",amountMillions:"3006"},{label:"current debt",amountMillions:"2248"},{label:"other",amountMillions:"7429"}],expectedMillions:"43952"},
   {id:"long-term-borrowings",sourceSection:"Consolidated Balance Sheets and Note 4",components:[{label:"current",amountMillions:"2248"},{label:"long-term",amountMillions:"3914"}],expectedMillions:"6162"},
   {id:"finance-leases",sourceSection:"Note 5 Leases",components:[{label:"current",amountMillions:"94"},{label:"noncurrent",amountMillions:"1319"}],expectedMillions:"1413"},
   {id:"operating-leases",sourceSection:"Note 5 Leases",components:[{label:"current",amountMillions:"192"},{label:"noncurrent",amountMillions:"2414"}],expectedMillions:"2606"},
   {id:"all-lease-liabilities",sourceSection:"Note 5 Leases",components:[{label:"operating",amountMillions:"2606"},{label:"finance",amountMillions:"1413"}],expectedMillions:"4019"},
  ],
  borrowingPerimeter:"note_subset_verified_total_not_certified",
  flags:[
   "Short-term investments USD 1,094m are a reported asset, not independently cleared as nonoperating or free cash.",
   "Other current assets may include operating and nonoperating items, with no verified breakdown; do not fill zero.",
   "Cash USD 20,207m reported does not establish unrestricted EV-deductible amount.",
   "Noncontrolling interest requires explicit verification; absence of a prominent line is not itself proof of zero.",
   "Finance lease ROU assets USD 1,413m are classified in other long-term assets, requiring an add-on to net PPE if policy applied.",
  ],
  marketCap:"missing_contemporaneous_independently_sourced_equity_value",
  reviewerAttestation:"not_performed",modelEligible:false,scoringEligible:false,
 },
};
export type BridgeCheck={
 id:string;expectedMillions:string;actualMillions:string;status:"matches"|"mismatch";
};
export type IndependentSecReview=Omit<SourceReview,"bridges"> & {
 checks:BridgeCheck[];
 arithmeticPass:boolean;
 independentHumanAttestation:false;
};
export function getIndependentSecReview(symbol:EvidenceIssuer):IndependentSecReview{
 const s=reviews[symbol];if(!s)throw new Error("Unapproved original SEC issuer");
 const checks=s.bridges.map(b=>{
  const actual=b.components.reduce<bigint>((a,c)=>{
   if(!/^-?(0|[1-9]\d*)$/.test(c.amountMillions))throw new Error("Unsafe original SEC amount");
   return a+BigInt(c.amountMillions);
  },0n).toString();
  return {id:b.id,expectedMillions:b.expectedMillions,actualMillions:actual,
   status:actual===b.expectedMillions?"matches" as const:"mismatch" as const};
 });
 return {symbol:s.symbol,sourceUrl:s.sourceUrl,accession:s.accession,
  fiscalEnd:s.fiscalEnd,fields:s.fields,flags:s.flags,
  borrowingPerimeter:s.borrowingPerimeter,marketCap:s.marketCap,
  reviewerAttestation:s.reviewerAttestation,checks,
  arithmeticPass:checks.every(x=>x.status==="matches"),
  independentHumanAttestation:false,modelEligible:false,scoringEligible:false};
}
