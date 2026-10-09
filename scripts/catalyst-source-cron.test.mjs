import assert from "node:assert/strict";
import { test } from "node:test";
import { pollCatalystSources } from "./catalyst-source-cron.mjs";

const TOKEN="A-32-character-plus-internal-job-token-for-test";
test("S&P poll runs without enabling unconfigured SEC, and sends token server-side",async()=>{
 const paths=[];const authorizations=[];
 const fetcher=async(url,options)=>{
   paths.push(new URL(url).pathname);
   authorizations.push(options.headers.Authorization);
   return Response.json({ok:true,observed:1},{status:200});
 };
 const results=await pollCatalystSources({token:TOKEN,fetcher});
 assert.deepEqual(paths,["/api/public/catalysts/poll-sp-index"]);
 assert.equal(results[0].ok,true);
 assert.equal(authorizations[0],"Bearer "+TOKEN);
});
test("when SEC is enabled, sources remain bounded and safe",async()=>{
 const paths=[];
 const results=await pollCatalystSources({
   token:TOKEN,secEnabled:true,symbols:["QCOM","PENG"],
   fetcher:async(url,options)=>{
     paths.push({path:new URL(url).pathname,body:JSON.parse(options.body)});
     return Response.json({ok:true},{status:200});
   },
 });
 assert.deepEqual(paths.map(v=>v.path),[
   "/api/public/catalysts/poll-sp-index","/api/public/catalysts/ingest-sec",
 ]);
 assert.deepEqual(paths[1].body.symbols,["QCOM","PENG"]);
 assert.ok(results.every(r=>r.ok));
});
test("cron refuses arbitrary hosts and missing secrets",async()=>{
 const fetcher=async()=>{throw Error("should not execute")};
 await assert.rejects(()=>pollCatalystSources({token:"too-short",fetcher}),/INTERNAL_JOB_TOKEN/);
 await assert.rejects(()=>pollCatalystSources({token:TOKEN,baseUrl:"https://attacker.example.com",fetcher}),/isolated staging/);
});
test("source failure becomes explicit non-success; no silent successful poll",async()=>{
 const results=await pollCatalystSources({
   token:TOKEN,fetcher:async()=>Response.json({ok:false},{status:503}),
 });
 assert.equal(results[0].ok,false);
 assert.equal(results[0].httpStatus,503);
});
