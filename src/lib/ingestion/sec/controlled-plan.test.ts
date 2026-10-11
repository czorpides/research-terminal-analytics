import assert from "node:assert/strict";
import test from "node:test";
import { planSecControlledWave, parseSecControlledMode } from "./controlled-plan.ts";
import { PILOT_SYMBOLS } from "./pilot-plan.ts";

const assets = PILOT_SYMBOLS.map((symbol,index) => ({
  id: String(index+1), symbol, exchange:"XNAS",currency:"USD",
}));
const id = (symbol:string) => assets.find(a=>a.symbol===symbol)!.id;
const periodMap = new Map<string,string[]>([
  [id("ADBE"), ["2025-11-28","2024-11-29","2023-12-01"]],
  [id("JPM"), ["2025-12-31"]],
  [id("META"), ["2025-12-31","2024-12-31"]],
  [id("LLY"), ["2025-12-31","2023-12-31","2022-12-31"]],
]);
const plan = (mode:"repair"|"expand",overrides:Partial<Parameters<typeof planSecControlledWave>[0]>={}) =>
  planSecControlledWave({mode,assets,periodsByAsset:periodMap,
    coolingAssetIds:new Set(),integrityBlockedAssetIds:new Set(),...overrides});

test("repair targets only real gaps, never completed or untouched firms, at most 2",()=>{
  const result=plan("repair");
  assert.deepEqual(result.candidates.map(x=>x.symbol),["JPM","LLY"]);
  assert.deepEqual(result.candidates.map(x=>x.existingYears),[1,3]);
  assert.equal(result.maxPerRun,2);
  assert.equal(result.incompleteHistory,3);
  assert.equal(result.alreadyCovered,1);
});
test("expansion targets unstarted firms only and has ten-issuer cap",()=>{
  const result=plan("expand");
  assert.equal(result.candidates.length,10);
  assert.equal(result.candidates.some(x=>["ADBE","JPM","META","LLY"].includes(x.symbol)),false);
  assert.equal(result.candidates.every(x=>x.existingYears===0),true);
  assert.equal(result.maxPerRequest,2);
});
test("explicit no-progress cooldown and integrity warning block selection",()=>{
  const result=plan("repair",{
    coolingAssetIds:new Set([id("JPM")]),
    integrityBlockedAssetIds:new Set([id("LLY")]),
  });
  assert.deepEqual(result.candidates.map(x=>x.symbol),["META"]);
  assert.equal(result.coolingDown,1);
  assert.equal(result.integrityBlocked,1);
});
test("invalid identifiers, ambiguous symbols, or unsupported listings cannot enter the plan",()=>{
  const extra=[...assets,{...assets[0]!,id:"ambiguous"}];
  const out=plan("expand",{assets:extra});
  assert.equal(out.candidates.some(x=>x.symbol==="ADBE"),false);
  const moved=assets.map(x=>x.symbol==="JPM"?{...x,exchange:"XOFF"}:x);
  assert.equal(plan("repair",{assets:moved}).candidates.some(x=>x.symbol==="JPM"),false);
});
test("rejected modes cannot silently revert to mass expansion",()=>{
  assert.equal(parseSecControlledMode("repair"),"repair");
  assert.equal(parseSecControlledMode("expand"),"expand");
  assert.throws(()=>parseSecControlledMode(undefined),/must be/);
  assert.throws(()=>parseSecControlledMode("all"),/must be/);
});
test("fully covered and cooling cohorts return no action safely",()=>{
  const covered = new Map(assets.map(a=>[a.id,["2025-12-31","2024-12-31","2023-12-31"]]));
  assert.equal(plan("repair",{periodsByAsset:covered}).status,"none_eligible");
  assert.equal(plan("expand",{periodsByAsset:covered}).status,"none_eligible");
});
