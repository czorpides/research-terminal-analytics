import test from "node:test";
import assert from "node:assert/strict";
import { chooseSecHistoricFiles } from "./historic-index.ts";
import { selectSecAnnualFilings } from "./normalize-annual.ts";

const cik=19617;
const three=[2025,2024,2023].map((year)=>({
 accession:year===2025?"0001628280-26-008131":year===2024?"0000019617-25-000270":"0000019617-24-000225",
 period:String(year)+"-12-31",year,
 start:String(year)+"-01-01",
 filing:String(year+1)+"-02-15",
}));
const current={cik:19617,tickers:["JPM"],filings:{
 recent:{ accessionNumber:[three[0].accession],form:["10-K"],reportDate:[three[0].period],filingDate:[three[0].filing],primaryDocument:["jpm.htm"]},
 files:[{name:"CIK0000019617-submissions-001.json",filingFrom:"2024-01-01",filingTo:"2025-12-31"},
        {name:"CIK0000019617-submissions-002.json",filingFrom:"2022-01-01",filingTo:"2023-12-31"},
        {name:"https://evil.com/filings.json",filingTo:"2025-12-31"},
        {name:"CIK0000019617-submissions-003.json",filingTo:"2010-12-31"},
        {name:"CIK9999999999-submissions-099.json",filingTo:"2025-12-31"}]
}};
const archive={accessionNumber:three.slice(1).map(x=>x.accession),
 form:["10-K","10-K"],reportDate:three.slice(1).map(x=>x.period),
 filingDate:three.slice(1).map(x=>x.filing),primaryDocument:["jpm2024.htm","jpm2023.htm"]};
const facts={cik, facts:{"us-gaap":{NetIncomeLoss:{units:{USD:three.map(x=>({
 accn:x.accession,form:"10-K",end:x.period,start:x.start,val:x.year*100,
 }))}}}}};
test("archive filenames are exact CIK-bound and capped, never arbitrary URLs",()=>{
  assert.deepEqual(chooseSecHistoricFiles(current,cik,2026),[
    "CIK0000019617-submissions-001.json",
    "CIK0000019617-submissions-002.json",
  ]);
  assert.deepEqual(chooseSecHistoricFiles(current,320193,2026),[]);
  assert.deepEqual(chooseSecHistoricFiles(current,cik,2026,0),[]);
});
test("recovers missing original years from older SEC filing indexes without cross-accession facts",()=>{
 const onlyRecent=selectSecAnnualFilings(cik,"JPM",current,facts,3);
 assert.deepEqual(onlyRecent.map(x=>x.periodEnd),["2025-12-31"]);
 const recovered=selectSecAnnualFilings(cik,"JPM",current,facts,3,[archive]);
 assert.deepEqual(recovered.map(x=>x.periodEnd),["2025-12-31","2024-12-31","2023-12-31"]);
 assert.deepEqual(recovered.map(x=>x.facts[0]?.accession),three.map(x=>x.accession));
});
test("repeated and unsorted archive rows do not create duplicate annual periods",()=>{
 const recovered=selectSecAnnualFilings(cik,"JPM",current,facts,3,[archive,archive]);
 assert.equal(recovered.length,3);
});
test("invalid archive arrays fail closed",()=>{
 assert.throws(()=>selectSecAnnualFilings(cik,"JPM",current,facts,3,[{accessionNumber:["x"],form:[]}]),/Malformed/);
});
