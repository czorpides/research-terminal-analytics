import assert from "node:assert/strict";
import {test} from "node:test";
import {extractSecGaapContinuingIncome,type SecCompanyFacts} from "./sec-gaap-continuing.ts";

const periods=[
 ["2025-01-01","2025-03-31","CY2025Q1"],
 ["2025-04-01","2025-06-30","CY2025Q2"],
 ["2025-07-01","2025-09-30","CY2025Q3"],
 ["2025-10-01","2025-12-31","CY2025Q4"],
] as const;
const accns=["0000123456-25-000001","0000123456-25-000002","0000123456-25-000003","0000123456-26-000004"];
const accepted=["2025-05-03T18:00:00Z","2025-08-01T18:00:00Z",
 "2025-11-03T18:00:00Z","2026-02-15T18:00:00Z"];
const values=[20_000_000,30_000_000,40_000_000,50_000_000];
const raw=periods.map(([start,end,frame],i)=>({
 start,end,frame,val:values[i],accn:accns[i],form:i===3?"10-K":"10-Q",
 filed:accepted[i].slice(0,10),
}));
const admissions=Object.fromEntries(accns.map((key,i)=>[key,accepted[i]]));
const at=new Date("2026-02-28T12:00:00Z");
const packet:SecCompanyFacts={cik:12345,facts:{"us-gaap":{
 IncomeLossFromContinuingOperations:{units:{USD:raw}},
 NetIncomeLoss:{units:{USD:raw.map((i)=>({...i,val:1_000_000_000}))}},
}}};
test("four independently accepted US GAAP continuing-operation quarters produce exact USD sums",()=>{
 const x=extractSecGaapContinuingIncome(packet,admissions,at);
 assert.equal(x.state,"complete_direct_quarters");
 assert.equal(x.latestQuarterUsd,50_000_000);
 assert.equal(x.trailingFourQuarterUsd,140_000_000);
 assert.equal(x.quarterFacts.length,4);
 assert.equal(x.requiresIndependentReview,true);
});
test("latest negative quarter remains a loss even if TTM aggregate positive",()=>{
 const minus=raw.map((v,i)=>({...v,val:i===3?-20_000_000:v.val}));
 const x=extractSecGaapContinuingIncome({cik:12345,facts:{"us-gaap":{
  IncomeLossFromContinuingOperations:{units:{USD:minus}}}}},admissions,at);
 assert.equal(x.state,"complete_direct_quarters");
 assert.equal(x.latestQuarterUsd,-20_000_000);
 assert.equal(x.trailingFourQuarterUsd,70_000_000);
});
test("no automatic fallback from general net income when continuing income not tagged",()=>{
 const x=extractSecGaapContinuingIncome({cik:12345,facts:{"us-gaap":{
  NetIncomeLoss:{units:{USD:raw}}}}},admissions,at);
 assert.equal(x.state,"insufficient");assert.equal(x.latestQuarterUsd,null);
});
test("filingDate alone or missing SEC acceptance times cannot enter historical evidence",()=>{
 const x=extractSecGaapContinuingIncome(packet,{},at);
 assert.equal(x.state,"insufficient");assert.equal(x.trailingFourQuarterUsd,null);
});
test("acceptance after historical date prevents future filing lookahead",()=>{
 const earlier=new Date("2025-12-15T12:00:00Z");
 const x=extractSecGaapContinuingIncome(packet,admissions,earlier);
 assert.equal(x.state,"insufficient");assert.equal(x.latestQuarterUsd,null);
});
test("a subsequently corrected filing never overwrites historical as-of quarter",()=>{
 const corrected={...raw[2],accn:"0000123456-26-000099",val:-1_000_000_000};
 const revised={cik:12345,facts:{"us-gaap":{
  IncomeLossFromContinuingOperations:{units:{USD:[...raw,corrected]}}}}};
 const accept={...admissions,[corrected.accn]:"2026-03-30T12:00:00Z"};
 const before=extractSecGaapContinuingIncome(revised,accept,at);
 assert.equal(before.state,"complete_direct_quarters");
 assert.equal(before.quarterFacts.find(v=>v.end==="2025-09-30")?.valueUsd,40_000_000);
});
test("filing acceptance must be offset-aware and after quarter end",()=>{
 const notZ={...admissions,[accns[3]]:"2026-02-15T15:00:00"};
 assert.equal(extractSecGaapContinuingIncome(packet,notZ,at).state,"insufficient");
 const impossible={...admissions,[accns[3]]:"2025-12-01T18:00:00Z"};
 assert.equal(extractSecGaapContinuingIncome(packet,impossible,at).state,"insufficient");
});
test("year-to-date fact cannot masquerade as a single quarter",()=>{
 const ytd=[...raw.slice(0,3),{...raw[3],start:"2025-01-01"}];
 const x=extractSecGaapContinuingIncome({cik:12345,facts:{"us-gaap":{
  IncomeLossFromContinuingOperations:{units:{USD:ytd}}}}},admissions,at);
 assert.equal(x.state,"insufficient");
});
test("ambiguous same-acceptance contradictory period facts fail closed",()=>{
 const conflict={...raw[3],val:100_000_000};
 const x=extractSecGaapContinuingIncome({cik:12345,facts:{"us-gaap":{
  IncomeLossFromContinuingOperations:{units:{USD:[...raw,conflict]}}}}},admissions,at);
 assert.equal(x.state,"ambiguous");
});
