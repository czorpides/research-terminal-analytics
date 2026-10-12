import test from "node:test";
import assert from "node:assert/strict";
import {
 SEC_VALUATION_COHORT,SEC_VALUATION_FIELDS,prepareValuationPreview,
 type SecValuationSymbol,type ManualFactMap,type MarketTranscription,
} from "./valuation-workbench.ts";
import type {Original10KContext} from "./magic-formula-policy-draft.ts";

function context(symbol:SecValuationSymbol):Original10KContext {
 const c=SEC_VALUATION_COHORT[symbol];
 return {cik:c.cik,accession:c.accession,periodEnd:c.periodEnd,
  sourceUrl:c.official10k,sector:"nonfinancial",filedDate:"2026-10-08",
  firstObservedAt:"2026-10-12T10:00:00Z"};
}
const m=(value:number)=>String(value*1000000); // fixture values are small safe integers
const figures:Record<string,string>={
 "balance.currentAssetsUsd":m(4000),
 "balance.currentLiabilitiesUsd":m(2200),
 "balance.cashAndEquivalentsInCurrentAssetsUsd":m(500),
 "balance.nonoperatingInvestmentsInCurrentAssetsUsd":m(100),
 "balance.otherNonoperatingCurrentAssetsUsd":m(50),
 "balance.currentBorrowingsInCurrentLiabilitiesUsd":m(300),
 "balance.currentFinanceLeaseInCurrentLiabilitiesUsd":m(50),
 "balance.currentOperatingLeaseInCurrentLiabilitiesUsd":m(100),
 "balance.netPpeUsd":m(3000),
 "balance.financeLeaseRouNotAlreadyInNetPpeUsd":m(250),
 "financing.financeLeaseCurrentUsd":m(50),
 "financing.financeLeaseNoncurrentUsd":m(450),
 "financing.operatingLeaseCurrentUsd":m(100),
 "financing.operatingLeaseNoncurrentUsd":m(600),
 "financing.preferredEquityUsd":m(100),
 "financing.noncontrollingInterestUsd":m(50),
 "financing.unrestrictedCashAvailableForEvUsd":m(450),
 "financing.nonoperatingInvestmentsAvailableForEvUsd":m(150),
};
function manual(symbol:SecValuationSymbol):ManualFactMap {
 const url=SEC_VALUATION_COHORT[symbol].official10k;
 return Object.fromEntries(SEC_VALUATION_FIELDS.map(f=>[f.key,{
  valueUsd:figures[f.key],sourceSection:"Mock input for arithmetic test only",
  sourceUrl:url,
 }])) as ManualFactMap;
}
const market:MarketTranscription={
 valueUsd:m(8000),asOf:"2026-10-12T12:00:00Z",
 sourceUrl:"https://example.org/dated-market-cap",
 sourceDescription:"Artificial market capitalisation for a deterministic contract test only",
};
test("source-checked AMZN / ADBE / COST anchors are immutable and absent values remain unavailable",()=>{
 for(const symbol of ["AMZN","ADBE","COST"] as const){
  const p=prepareValuationPreview(symbol,context(symbol));
  const c=SEC_VALUATION_COHORT[symbol];
  assert.equal(p.originalAccession,c.accession);
  assert.equal(p.assessment.gaapOperatingIncomeUsd,c.operatingIncomeUsd);
  assert.equal(p.assessment.financialBorrowingsExLeasesUsd,symbol==="AMZN"?null:c.borrowingUsd);
  assert.equal(p.assessment.status,"incomplete");
  assert.equal(p.assessment.returnOnCapitalBps,null);
  assert.equal(p.assessment.enterpriseValueUsd,null);
  assert.equal(p.assessment.earningsYieldBps,null);
  assert.equal(p.missingManualFields.length,18);
  assert.equal(p.permittedForModels,false);
  assert.equal(p.permittedForScoring,false);
  assert.equal(p.storedChanges,0);
 }
});
test("AMZN exact original earnings concept does not become earnings-before-interest proxy",()=>{
 const p=prepareValuationPreview("AMZN",context("AMZN"));
 assert.equal(p.assessment.gaapOperatingIncomeUsd,"79975000000");
 assert.equal(p.assessment.pretaxPlusInterestUsd,"99585000000");
 assert.equal(p.assessment.ebitDefinitionDifferenceUsd,"19610000000");
 assert.equal(p.legacyCalculationVersion,"opportunity.magic-formula.v0.1");
 assert.equal(p.legacyStyle.status,"not_comparable");
});
test("ADBE hedge-adjusted debt persists only as a separate borrowing source anchor",()=>{
 const p=prepareValuationPreview("ADBE",context("ADBE"));
 assert.equal(p.assessment.financialBorrowingsExLeasesUsd,"6210000000");
 assert.equal(p.assessment.pretaxPlusInterestUsd,"8997000000");
 assert.equal(p.assessment.ebitDefinitionDifferenceUsd,"291000000");
});
test("synthetic COST manual transcription proves arithmetic not accounting accuracy or scoring",()=>{
 const p=prepareValuationPreview("COST",context("COST"),manual("COST"),market);
 assert.equal(p.assessment.status,"arithmetic_only");
 assert.equal(p.assessment.operatingCapitalEmployedUsd,m(4850));
 assert.equal(p.assessment.operatingWorkingCapitalUsd,m(1600));
 assert.equal(p.assessment.financeLeaseLiabilityUsd,m(500));
 assert.equal(p.assessment.operatingLeaseLiabilityExcludedUsd,m(700));
 assert.equal(p.assessment.enterpriseValueUsd,m(14212));
 assert.equal(p.legacyStyle.status,"arithmetic_only");
 assert.equal(p.legacyStyle.capitalEmployedUsd,m(4800));
 assert.equal(p.legacyStyle.enterpriseValueUsd,m(13662));
 assert.equal(p.assessment.returnOnCapitalBps,"24093");
 assert.equal(p.inputReviewStatus,"manual_transcription_not_independently_rechecked");
 assert.equal(p.permittedForModels,false);
 assert.equal(p.permittedForScoring,false);
});
test("unverified manual fixtures with missing securities price cannot produce enterprise value",()=>{
 const p=prepareValuationPreview("AMZN",context("AMZN"),manual("AMZN"));
 assert.equal(p.assessment.status,"incomplete");
 assert.equal(p.assessment.enterpriseValueUsd,null);
 assert.equal(p.assessment.earningsYieldBps,null);
 assert.equal(p.legacyStyle.status,"not_comparable");
});
test("missing and explicitly zero lease liabilities are distinct",()=>{
 const d=manual("AMZN");
 delete d["financing.financeLeaseNoncurrentUsd"];
 const p=prepareValuationPreview("AMZN",context("AMZN"),d,market);
 assert.equal(p.assessment.status,"incomplete");
 assert.equal(p.assessment.financeLeaseLiabilityUsd,null);
 assert.equal(p.assessment.enterpriseValueUsd,null);
 assert.ok(p.missingManualFields.includes("financing.financeLeaseNoncurrentUsd"));
 d["financing.financeLeaseNoncurrentUsd"]={valueUsd:"0",
  sourceSection:"Source-checked example claims zero balance",sourceUrl:SEC_VALUATION_COHORT.AMZN.official10k};
 const next=prepareValuationPreview("AMZN",context("AMZN"),d,market);
 assert.equal(next.assessment.financeLeaseLiabilityUsd,m(50));
});
test("reject overridden original debt, unknown fields and wrong original source",()=>{
 const s=manual("AMZN") as ManualFactMap&Record<string,unknown>;
 s["financing.borrowingsExcludingAllLeasesUsd"]={
  valueUsd:"0",sourceSection:"Debt note page 1",sourceUrl:SEC_VALUATION_COHORT.AMZN.official10k};
 let result=prepareValuationPreview("AMZN",context("AMZN"),s,market);
 assert.equal(result.assessment.status,"rejected");
 assert.equal(result.assessment.enterpriseValueUsd,null);
 assert.equal(result.assessment.financialBorrowingsExLeasesUsd,null);
 delete s["financing.borrowingsExcludingAllLeasesUsd"];
 s["balance.netPpeUsd"]={valueUsd:m(3000),sourceSection:"Note 2 - PP&E",
  sourceUrl:"https://www.sec.gov/Archives/edgar/data/9999/not-the-source.htm"};
 result=prepareValuationPreview("AMZN",context("AMZN"),s,market);
 assert.equal(result.assessment.status,"rejected");
 assert.equal(result.assessment.returnOnCapitalBps,null);
});
test("zero or blank cannot bypass individual source location or claim verified evidence",()=>{
 const s=manual("AMZN");
 s["balance.currentAssetsUsd"]={valueUsd:"0",sourceSection:"",sourceUrl:SEC_VALUATION_COHORT.AMZN.official10k};
 const x=prepareValuationPreview("AMZN",context("AMZN"),s,market);
 assert.equal(x.assessment.status,"rejected");
 assert.ok(x.provenanceProblems.some(y=>y.includes("balance.currentAssetsUsd")));
 assert.equal(x.inputReviewStatus,"manual_transcription_not_independently_rechecked");
});
test("original SEC accession, issuer, fiscal period and sector are immutable",()=>{
 const base=context("AMZN");
 for(const bad of [
  {...base,cik:1234}, {...base,accession:"0001018724-25-000004"},
  {...base,periodEnd:"2024-12-31"},{...base,sector:"financial" as const},
  {...base,sourceUrl:SEC_VALUATION_COHORT.ADBE.official10k},
 ]){
  assert.throws(()=>prepareValuationPreview("AMZN",bad),/provenance/);
 }
});
test("price as-of before source observed is forbidden and cannot create ratios",()=>{
 const out=prepareValuationPreview("ADBE",context("ADBE"),manual("ADBE"),{
  ...market,asOf:"2026-10-12T09:59:59Z"});
 assert.equal(out.assessment.status,"rejected");
 assert.equal(out.assessment.earningsYieldBps,null);
 assert.equal(out.legacyStyle.status,"not_comparable");
});
test("market cap requires an actual HTTPS reference, provenance description and exact amount",()=>{
 for(const incorrect of [
  {...market,sourceUrl:"http://example.org"},
  {...market,sourceDescription:""},
  {...market,valueUsd:"8.2e9"},
  {...market,asOf:"today"},
 ]){
  const p=prepareValuationPreview("AMZN",context("AMZN"),manual("AMZN"),incorrect);
  assert.equal(p.assessment.status,"rejected");
  assert.equal(p.assessment.returnOnCapitalBps,null);
 }
});

test("Amazon non-lease long-term debt is explicitly incomplete under independent Note 6 recheck",()=>{
 const p=prepareValuationPreview("AMZN",context("AMZN"),manual("AMZN"),market);
 assert.equal(p.independentSourceReview.borrowingPerimeter,"incomplete");
 assert.equal(p.independentSourceReview.arithmeticPass,true);
 assert.equal(p.assessment.financialBorrowingsExLeasesUsd,null);
 assert.equal(p.assessment.enterpriseValueUsd,null);
 assert.equal(p.assessment.status,"incomplete");
 assert.equal(p.legacyStyle.status,"not_comparable");
 const minimum=p.sourceAnchors.find(x=>x.key==="source.identifiedNonleaseBorrowingsMinimumUsd");
 assert.equal(minimum?.valueUsd,"68851000000");
 assert.equal(p.permittedForScoring,false);
});
test("Costco original profit plus interest is a diagnostic, not GAAP operating income",()=>{
 const p=prepareValuationPreview("COST",context("COST"));
 assert.equal(p.assessment.gaapOperatingIncomeUsd,"11685000000");
 assert.equal(p.assessment.pretaxPlusInterestUsd,"12396000000");
 assert.equal(p.assessment.ebitDefinitionDifferenceUsd,"711000000");
});
