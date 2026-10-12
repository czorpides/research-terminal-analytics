/**
 * Phase 2J10: VERSIONED DRAFT accounting policy, wholly isolated from Radar,
 * STMT_EBIT, STMT_TOTAL_DEBT and existing Magic Formula calculation paths.
 *
 * Pure arithmetic on reviewer-supplied ORIGINAL 10-K quantities. The function
 * cannot authenticate the source figures; arithmetic consistency != approval.
 */
export const SEC_MAGIC_FORMULA_POLICY_V1 = Object.freeze({
  version: "sec.magic_formula.operating_capital.draft.v1.0.0",
  earnings: "unadjusted_consolidated_gaap_operating_income_proxy_not_universal_ebit",
  debt: "reviewed_interest_bearing_borrowing_carrying_values_excluding_all_leases",
  financeLeases: "financing_liability_in_ev_corresponding_rou_asset_in_fixed_capital_once",
  operatingLeases: "rent_in_operating_income_exclude_operating_lease_liabilities_from_ev_and_operating_capital",
  capital: "operating_current_assets_less_nonfinancing_current_liabilities_plus_net_ppe_and_unduplicated_finance_rou",
  enterpriseValue: "equity_market_value_plus_borrowings_finance_leases_preferred_nci_less_unrestricted_cash_nonoperating_investments",
  reviewState: "draft_no_model_or_scoring_permission",
} as const);

export type DraftPolicySector="nonfinancial"|"financial"|"reit"|"utility"|"unclassified";
export interface Original10KContext {
  cik:number;
  accession:string;
  periodEnd:string;
  filedDate:string;
  firstObservedAt:string; // evidence availability, NOT backdated to fiscal end
  sourceUrl:string;
  sector:DraftPolicySector; // independently confirmed, not inferred from ticker
}
export interface DraftMagicFormulaEvidence {
  original:Original10KContext;
  earnings:{
    operatingIncomeUsd:string|null;
    pretaxIncomeUsd?:string|null;
    interestExpenseUsd?:string|null; // gross interest expense, positive
  };
  balance:{
    currentAssetsUsd:string|null;
    currentLiabilitiesUsd:string|null;
    cashAndEquivalentsInCurrentAssetsUsd:string|null;
    nonoperatingInvestmentsInCurrentAssetsUsd:string|null;
    otherNonoperatingCurrentAssetsUsd:string|null;
    currentBorrowingsInCurrentLiabilitiesUsd:string|null;
    currentFinanceLeaseInCurrentLiabilitiesUsd:string|null;
    currentOperatingLeaseInCurrentLiabilitiesUsd:string|null;
    netPpeUsd:string|null;
    financeLeaseRouNotAlreadyInNetPpeUsd:string|null; // zero only if source reviewed
  };
  financing:{
    borrowingsExcludingAllLeasesUsd:string|null; // complete note reconciliation
    financeLeaseCurrentUsd:string|null;
    financeLeaseNoncurrentUsd:string|null;
    operatingLeaseCurrentUsd:string|null; // excluded from EV, separately verified
    operatingLeaseNoncurrentUsd:string|null; // excluded from EV
    preferredEquityUsd:string|null; // zero must be verified, not inferred
    noncontrollingInterestUsd:string|null; // zero must be verified, not inferred
    unrestrictedCashAvailableForEvUsd:string|null;
    nonoperatingInvestmentsAvailableForEvUsd:string|null;
  };
  market:{asOf:string;equityMarketCapitalizationUsd:string|null};
  /**
   * This is an audit assertion, not a credential. It does not confer model
   * permission and is not proof of the original issuer's actual statements.
   */
  reviewBasis:"unreviewed_transcription"|"issuer_note_checked_offline";
}
export type DraftMagicFormulaAssessment={
  policyVersion:typeof SEC_MAGIC_FORMULA_POLICY_V1.version;
  status:"arithmetic_only"|"incomplete"|"rejected";
  problems:string[];
  missingFields:string[];
  earningsBasis:typeof SEC_MAGIC_FORMULA_POLICY_V1.earnings;
  gaapOperatingIncomeUsd:string|null;
  pretaxPlusInterestUsd:string|null; // diagnostic only, NEVER substitute for GAAP operating income
  ebitDefinitionDifferenceUsd:string|null;
  financialBorrowingsExLeasesUsd:string|null;
  financeLeaseLiabilityUsd:string|null;
  operatingLeaseLiabilityExcludedUsd:string|null;
  operatingWorkingCapitalUsd:string|null;
  operatingCapitalEmployedUsd:string|null;
  enterpriseValueUsd:string|null;
  returnOnCapitalBps:string|null;
  earningsYieldBps:string|null;
  modelEligible:false;
  scoringEligible:false;
  approval:"draft_needs_original_note_accounting_review";
};

const validDate=(x:string):boolean=>/^\d{4}-\d{2}-\d{2}$/.test(x)&&
  !Number.isNaN(Date.parse(x+"T00:00:00Z"))&&
  new Date(x+"T00:00:00Z").toISOString().startsWith(x);
const whole=(x:string):bigint|null=>/^(0|[1-9]\d*)$/.test(x)?BigInt(x):null;
const signed=(x:string):bigint|null=>/^-?(0|[1-9]\d*)$/.test(x)?BigInt(x):null;
const render=(x:bigint|null)=>x===null?null:x.toString();
const formatBps=(numerator:bigint,denominator:bigint):string=>
  ((numerator*10000n+denominator/2n)/denominator).toString();

export function evaluateSecMagicFormulaDraft(e:DraftMagicFormulaEvidence):DraftMagicFormulaAssessment {
  const problems:string[]=[];
  const missingFields:string[]=[];
  const o=e.original;
  if(!Number.isSafeInteger(o.cik)||o.cik<1||!/^\d{10}-\d{2}-\d{6}$/.test(o.accession)||
    !validDate(o.periodEnd)||!validDate(o.filedDate)||o.filedDate<o.periodEnd){
    problems.push("Original issuer/accession/fiscal year/filing date is invalid");
  }
  let parsedUrl:URL|null=null;
  try{parsedUrl=new URL(o.sourceUrl)}catch{/* invalid URL rejected below */}
  const cleanAccession=o.accession.replaceAll("-","");
  const expectedPrefix="/Archives/edgar/data/"+o.cik+"/"+cleanAccession+"/";
  if(!parsedUrl||parsedUrl.protocol!=="https:"||parsedUrl.hostname!=="www.sec.gov"||
     !parsedUrl.pathname.startsWith(expectedPrefix)||
     !/^[A-Za-z0-9_.-]+\.htm$/.test(parsedUrl.pathname.slice(expectedPrefix.length))||
     parsedUrl.search!==""||parsedUrl.hash!==""){
    problems.push("SEC original source URL does not agree with accession and CIK");
  }
  const firstSeen=Date.parse(o.firstObservedAt);
  const marketAt=Date.parse(e.market.asOf);
  if(!Number.isFinite(firstSeen)||!Number.isFinite(marketAt)||
     !o.firstObservedAt.includes("T")||!e.market.asOf.includes("T")||
     !Number.isFinite(Date.parse(o.filedDate+"T00:00:00Z"))||
     firstSeen<Date.parse(o.filedDate+"T00:00:00Z")||marketAt<firstSeen){
    problems.push("Market snapshot must not precede original source availability; timestamps must be valid instants");
  }
  if(o.sector!=="nonfinancial"){
    problems.push("Only independently classified nonfinancial issuers use industrial Magic Formula policy");
  }
  const numeric:Record<string,bigint|null>={};
  const take=(name:string,value:string|null|undefined,allowSigned=false):void=>{
    if(value===null||value===undefined){missingFields.push(name);numeric[name]=null;return}
    const parsed=allowSigned?signed(value):whole(value);
    if(parsed===null)problems.push("Invalid exact USD integer or negative balance: "+name);
    numeric[name]=parsed;
  };
  for(const [name,val] of Object.entries(e.earnings))take("earnings."+name,val,
    name==="operatingIncomeUsd"||name==="pretaxIncomeUsd");
  for(const [name,val] of Object.entries(e.balance))take("balance."+name,val);
  for(const [name,val] of Object.entries(e.financing))take("financing."+name,val);
  take("market.equityMarketCapitalizationUsd",e.market.equityMarketCapitalizationUsd);
  const n=(key:string)=>numeric[key]??null;
  const sum=(names:string[]):bigint|null=>names.every(k=>n(k)!==null)?
    names.reduce<bigint>((acc,key)=>acc+n(key)!,0n):null;
  const op=n("earnings.operatingIncomeUsd");
  const pretax=n("earnings.pretaxIncomeUsd");
  const interest=n("earnings.interestExpenseUsd");
  const alternative=pretax!==null&&interest!==null?pretax+interest:null;

  const debt=n("financing.borrowingsExcludingAllLeasesUsd");
  const financeLeases=sum(["financing.financeLeaseCurrentUsd","financing.financeLeaseNoncurrentUsd"]);
  const operatingLeases=sum(["financing.operatingLeaseCurrentUsd","financing.operatingLeaseNoncurrentUsd"]);
  const ca=n("balance.currentAssetsUsd");
  const cl=n("balance.currentLiabilitiesUsd");
  const cashInCa=n("balance.cashAndEquivalentsInCurrentAssetsUsd");
  const nonoperatingInvestmentInCa=n("balance.nonoperatingInvestmentsInCurrentAssetsUsd");
  const otherNonopCa=n("balance.otherNonoperatingCurrentAssetsUsd");
  const shortDebtCl=n("balance.currentBorrowingsInCurrentLiabilitiesUsd");
  const finLeaseCl=n("balance.currentFinanceLeaseInCurrentLiabilitiesUsd");
  const operatingLeaseCl=n("balance.currentOperatingLeaseInCurrentLiabilitiesUsd");
  const finLeaseCurrent=n("financing.financeLeaseCurrentUsd");
  const opLeaseCurrent=n("financing.operatingLeaseCurrentUsd");
  const liquidCash=n("financing.unrestrictedCashAvailableForEvUsd");
  const liquidInvestments=n("financing.nonoperatingInvestmentsAvailableForEvUsd");

  // These fields are *declared* as already included in CA/CL. Double-counting
  // or removing more than the original balance sheet is a hard stop.
  const excludedCa=sum([
    "balance.cashAndEquivalentsInCurrentAssetsUsd",
    "balance.nonoperatingInvestmentsInCurrentAssetsUsd",
    "balance.otherNonoperatingCurrentAssetsUsd",
  ]);
  const excludedCl=sum([
    "balance.currentBorrowingsInCurrentLiabilitiesUsd",
    "balance.currentFinanceLeaseInCurrentLiabilitiesUsd",
    "balance.currentOperatingLeaseInCurrentLiabilitiesUsd",
  ]);
  if(excludedCa!==null&&ca!==null&&excludedCa>ca)
    problems.push("Nonoperating current assets/cash exceed reported current assets");
  if(excludedCl!==null&&cl!==null&&excludedCl>cl)
    problems.push("Current financing and operating lease exclusions exceed current liabilities");
  if(shortDebtCl!==null&&debt!==null&&shortDebtCl>debt)
    problems.push("Current borrowing included in liabilities exceeds all reviewed borrowings");
  if(finLeaseCl!==null&&finLeaseCurrent!==null&&finLeaseCl>finLeaseCurrent)
    problems.push("Current finance lease included in liabilities exceeds finance lease current liability");
  if(operatingLeaseCl!==null&&opLeaseCurrent!==null&&operatingLeaseCl>opLeaseCurrent)
    problems.push("Current operating lease included in liabilities exceeds operating lease current liability");
  if(liquidCash!==null&&cashInCa!==null&&liquidCash>cashInCa)
    problems.push("Unrestricted available cash exceeds cash included in current assets");
  if(nonoperatingInvestmentInCa!==null&&liquidInvestments!==null&&
      nonoperatingInvestmentInCa>liquidInvestments)
    problems.push("Nonoperating investments excluded from current assets exceed nonoperating investments in EV");
  const marketCap=n("market.equityMarketCapitalizationUsd");
  if(marketCap!==null&&marketCap===0n)problems.push("Equity market capitalization must be positive");

  const workingCapital=ca!==null&&cl!==null&&excludedCa!==null&&excludedCl!==null?
    ca-excludedCa-(cl-excludedCl):null;
  const ppe=n("balance.netPpeUsd");
  const additionalRou=n("balance.financeLeaseRouNotAlreadyInNetPpeUsd");
  const investedCapital=workingCapital!==null&&ppe!==null&&additionalRou!==null?
    workingCapital+ppe+additionalRou:null;
  const preferred=n("financing.preferredEquityUsd");
  const nci=n("financing.noncontrollingInterestUsd");
  const ev=marketCap!==null&&debt!==null&&financeLeases!==null&&preferred!==null&&
    nci!==null&&liquidCash!==null&&liquidInvestments!==null?
    marketCap+debt+financeLeases+preferred+nci-liquidCash-liquidInvestments:null;

  if(op!==null&&op<=0n)problems.push("Operating income must be positive for this Magic Formula policy");
  if(investedCapital!==null&&investedCapital<=0n)problems.push("Operating capital employed must be positive");
  if(ev!==null&&ev<=0n)problems.push("Enterprise value must be positive");
  const status:DraftMagicFormulaAssessment["status"]=problems.length?"rejected":
    missingFields.length?"incomplete":"arithmetic_only";
  const safe=problems.length===0;
  return{
    policyVersion:SEC_MAGIC_FORMULA_POLICY_V1.version,status,problems,missingFields,
    earningsBasis:SEC_MAGIC_FORMULA_POLICY_V1.earnings,
    gaapOperatingIncomeUsd:safe?render(op):null,
    pretaxPlusInterestUsd:safe?render(alternative):null,
    ebitDefinitionDifferenceUsd:safe&&alternative!==null&&op!==null?
      render(alternative-op):null,
    financialBorrowingsExLeasesUsd:safe?render(debt):null,
    financeLeaseLiabilityUsd:safe?render(financeLeases):null,
    operatingLeaseLiabilityExcludedUsd:safe?render(operatingLeases):null,
    operatingWorkingCapitalUsd:safe?render(workingCapital):null,
    operatingCapitalEmployedUsd:safe?render(investedCapital):null,
    enterpriseValueUsd:safe?render(ev):null,
    returnOnCapitalBps:safe&&op!==null&&investedCapital!==null&&
      op>0n&&investedCapital>0n?formatBps(op,investedCapital):null,
    earningsYieldBps:safe&&op!==null&&ev!==null&&op>0n&&ev>0n?
      formatBps(op,ev):null,
    modelEligible:false,scoringEligible:false,
    approval:"draft_needs_original_note_accounting_review",
  };
}
