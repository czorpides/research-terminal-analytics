import test from "node:test";
import assert from "node:assert/strict";
import {getSwingPricePagesWithTimeoutSplit,SWING_PRICE_RPC_BATCH_SIZE} from "./deep-scan-price-reads.ts";
type Row={asset_id:string};
test("small 220-name deep scan stays bounded at eight per RPC and two in parallel",async()=>{
 const ids=Array.from({length:220},(_,i)=>"asset-"+i);
 let running=0,max=0;const calls:number[]=[];
 const pages=await getSwingPricePagesWithTimeoutSplit<Row>(ids,async values=>{
  running++;max=Math.max(max,running);calls.push(values.length);
  await Promise.resolve();running--;
  return {data:values.map(asset_id=>({asset_id})),error:null};
 });
 assert.equal(calls.reduce((a,b)=>a+b,0),220);
 assert.ok(calls.every(n=>n<=SWING_PRICE_RPC_BATCH_SIZE));
 assert.ok(max<=2);
 assert.deepEqual(pages.flatMap(x=>x.data??[]).map(x=>x.asset_id),ids);
});
test("one 57014 group splits without repeating successful groups",async()=>{
 const calls:string[][]=[];
 const pages=await getSwingPricePagesWithTimeoutSplit<Row>(
  Array.from({length:12},(_,i)=>String(i)),
  async ids=>{
   calls.push(ids);
   if(ids.length>4)return {data:null,error:{code:"57014",message:"canceling statement due to statement timeout"}};
   return {data:ids.map(asset_id=>({asset_id})),error:null};
  },
 );
 assert.deepEqual(pages.flatMap(x=>x.data??[]).map(x=>x.asset_id),
  Array.from({length:12},(_,i)=>String(i)));
 assert.equal(calls.filter(c=>c.length===8).length,1);
 assert.equal(calls.filter(c=>c.length===4).length,3);
});
test("single asset timeout terminates bounded retrieval rather than exhausting DB indefinitely",async()=>{
 let count=0;
 const pages=await getSwingPricePagesWithTimeoutSplit<Row>(["A","B"],async()=>{
  count++;return {data:null,error:{code:"57014",message:"statement timeout"}};
 });
 assert.ok(count<=3);
 assert.ok(pages.some(p=>p.error?.code==="57014"));
});
test("structural errors do not retry or hide failure",async()=>{
 let count=0;
 const pages=await getSwingPricePagesWithTimeoutSplit<Row>(["A","B"],async()=>{
  count++;return {data:null,error:{code:"42P01",message:"relation missing"}};
 });
 assert.equal(count,1);
 assert.equal(pages[0].error?.code,"42P01");
});
test("rejects unsafe scan-size and duplicate asset identifiers",async()=>{
 const request=async(_:string[])=>({data:[] as Row[],error:null});
 await assert.rejects(()=>getSwingPricePagesWithTimeoutSplit(Array(251).fill("X"),request),/250-asset/);
 await assert.rejects(()=>getSwingPricePagesWithTimeoutSplit(["A","A"],request),/unique/);
});
