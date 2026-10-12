import test from "node:test";
import assert from "node:assert/strict";
import {
 buildSwingOpportunityGapAudit,SWING_GAP_WATCHLIST,SWING_GAP_AUDIT_VERSION,
 type SwingGapAuditAsset,type SwingGapAuditEvaluation,
} from "./opportunity-gap-audit.ts";

const a=(symbol:string,screen=true):SwingGapAuditAsset=>({
 assetId:"ID-"+symbol,symbol,name:"Test company "+symbol,hasBroadEvidence:screen,
 technicalScreenAsOf:"2026-10-10",
});
const evaluated=(score:number|null,entry="developing",bars=120):SwingGapAuditEvaluation=>({
 usableBars:bars,modelComputed:score!==null,modelScore:score,
 setupLabel:score===null?null:"Catalyst Repricing",
 entryState:score===null?null:entry,
 reasons:score===null?[]:["Source-reviewed technical reversal geometry"],
 risks:score===null?[]:["Waiting for verified scheduled results"],
});
const make=(asset:SwingGapAuditAsset|undefined,selected=false,e?:SwingGapAuditEvaluation,
 surfaced=false,other:SwingGapAuditAsset[]=[])=>{
 const list=asset?[asset,...other]:other;
 return buildSwingOpportunityGapAudit({
  assets:list,asOf:"2026-10-12T12:00:00Z",selectedAssetIds:selected&&asset?new Set([asset.assetId]):new Set(),
  evaluations:e&&asset?new Map([[asset.assetId,e]]):new Map(),
  shortlistedAssetIds:surfaced&&asset?new Set([asset.assetId]):new Set(),
 });
};
const stage=(symbol:string,rows:ReturnType<typeof make>)=>
 rows.find(x=>x.watchSymbol===symbol)!;
test("preselection and source coverage explain missing AAOI before score calculation",()=>{
 const missing=stage("AAOI",make(undefined));
 assert.equal(missing.stage,"missing_managed_universe");
 assert.equal(missing.shadowSetupScore,null);
 assert.equal(missing.screenQualityConclusion,"not_assessable");
 const noScreen=stage("AAOI",make(a("AAOI",false)));
 assert.equal(noScreen.stage,"missing_broad_evidence");
 assert.match(noScreen.progress,/not.*weak/i);
 const noSelect=stage("AAOI",make(a("AAOI"),false));
 assert.equal(noSelect.stage,"not_nominated_for_deep_scan");
 assert.equal(noSelect.shadowSetupScore,null);
 assert.match(noSelect.progress,/discovery.*gap/i);
});
test("price history insufficient and no pattern are not falsely called a low score",()=>{
 const prices=stage("INTC",make(a("INTC"),true,evaluated(null,"developing",44)));
 assert.equal(prices.stage,"insufficient_price_history");
 assert.equal(prices.usableBars,44);
 const noPattern=stage("INTC",make(a("INTC"),true,evaluated(null,"developing",50)));
 assert.equal(noPattern.stage,"deep_scan_no_valid_setup");
 assert.equal(noPattern.shadowSetupScore,null);
 const missingBars=stage("INTC",make(a("INTC"),true));
 assert.equal(missingBars.stage,"insufficient_price_history");
});
test("sub-42 model score, invalidated, capacity and actually surfaced are separate bottlenecks",()=>{
 const weak=stage("NBIS",make(a("NBIS"),true,evaluated(41.9)));
 assert.equal(weak.stage,"model_below_surfacing_floor");
 assert.equal(weak.shadowSetupScore,41.9);
 assert.equal(weak.screenQualityConclusion,"setup_observed");
 assert.match(weak.progress,/not the legacy Radar score/i);
 const invalid=stage("NBIS",make(a("NBIS"),true,evaluated(65,"invalidated")));
 assert.equal(invalid.stage,"model_invalidated");
 const capacity=stage("NBIS",make(a("NBIS"),true,evaluated(55.9)));
 assert.equal(capacity.stage,"shortlist_capacity");
 assert.equal(capacity.shadowSetupScore,55.9);
 const surfaced=stage("NBIS",make(a("NBIS"),true,evaluated(55.9),true));
 assert.equal(surfaced.stage,"surfaced");
 assert.equal(surfaced.shadowSetupScore,55.9);
 assert.equal(surfaced.shadowSetupName,"Catalyst Repricing");
 assert.deepEqual(surfaced.observedReasons,["Source-reviewed technical reversal geometry"]);
 assert.equal(surfaced.changesScores,false);
 assert.equal(surfaced.eligibleForTradeExecution,false);
 assert.equal(surfaced.source,SWING_GAP_AUDIT_VERSION);
});
test("EOS.AX does NOT resolve EOS US; no fake cross-listing mapping, no duplicate asset identity",()=>{
 const notMatched=stage("EOS.AX",make(a("EOS")));
 assert.equal(notMatched.stage,"missing_managed_universe");
 assert.equal(notMatched.resolvedAssetId,null);
 const trueMatch=stage("EOS.AX",make(a("EOS.AX"),true,evaluated(64),true));
 assert.equal(trueMatch.stage,"surfaced");
 assert.equal(trueMatch.resolvedSymbol,"EOS.AX");
 const duplicate=stage("EOS.AX",make(a("EOS.AX"),true,evaluated(64),true,[
  {assetId:"ANOTHER-ID",symbol:"EOS.AX",name:"Ambiguous",hasBroadEvidence:true,technicalScreenAsOf:"2026-10-10"},
 ]));
 assert.equal(duplicate.stage,"ambiguous_symbol");
 assert.equal(duplicate.resolvedAssetId,null);
});
test("a watched stock is observational only, never forced into nomination, surfaced shortlist or rank",()=>{
 const all=[a("AAOI"),a("INTC"),a("NBIS"),a("EOS.AX"),a("PENG"),a("BE")];
 const before=structuredClone(all);
 const selected=new Set(["ID-AAOI","ID-INTC"]);
 const observed=buildSwingOpportunityGapAudit({
  assets:all,asOf:"2026-10-12T12:00:00Z",selectedAssetIds:selected,
  evaluations:new Map([["ID-AAOI",evaluated(83)],["ID-INTC",evaluated(38)]]),
  shortlistedAssetIds:new Set(["ID-AAOI"]),
 });
 assert.equal(observed.length,SWING_GAP_WATCHLIST.length);
 assert.deepEqual(all,before);
 assert.deepEqual([...selected],["ID-AAOI","ID-INTC"]);
 assert.equal(observed.filter(x=>x.changesScores||x.eligibleForTradeExecution).length,0);
 assert.throws(()=>buildSwingOpportunityGapAudit({
  assets:all,asOf:"2026-10-12T12:00:00Z",selectedAssetIds:selected,evaluations:new Map(),
  shortlistedAssetIds:new Set(),watchlist:["AAOI","AAOI"],
 }),/Unsupported or duplicated/);
 assert.throws(()=>buildSwingOpportunityGapAudit({
  assets:all,asOf:"2026-10-12T12:00:00Z",selectedAssetIds:selected,evaluations:new Map(),
  shortlistedAssetIds:new Set(),watchlist:["ZZZZ" as never],
 }),/Unsupported or duplicated/);
});
test("non-finite or out-of-range setup scores are rejected instead of shown as valid evidence",()=>{
 for(const invalid of [-1,101,NaN,Infinity]){
  assert.throws(()=>make(a("AAOI"),true,evaluated(invalid),true),/Invalid swing raw setup score/);
 }
});

test("live Aug 7 technical screen observation is stale at Oct 12, not current evidence",()=>{
 const old={...a("AAOI"),technicalScreenAsOf:"2026-08-07"};
 const r=stage("AAOI",make(old,false));
 assert.equal(r.stage,"not_nominated_for_deep_scan");
 assert.equal(r.technicalScreenAsOf,"2026-08-07");
 assert.equal(r.technicalScreenStale,true);
 assert.match(r.progress,/stale/i);
 const current=stage("AAOI",make(a("AAOI"),true,evaluated(60),true));
 assert.equal(current.technicalScreenStale,false);
 assert.equal(current.stage,"surfaced");
 const unknown=stage("AAOI",make({...a("AAOI"),technicalScreenAsOf:null},false));
 assert.equal(unknown.technicalScreenStale,null);
});
