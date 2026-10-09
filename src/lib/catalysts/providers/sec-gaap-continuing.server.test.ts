import assert from "node:assert/strict";
import {test} from "node:test";
import {fetchSecContinuingProfitability} from "./sec-gaap-continuing.server.ts";
const agent="ResearchTerminalTests/1.0 reachable@example.org";
const accepted=["2025-05-03T18:00:00Z","2025-08-01T18:00:00Z",
 "2025-11-03T18:00:00Z","2026-02-15T18:00:00Z"];
const accession=["0000012345-25-000001","0000012345-25-000002",
 "0000012345-25-000003","0000012345-26-000004"];
const recent={form:["10-Q","10-Q","10-Q","10-K"],accessionNumber:accession,
 acceptanceDateTime:accepted,filingDate:accepted.map(s=>s.slice(0,10)),
 primaryDocument:["a.htm","b.htm","c.htm","d.htm"],items:["","","",""]};
const periods=[
 ["2025-01-01","2025-03-31","CY2025Q1"],["2025-04-01","2025-06-30","CY2025Q2"],
 ["2025-07-01","2025-09-30","CY2025Q3"],["2025-10-01","2025-12-31","CY2025Q4"],
] as const;
const facts={cik:12345,facts:{"us-gaap":{
 IncomeLossFromContinuingOperations:{units:{USD:periods.map(([start,end,frame],i)=>
  ({start,end,frame,form:recent.form[i],accn:accession[i],val:(i+1)*10_000_000}))}}
}}};
const tickerIndex={"0":{cik_str:12345,ticker:"BE",title:"Bloom Energy"}};
test("bounded three-request SEC CompanyFacts probe proves access provenance but not live historical discovery",async()=>{
 const urls:string[]=[];
 const result=await fetchSecContinuingProfitability({
  symbols:["BE"],userAgent:agent,
  now:new Date("2026-10-09T12:00:00Z"),asOf:new Date("2026-02-28T12:00:00Z"),
  wait:async()=>{},
  fetchJson:async <T>(url:string,ua:string):Promise<T>=>{
   assert.equal(ua,agent);urls.push(url);
   if(url.includes("company_tickers"))return tickerIndex as T;
   if(url.includes("/submissions/"))return {filings:{recent}} as T;
   if(url.includes("/companyfacts/"))return facts as T;
   throw Error("Unexpected SEC host/path");
  },
 });
 assert.equal(urls.length,3);
 assert.deepEqual(urls.map(u=>new URL(u).hostname),["www.sec.gov","data.sec.gov","data.sec.gov"]);
 assert.equal(result[0].evidence?.state,"complete_direct_quarters");
 assert.equal(result[0].evidence?.trailingFourQuarterUsd,100_000_000);
 assert.equal(result[0].retrospectivelyReconstructed,true);
});
test("SEC CIK discrepancy is rejected rather than assigned to ticker",async()=>{
 const result=await fetchSecContinuingProfitability({
  symbols:["BE"],userAgent:agent,wait:async()=>{},
  fetchJson:async <T>(url:string):Promise<T>=>{
   if(url.includes("company_tickers"))return tickerIndex as T;
   if(url.includes("/submissions/"))return {filings:{recent}} as T;
   return {...facts,cik:999} as T;
  },
 });
 assert.equal(result[0].evidence,null);
 assert.match(result[0].warning??"",/CIK/);
});
test("SEC contact User-Agent and bounded securities are mandatory",async()=>{
 await assert.rejects(()=>fetchSecContinuingProfitability({
  symbols:["BE"],userAgent:"bot",fetchJson:async()=>{throw Error("NO");}
 }),/SEC_EDGAR_USER_AGENT/);
 await assert.rejects(()=>fetchSecContinuingProfitability({
  symbols:["BE","B","C","D","E"],userAgent:agent,
  fetchJson:async()=>{throw Error("NO");}
 }),/1-4/);
});
test("future cutoff is refused before contacting EDGAR",async()=>{
 await assert.rejects(()=>fetchSecContinuingProfitability({
  symbols:["BE"],userAgent:agent,now:new Date("2026-10-09T00:00:00Z"),
  asOf:new Date("2026-10-20T00:00:00Z"),
  fetchJson:async()=>{throw Error("NO");}
 }),/historical cutoff/);
});
