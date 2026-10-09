import assert from "node:assert/strict";
import { test } from "node:test";
import { parseTickerIndex,zipRecentFilings,extractSecEarningsCandidates,fetchSecEarningsCandidates,verifySecUserAgent } from "./sec-edgar.server.ts";

const ua="ResearchTerminal/0.1 (operations@example.org)";
const filing={form:"8-K",items:"2.02,9.01",accessionNumber:"0000804328-26-000123",
  primaryDocument:"qcom-results.htm",acceptanceDateTime:"2026-10-08T14:05:00Z",filingDate:"2026-10-08"};
const now=new Date("2026-10-09T12:00:00Z"),since=new Date("2026-09-01T00:00:00Z");
test("SEC ticker map identifies correct CIK",()=>{
  const index=parseTickerIndex({"0":{ticker:"QCOM",cik_str:804328,title:"QUALCOMM"}});
  assert.equal(index.get("QCOM")?.cik_str,804328);
});
test("SEC array-shaped submissions align one item per filing",()=>{
  const rows=zipRecentFilings({form:["8-K","10-Q"],accessionNumber:["a","b"],items:["2.02",""],primaryDocument:["a.htm","b.htm"]});
  assert.equal(rows.length,2);
  assert.equal(rows[0].items,"2.02");
  assert.equal(rows[1].form,"10-Q");
});
test("results filing is a neutral candidate, not a fabricated earnings beat",()=>{
  const rows=extractSecEarningsCandidates("QCOM",804328,[filing],since,now);
  assert.equal(rows.length,1);
  assert.equal(rows[0].event_type,"earnings_result");
  assert.equal(rows[0].direction,"uncertain");
  assert.equal(rows[0].materiality,null);
  assert.equal(rows[0].known_at,filing.acceptanceDateTime.replace("Z",".000Z"));
  assert.equal(rows[0].source_url,"https://www.sec.gov/Archives/edgar/data/804328/000080432826000123/qcom-results.htm");
});
test("other 8-K disclosures must not be mislabelled as government awards or earnings",()=>{
  assert.equal(extractSecEarningsCandidates("QCOM",804328,[{...filing,items:"1.01,9.01"}],since,now).length,0);
  assert.equal(extractSecEarningsCandidates("QCOM",804328,[{...filing,items:"7.01"}],since,now).length,0);
});
test("no point-in-time leakage from future filings",()=>{
  const future={...filing,acceptanceDateTime:"2026-10-10T17:05:00Z"};
  assert.equal(extractSecEarningsCandidates("QCOM",804328,[future],since,now).length,0);
});
test("do not publish guesses if the SEC public acceptance timestamp is missing",()=>{
  const missing={...filing,acceptanceDateTime:undefined};
  assert.equal(extractSecEarningsCandidates("QCOM",804328,[missing],since,now).length,0);
});
test("unsafe primary document names are rejected",()=>{
  assert.equal(extractSecEarningsCandidates("QCOM",804328,[{...filing,primaryDocument:"../bad"}],since,now).length,0);
});
test("SEC requires identifying User-Agent",()=>{
  assert.throws(()=>verifySecUserAgent("Mozilla/5.0"));
  assert.equal(verifySecUserAgent(ua),ua);
});
test("poll only requested tickers and preserve neutral candidate status",async()=>{
  const called:string[]=[];
  const response=await fetchSecEarningsCandidates({
    symbols:["QCOM"],lookbackDays:30,userAgent:ua,now,
    wait:async()=>{},
    fetcher:async<T>(url:string)=>{
      called.push(url);
      if(url.endsWith("company_tickers.json"))return {"0":{ticker:"QCOM",cik_str:804328,title:"Qualcomm"}} as T;
      return {filings:{recent:{form:["8-K"],items:["2.02"],accessionNumber:[filing.accessionNumber],
        primaryDocument:[filing.primaryDocument],filingDate:[filing.filingDate],
        acceptanceDateTime:[filing.acceptanceDateTime]}}} as T;
    },
  });
  assert.equal(called.length,2);
  assert.equal(response.candidates.length,1);
  assert.equal(response.candidates[0].direction,"uncertain");
  assert.equal(response.warnings.length,0);
});
