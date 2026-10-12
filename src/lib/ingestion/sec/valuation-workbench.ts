/**
 * 2J11: OWNER-ONLY valuation research workbench contract.
 * Immutable original 10-K anchors from 2J7/2J8 independent manual checks.
 * Supplemental inputs are TRANSCRIBED, not independently authenticated, even
 * if arithmetic succeeds. This pure module NEVER writes/approves/scores.
 */
import {
 evaluateSecMagicFormulaDraft,SEC_MAGIC_FORMULA_POLICY_V1,
 type Original10KContext,type DraftMagicFormulaEvidence,
 type DraftMagicFormulaAssessment,
} from "./magic-formula-policy-draft.ts";
import {MAGIC_FORMULA_CALC_VERSION} from "../../opportunity/fundamental-models.ts";

export const SEC_VALUATION_COHORT={
 AMZN:{cik:1018724,accession:"0001018724-26-000004",periodEnd:"2025-12-31",
  official10k:"https://www.sec.gov/Archives/edgar/data/1018724/000101872426000004/amzn-20251231.htm",
  operatingIncomeUsd:"79975000000",pretaxIncomeUsd:"97311000000",
  interestExpenseUsd:"2274000000",borrowingUsd:"68396000000",
  sourceSections:"Consolidated Statements of Operations; Note 6 Debt",
 },
 ADBE:{cik:796343,accession:"0000796343-26-000003",periodEnd:"2025-11-28",
  official10k:"https://www.sec.gov/Archives/edgar/data/796343/000079634326000003/adbe-20251128.htm",
  operatingIncomeUsd:"8706000000",pretaxIncomeUsd:"8734000000",
  interestExpenseUsd:"263000000",borrowingUsd:"6210000000",
  sourceSections:"Consolidated Statements of Income; Consolidated Balance Sheets; Debt note",
 },
 COST:{cik:909832,accession:"0000909832-26-000093",periodEnd:"2026-08-30",
  official10k:"https://www.sec.gov/Archives/edgar/data/909832/000090983226000093/cost-20260830.htm",
  operatingIncomeUsd:"11685000000",pretaxIncomeUsd:null,
  interestExpenseUsd:null,borrowingUsd:"6162000000",
  sourceSections:"Consolidated Statements of Income; Consolidated Balance Sheets and debt note",
 },
} as const;
export type SecValuationSymbol=keyof typeof SEC_VALUATION_COHORT;

export const SEC_VALUATION_FIELDS=[
 {key:"balance.currentAssetsUsd",label:"Current assets",section:"Balance sheet"},
 {key:"balance.currentLiabilitiesUsd",label:"Current liabilities",section:"Balance sheet"},
 {key:"balance.cashAndEquivalentsInCurrentAssetsUsd",label:"Cash included in current assets",section:"Operating working capital"},
 {key:"balance.nonoperatingInvestmentsInCurrentAssetsUsd",label:"Non-operating investments in current assets",section:"Operating working capital"},
 {key:"balance.otherNonoperatingCurrentAssetsUsd",label:"Other non-operating current assets",section:"Operating working capital"},
 {key:"balance.currentBorrowingsInCurrentLiabilitiesUsd",label:"Current debt within current liabilities",section:"Operating working capital"},
 {key:"balance.currentFinanceLeaseInCurrentLiabilitiesUsd",label:"Current finance leases in current liabilities",section:"Operating working capital"},
 {key:"balance.currentOperatingLeaseInCurrentLiabilitiesUsd",label:"Current operating leases in current liabilities",section:"Operating working capital"},
 {key:"balance.netPpeUsd",label:"Net property, plant and equipment",section:"Fixed capital"},
 {key:"balance.financeLeaseRouNotAlreadyInNetPpeUsd",label:"Additional finance lease ROU asset (not already in PPE)",section:"Fixed capital"},
 {key:"financing.financeLeaseCurrentUsd",label:"Current finance lease liability",section:"Financing and EV"},
 {key:"financing.financeLeaseNoncurrentUsd",label:"Noncurrent finance lease liability",section:"Financing and EV"},
 {key:"financing.operatingLeaseCurrentUsd",label:"Current operating lease liability (disclosed, excluded EV)",section:"Financing and EV"},
 {key:"financing.operatingLeaseNoncurrentUsd",label:"Noncurrent operating lease liability (disclosed, excluded EV)",section:"Financing and EV"},
 {key:"financing.preferredEquityUsd",label:"Preferred equity claim",section:"Financing and EV"},
 {key:"financing.noncontrollingInterestUsd",label:"Noncontrolling interest",section:"Financing and EV"},
 {key:"financing.unrestrictedCashAvailableForEvUsd",label:"Unrestricted cash subtracted from EV",section:"Financing and EV"},
 {key:"financing.nonoperatingInvestmentsAvailableForEvUsd",label:"Non-operating investments subtracted from EV",section:"Financing and EV"},
] as const;
export type SecValuationFieldKey=typeof SEC_VALUATION_FIELDS[number]["key"];

export interface ManualFact {
 valueUsd:string; // exact integer dollars; no amounts inferred from blank inputs
 sourceSection:string; // reviewer transcription, not external validation
 sourceUrl:string; // must be the same exact original filing for accounting fields
}
export type ManualFactMap=Partial<Record<SecValuationFieldKey,ManualFact>>;
export interface MarketTranscription {
 valueUsd:string;
 asOf:string; // ISO instant, same time basis as SEC first-observed, not FY-end
 sourceUrl:string; // actual contemporaneous price/market cap reference
 sourceDescription:string;
}
export type ValuationPreviewRequest={
 symbol:SecValuationSymbol;
 supplementary:ManualFactMap;
 market:MarketTranscription|null;
};
export interface ValuationPreviewResponse {
 symbol:SecValuationSymbol;
 policyVersion:string;
 legacyCalculationVersion:string;
 originalAccession:string;
 originalPeriodEnd:string;
 originalSourceUrl:string;
 knownAt:string;
 sourceAnchors:Array<{key:string;valueUsd:string|null;section:string;basis:"manual_original_10k_checked"}>;
 missingManualFields:SecValuationFieldKey[];
 suppliedManualFields:SecValuationFieldKey[];
 provenanceProblems:string[];
 assessment:DraftMagicFormulaAssessment;
 legacyStyle:{
  /** A *reconstruction* of v0.1 formula on same supplied amounts, not an
   * actual stored legacy score / or a faithful semantic matching of total debt. */
  status:"not_comparable"|"arithmetic_only";
  capitalEmployedUsd:string|null;
  enterpriseValueUsd:string|null;
  returnOnCapitalBps:string|null;
  earningsYieldBps:string|null;
  comparisonNotes:string[];
 };
 inputReviewStatus:"manual_transcription_not_independently_rechecked";
 permittedForScoring:false;
 permittedForModels:false;
 storedChanges:0;
}

const validExact=(x:string)=>typeof x==="string"&&/^(0|[1-9]\d*)$/.test(x)&&
  x.length<=32;
const validInstant=(s:string)=>typeof s==="string"&&
 /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(s)&&
 Number.isFinite(Date.parse(s));
const basisPoints=(x:bigint,d:bigint)=>((x*10000n+d/2n)/d).toString();

export function prepareValuationPreview(
 symbol:SecValuationSymbol, original:Original10KContext,
 supplementary:ManualFactMap={}, market:MarketTranscription|null=null,
):ValuationPreviewResponse{
 const cohort=SEC_VALUATION_COHORT[symbol];
 if(!cohort||original.cik!==cohort.cik||original.accession!==cohort.accession||
   original.periodEnd!==cohort.periodEnd||original.sourceUrl!==cohort.official10k||
   original.sector!=="nonfinancial"){
  throw new Error("Original issuer identity or source provenance does not match bounded 2J11 evidence");
 }
 const issues:string[]=[];
 const permitted=new Set<string>(SEC_VALUATION_FIELDS.map(f=>f.key));
 if(Object.keys(supplementary).length>SEC_VALUATION_FIELDS.length)issues.push("Unbounded manual input set");
 const supplied:SecValuationFieldKey[]=[];
 const balance:Record<string,string|null>={};
 const financing:Record<string,string|null>={
  borrowingsExcludingAllLeasesUsd:cohort.borrowingUsd,
 };
 for(const key of Object.keys(supplementary)){
  if(!permitted.has(key))issues.push("Input field not eligible for supplementary transcription: "+key);
 }
 for(const item of SEC_VALUATION_FIELDS){
  const fact=supplementary[item.key];
  let value:string|null=null;
  if(fact!==undefined){
   if(!fact||!validExact(fact.valueUsd)||
      typeof fact.sourceSection!=="string"||fact.sourceSection.trim().length<5||
      fact.sourceSection.length>180||fact.sourceUrl!==cohort.official10k){
    issues.push("Missing/invalid source section, original SEC URL or exact amount for "+item.key);
   }else{
    value=fact.valueUsd;
    supplied.push(item.key);
   }
  }
  const [area,field]=item.key.split(".");
  if(area==="balance")balance[field]=value;
  else financing[field]=value;
 }
 if(market!==null){
  let safe=false;
  try{const u=new URL(market.sourceUrl);
    safe=u.protocol==="https:"&&Boolean(u.hostname)&&!u.username&&!u.password;
  }catch{/* invalid */}
  if(!validExact(market.valueUsd)||!validInstant(market.asOf)||!safe||
    typeof market.sourceDescription!=="string"||
    market.sourceDescription.trim().length<10||market.sourceDescription.length>240){
    issues.push("Market value requires exact amount, price timestamp, HTTPS citation and description");
  }
 }
 const at=market?.asOf??original.firstObservedAt;
 const e:DraftMagicFormulaEvidence={
  original,
  earnings:{
   operatingIncomeUsd:cohort.operatingIncomeUsd,
   pretaxIncomeUsd:cohort.pretaxIncomeUsd,
   interestExpenseUsd:cohort.interestExpenseUsd,
  },
  balance:balance as unknown as DraftMagicFormulaEvidence["balance"],
  financing:financing as unknown as DraftMagicFormulaEvidence["financing"],
  market:{equityMarketCapitalizationUsd:market?.valueUsd??null,asOf:at},
  reviewBasis:"unreviewed_transcription",
 };
 const assessment=evaluateSecMagicFormulaDraft(e);
 const missing=SEC_VALUATION_FIELDS.filter(f=>!supplied.includes(f.key)).map(f=>f.key);
 const known=(key:SecValuationFieldKey)=>supplementary[key]?.valueUsd??null;
 const keys=["balance.currentAssetsUsd","balance.currentLiabilitiesUsd","balance.netPpeUsd"] as const;
 const ready=keys.every(k=>known(k)!==null)&&market!==null&&issues.length===0&&
   assessment.problems.length===0;
 let capitalEmployedUsd:string|null=null,enterpriseValueUsd:string|null=null,
    returnOnCapitalBps:string|null=null,earningsYieldBps:string|null=null;
 if(ready){
  const capital=BigInt(known(keys[0])!)-BigInt(known(keys[1])!)+BigInt(known(keys[2])!);
  const ev=BigInt(market!.valueUsd)+BigInt(cohort.borrowingUsd)-
    BigInt(known("balance.cashAndEquivalentsInCurrentAssetsUsd")??"0");
  // This deliberately demonstrates *legacy-style* formula using borrowing
  // subset instead of legacy STMT_TOTAL_DEBT. Never mark as comparable to a
  // historical legacy score or use invented missing cash = zero.
  if(known("balance.cashAndEquivalentsInCurrentAssetsUsd")!==null&&capital>0n&&ev>0n){
   capitalEmployedUsd=capital.toString();enterpriseValueUsd=ev.toString();
   returnOnCapitalBps=basisPoints(BigInt(cohort.operatingIncomeUsd),capital);
   earningsYieldBps=basisPoints(BigInt(cohort.operatingIncomeUsd),ev);
  }
 }
 return{
  symbol,policyVersion:SEC_MAGIC_FORMULA_POLICY_V1.version,
  legacyCalculationVersion:MAGIC_FORMULA_CALC_VERSION,
  originalAccession:cohort.accession,originalPeriodEnd:cohort.periodEnd,
  originalSourceUrl:cohort.official10k,knownAt:original.firstObservedAt,
  sourceAnchors:[
   {key:"earnings.operatingIncomeUsd",valueUsd:cohort.operatingIncomeUsd,section:cohort.sourceSections,basis:"manual_original_10k_checked"},
   {key:"earnings.pretaxIncomeUsd",valueUsd:cohort.pretaxIncomeUsd,section:cohort.sourceSections,basis:"manual_original_10k_checked"},
   {key:"earnings.interestExpenseUsd",valueUsd:cohort.interestExpenseUsd,section:cohort.sourceSections,basis:"manual_original_10k_checked"},
   {key:"financing.borrowingsExcludingAllLeasesUsd",valueUsd:cohort.borrowingUsd,section:cohort.sourceSections,basis:"manual_original_10k_checked"},
  ],
  missingManualFields:missing,suppliedManualFields:supplied,
  provenanceProblems:issues,assessment:{
   ...assessment,
   status:issues.length?"rejected":assessment.status,
   problems:[...assessment.problems,...issues],
   // Never present valuation metrics when provenance is invalid:
   ...(issues.length?{enterpriseValueUsd:null,operatingCapitalEmployedUsd:null,
    returnOnCapitalBps:null,earningsYieldBps:null}:{}),
  },
  legacyStyle:{
   status:capitalEmployedUsd!==null?"arithmetic_only":"not_comparable",
   capitalEmployedUsd,enterpriseValueUsd,returnOnCapitalBps,earningsYieldBps,
   comparisonNotes:[
    "Legacy-style recalculation on the same manually transcribed figures, NOT the historical legacy output",
    "Historical v0.1 uses STMT_TOTAL_DEBT; this diagnostic uses reviewed borrowing subset instead and is NOT semantically equivalent",
    "Older denominator includes cash and current financing; draft removes verified nonoperating/financing components",
    "No issuer comparisons, ranks or Radar consumption; market-source data is owner supplied",
   ],
  },
  inputReviewStatus:"manual_transcription_not_independently_rechecked",
  permittedForScoring:false,permittedForModels:false,storedChanges:0,
 };
}
