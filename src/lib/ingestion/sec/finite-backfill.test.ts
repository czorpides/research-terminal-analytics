import test from "node:test";
import assert from "node:assert/strict";
import {PILOT_SYMBOLS} from "./pilot-plan.ts";
import {planSecControlledWave} from "./controlled-plan.ts";

const assets=PILOT_SYMBOLS.map((symbol,i)=>({
  symbol,id:"pilot-"+i,exchange:"XNAS",currency:"USD",
}));
const completed=new Map(assets.slice(0,51).map(a=>[
  a.id,["2025-12-31","2024-12-31","2023-12-31"]
]));
function pick(maxCandidates:10|100=10,overrides:Partial<Parameters<typeof planSecControlledWave>[0]>={}){
 return planSecControlledWave({
   mode:"expand",maxCandidates,
   assets,periodsByAsset:completed,coolingAssetIds:new Set(),
   integrityBlockedAssetIds:new Set(),...overrides,
 });
}
test("manual ten-name queue remains bounded and full pilot is finite",()=>{
 assert.equal(pick().candidates.length,10);
 const remaining=pick(100);
 assert.equal(remaining.candidates.length,49);
 assert.equal(remaining.maxPerRun,100);
 assert.equal(remaining.pilotSize,100);
 assert.equal(new Set(remaining.candidates.map(x=>x.assetId)).size,49);
 assert.equal(remaining.candidates.every(x=>x.existingYears===0),true);
});
test("partially ingested, cooling, structurally flagged and ambiguous identities are not auto-selected",()=>{
 const first=pickingFirst();
 const sources=new Map(completed);
 sources.set(first.id,["2025-12-31","2023-12-31"]);
 const cooldown=assets[52]!;
 const integrity=assets[53]!;
 const duplicate={...assets[54]!,id:"ambiguous-second-id"};
 const plan=pick(100,{
   assets:[...assets,duplicate],periodsByAsset:sources,
   coolingAssetIds:new Set([cooldown.id]),
   integrityBlockedAssetIds:new Set([integrity.id]),
 });
 const ids=new Set(plan.candidates.map(x=>x.assetId));
 assert.equal(ids.has(first.id),false);
 assert.equal(ids.has(cooldown.id),false);
 assert.equal(ids.has(integrity.id),false);
 assert.equal(ids.has(assets[54]!.id),false);
 assert.equal(ids.has(duplicate.id),false);
 assert.equal(plan.incompleteHistory,1);
 assert.equal(plan.coolingDown,1);
 assert.equal(plan.integrityBlocked,1);
});
function pickingFirst(){return assets[51]!}
test("repair mode cannot be widened by a backfill override",()=>{
 const periods=new Map(completed);
 for(const a of assets.slice(51,60))periods.set(a.id,["2025-12-31"]);
 const plan=planSecControlledWave({
   mode:"repair",maxCandidates:100,assets,periodsByAsset:periods,
   coolingAssetIds:new Set(),integrityBlockedAssetIds:new Set(),
 });
 assert.equal(plan.candidates.length,2);
 assert.equal(plan.maxPerRun,2);
});
test("when all eligible names are covered no additional provider work can be approved",()=>{
 const periods=new Map(assets.map(a=>[a.id,["2025-12-31","2024-12-31","2023-12-31"]]));
 const plan=pick(100,{periodsByAsset:periods});
 assert.deepEqual(plan.candidates,[]);
 assert.equal(plan.status,"none_eligible");
});
