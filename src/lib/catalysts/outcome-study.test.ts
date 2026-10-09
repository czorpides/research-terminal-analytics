import assert from "node:assert/strict";
import {test} from "node:test";
import {ANTICIPATION_RULEBOOK,type AnticipationHypothesis} from "./anticipatory-model.ts";
import {validateAnticipatoryHistory,type HistoricalCatalystCase} from "./outcome-study.ts";

const rule=ANTICIPATION_RULEBOOK.sp500_inclusion;
const August="2026-08-20T12:00:00Z",Cutoff="2026-09-01T12:00:00Z";
const study=new Date("2026-10-09T12:00:00Z");
const fact=(code:string)=>({code,state:"pass" as const,observedAt:August,
  sourceUrl:rule.methodology,note:"Dated source observation for unit test"});
function snapshot(asset:string,id=asset,verifiedAt=August):AnticipationHypothesis{
 return {id,asset_id:asset,hypothesis_key:"sp500:"+asset+":2026q3",
   hypothesis_type:"sp500_inclusion",headline:"Historical test eligibility",
   source_name:"Official methodology",source_url:rule.methodology,
   source_published_at:"2026-07-01T00:00:00Z",
   first_observed_at:August,last_reviewed_at:August,
   target_at:null,expires_at:null,status:"monitoring",verification_status:"verified",
   verified_at:verifiedAt,criteria:rule.criteria.map(fact)};
}
function caseRow(asset:string,outcome:HistoricalCatalystCase["outcome"],
 confirmedAt="2026-09-04T23:59:59Z"):HistoricalCatalystCase{
 return {caseId:asset,assetId:asset,symbol:asset,hypothesisType:"sp500_inclusion",
  evaluationAt:Cutoff,outcome,outcomeObservedAt:confirmedAt,
  outcomeSourceUrl:"https://press.spglobal.com/2026-09-04-test",
  completeMembershipEvidence:true};
}
test("known additions and complete member-census nonadditions calculate explicit observational metrics",()=>{
 const report=validateAnticipatoryHistory([
   caseRow("positive","announced_addition"),
   caseRow("negative","not_added_complete_membership","2026-10-01T12:00:00Z"),
   caseRow("missed","announced_addition"),
 ],[snapshot("positive"),snapshot("negative")],study);
 assert.equal(report.labelled,3);
 assert.equal(report.truePositives,1);assert.equal(report.falsePositives,1);
 assert.equal(report.falseNegatives,1);assert.equal(report.trueNegatives,0);
 assert.equal(report.precision,0.5);assert.equal(report.recall,0.5);
 assert.equal(report.coverage,1);
});
test("announced stock added after cutoff but original snapshot verified only later is not a historical alert",()=>{
 const item=snapshot("late","late","2026-09-05T12:00:00Z");
 const r=validateAnticipatoryHistory([caseRow("late","announced_addition")],[item],study);
 assert.equal(r.caseResults[0].eligibleSignal,false);
 assert.equal(r.caseResults[0].priorSnapshotId,null);
 assert.equal(r.falseNegatives,1);
});
test("an absence in an incomplete press list is not negative ground truth",()=>{
 const item=caseRow("control","not_added_complete_membership");
 item.completeMembershipEvidence=false;
 const r=validateAnticipatoryHistory([item],[snapshot("control")],study);
 assert.equal(r.labelled,0);assert.equal(r.precision,null);
 assert.equal(r.excludedUnresolved,1);
});
test("outcome observed before research cutoff is invalid label, not a hit",()=>{
 const item=caseRow("early","announced_addition","2026-08-31T12:00:00Z");
 const r=validateAnticipatoryHistory([item],[snapshot("early")],study);
 assert.equal(r.labelled,0);assert.equal(r.truePositives,0);
});
test("unpublished or non-HTTPS outcomes cannot be included",()=>{
 const item=caseRow("no-url","announced_addition");
 item.outcomeSourceUrl="http://example.org/claim";
 assert.equal(validateAnticipatoryHistory([item],[snapshot("no-url")],study).labelled,0);
});
test("future outcomes and incomplete datasets cannot silently generate accuracy estimates",()=>{
 const item=caseRow("future","announced_addition","2026-10-20T12:00:00Z");
 const r=validateAnticipatoryHistory([item],[snapshot("future")],study);
 assert.equal(r.precision,null);assert.equal(r.recall,null);assert.equal(r.labelled,0);
});
test("future observational snapshots never leak despite earlier publication dates",()=>{
 const item=snapshot("retro");
 item.first_observed_at="2026-09-20T12:00:00Z";
 item.last_reviewed_at="2026-09-20T12:00:00Z";
 item.verified_at="2026-09-20T12:00:00Z";
 assert.equal(validateAnticipatoryHistory([caseRow("retro","announced_addition")],[item],study).eligibleSignals,0);
});
test("duplicate case IDs throw rather than double-count false positives",()=>{
 const item=caseRow("dup","announced_addition");
 assert.throws(()=>validateAnticipatoryHistory([item,item],[],study),/Repeated historical case/);
});
test("zero empirical cases are reported as missing, not 50 percent or 100 percent",()=>{
 const r=validateAnticipatoryHistory([],[],study);
 assert.equal(r.precision,null);assert.equal(r.recall,null);assert.equal(r.coverage,0);
});
