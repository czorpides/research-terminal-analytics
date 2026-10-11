import test from "node:test";
import assert from "node:assert/strict";
import { chooseSecHistoricFiles } from "./historic-index.ts";
import { selectSecAnnualFilings } from "./normalize-annual.ts";
import { hasThreeConsecutiveSecYears } from "./pilot-plan.ts";


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

test("three nonconsecutive original 10-K years still require an archive probe", () => {
  const gap=["2025-12-31","2023-12-31","2022-12-31"];
  assert.equal(gap.length,3);
  assert.equal(hasThreeConsecutiveSecYears(gap),false);
  const filled=["2025-12-31","2024-12-31","2023-12-31"];
  assert.equal(hasThreeConsecutiveSecYears(filled),true);
});

test("targets FY2024 and FY2023 filing-date archive shards instead of four newest",()=>{
  // Dense issuer: the latest four continuation shards are from late 2026.
  // Original SEC 10-Ks were filed in February 2025 and February 2024.
  const files=[
    ["001","2026-09-01","2026-10-10"],
    ["002","2026-07-01","2026-08-31"],
    ["003","2026-05-01","2026-06-30"],
    ["004","2026-03-01","2026-04-30"],
    ["005","2025-02-14","2025-02-25"],
    ["006","2025-01-15","2025-02-13"],
    ["007","2024-02-16","2024-02-29"],
    ["008","2024-01-15","2024-02-15"],
  ].map(([num,filingFrom,filingTo])=>({
    name:"CIK0000019617-submissions-"+num+".json",
    filingFrom,filingTo,
  }));
  const source={filings:{files}};
  const oldSelection=chooseSecHistoricFiles(source,cik,2026,4);
  assert.deepEqual(oldSelection,files.slice(0,4).map(x=>x.name));
  const targeted=chooseSecHistoricFiles(source,cik,2026,4,"2026-02-13");
  assert.deepEqual(targeted,[
    "CIK0000019617-submissions-006.json",
    "CIK0000019617-submissions-008.json",
    "CIK0000019617-submissions-005.json",
    "CIK0000019617-submissions-007.json",
  ]);
  assert.equal(targeted.length,4);
});
test("targeted selection stays same-CIK and bounded with malformed SEC metadata",()=>{
  const files=[
    {name:"CIK0000019617-submissions-010.json",filingFrom:"2024-01-01",filingTo:"2024-03-01"},
    {name:"CIK0000019617-submissions-009.json",filingFrom:"2025-01-01",filingTo:"2025-03-01"},
    {name:"CIK9999999999-submissions-001.json",filingFrom:"2024-01-01",filingTo:"2024-03-01"},
    {name:"CIK0000019617-submissions-008.json",filingFrom:"2026-04-01",filingTo:"2025-01-01"},
    {name:"CIK0000019617-submissions-007.json",filingFrom:"invalid",filingTo:"2050-01-01"},
  ];
  const chosen=chooseSecHistoricFiles({filings:{files}},cik,2026,2,"2026-02-13");
  assert.deepEqual(chosen,["CIK0000019617-submissions-009.json","CIK0000019617-submissions-010.json"]);
  assert.deepEqual(chooseSecHistoricFiles({filings:{files}},cik,2026,0,"2026-02-13"),[]);
  assert.deepEqual(chooseSecHistoricFiles({filings:{files}},320193,2026,4,"2026-02-13"),[]);
});
