import assert from "node:assert/strict";
import { test } from "node:test";
import { ANTICIPATION_RULEBOOK, assessAnticipation, collapseAnticipation, compareEligibilityEvidence, type AnticipationHypothesis } from "./anticipatory-model.ts";

const date = "2026-10-08T12:00:00Z";
const t = new Date("2026-10-09T12:00:00Z");
const spec = ANTICIPATION_RULEBOOK.sp500_inclusion;
const criterion = (code: string, state: "pass"|"fail"|"unknown"="pass") =>
  ({code,state,observedAt:date,sourceUrl:spec.methodology,note:"Observed source evidence"});
const sample: AnticipationHypothesis = {
  id:"a",asset_id:"asset",hypothesis_key:"sp500:BE:2026q4",
  hypothesis_type:"sp500_inclusion",headline:"Possible future index addition",
  source_name:"Official methodology",source_url:spec.methodology,
  source_published_at:"2026-09-01T12:00:00Z",
  first_observed_at:date,last_reviewed_at:date,
  target_at:null,expires_at:null,status:"monitoring",
  verification_status:"verified",verified_at:date,
  criteria:spec.criteria.map(k=>criterion(k)),
};

test("all documented requirements unlock eligibility review, not a likelihood or trade bonus",()=>{
  const a=assessAnticipation(sample,t);
  assert.equal(a.state,"criteria_pass_review");
  assert.equal(a.probability,null);
  assert.equal(a.scoreAdjustment,0);
  assert.equal(a.passed,a.total);
  assert.match(a.explanation,/committee/i);
});
test("unreviewed hypotheses never become qualifying signals",()=>{
  const a=assessAnticipation({...sample,verification_status:"candidate",verified_at:null},t);
  assert.equal(a.state,"unverified");
  assert.equal(a.passed,0);
});
test("unknown membership and profitability must never silently become passing criteria",()=>{
  const hypothesis={...sample,criteria:sample.criteria.filter(c=>!["not_current_member","gaap_latest_quarter"].includes(c.code))};
  const a=assessAnticipation(hypothesis,t);
  assert.equal(a.state,"investigate");
  assert.deepEqual(a.missing,["not_current_member","gaap_latest_quarter"]);
  assert.equal(a.probability,null);
});
test("a verified disqualifier vetoes the anticipation",()=>{
  const criteria=sample.criteria.map(c=>c.code==="not_current_member"?criterion(c.code,"fail"):c);
  const a=assessAnticipation({...sample,criteria},t);
  assert.equal(a.state,"blocked");
  assert.deepEqual(a.failed,["not_current_member"]);
});
test("positive share-price performance alone cannot qualify an index candidate",()=>{
  const a=assessAnticipation({...sample,criteria:[criterion("market_cap_threshold")]},t);
  assert.equal(a.state,"insufficient");
  assert.equal(a.scoreAdjustment,0);
});
test("future observation is invisible to historical runs",()=>{
  const a=assessAnticipation(sample,new Date("2026-10-01T12:00:00Z"));
  assert.equal(a.state,"not_yet_known");
  assert.equal(a.passed,0);
});
test("a future requirement cannot leak in while current documents remain visible",()=>{
  const criteria=sample.criteria.map(c=>c.code==="gaap_latest_quarter"?{...c,observedAt:"2026-10-11T12:00:00Z"}:c);
  const a=assessAnticipation({...sample,criteria},t);
  assert.equal(a.state,"investigate");
  assert.ok(a.missing.includes("gaap_profitability"));
});
test("stale observations and passed action windows are never promoted",()=>{
  assert.equal(assessAnticipation(sample,new Date("2026-11-20T12:00:00Z")).state,"stale");
  assert.equal(assessAnticipation({...sample,target_at:"2026-10-01T00:00:00Z"},new Date("2026-10-30T12:00:00Z")).state,"expired");
});
test("unsupported/non-HTTPS evidence does not count",()=>{
  const criteria=sample.criteria.map(c=>c.code==="us_domicile"?{...c,sourceUrl:"http://example.org"}:c);
  assert.ok(assessAnticipation({...sample,criteria},t).missing.includes("us_domicile"));
});
test("source dates must be plausible and observable",()=>{
  assert.equal(assessAnticipation({...sample,source_published_at:"2026-10-12T12:00:00Z"},t).state,"insufficient");
});
test("realized and dismissed hypotheses do not remain live research watches",()=>{
  for(const status of ["realized","dismissed"] as const)
    assert.equal(assessAnticipation({...sample,status},t).state,"closed");
});
test("distinct sources with one hypothesis key do not stack signals",()=>{
  assert.equal(collapseAnticipation([sample,{...sample,id:"b"}],t).length,1);
});
test("Nasdaq has separate current rules and does not reuse S&P committee claim",()=>{
  const rules=ANTICIPATION_RULEBOOK.nasdaq100_reconstitution;
  assert.ok(rules.criteria.includes("rank_at_reference_date"));
  assert.ok(!(rules.criteria as readonly string[]).includes("gaap_profitability"));
  assert.match(rules.discretion,/rank alone/i);
});


test("two independently reviewed time-stamped snapshots reveal improving conditions, not event odds",()=>{
  const earlier={...sample,hypothesis_key:"sp500:BE:2026q3",first_observed_at:"2026-10-07T08:00:00Z",
    last_reviewed_at:"2026-10-07T08:00:00Z",verified_at:"2026-10-07T10:00:00Z",
    criteria:sample.criteria.map(c=>["gaap_latest_quarter","gaap_trailing_four_quarters"].includes(c.code)
      ?{...c,state:"unknown" as const,observedAt:"2026-10-07T08:00:00Z"}:c)};
  const later={...sample,hypothesis_key:"sp500:BE:2026q4",
    first_observed_at:"2026-10-08T12:00:00Z",
    last_reviewed_at:"2026-10-08T12:00:00Z",
    verified_at:"2026-10-08T18:00:00Z"};
  const progress=compareEligibilityEvidence(earlier,later,t);
  assert.ok(progress);
  assert.deepEqual(progress.newlySupported,["gaap_latest_quarter","gaap_trailing_four_quarters"]);
  assert.equal(progress.probability,null);
  assert.equal(progress.scoreAdjustment,0);
});
test("no progression without different source-backed independently verified revisions",()=>{
  const later={...sample,first_observed_at:"2026-10-09T09:00:00Z",
    last_reviewed_at:"2026-10-09T09:00:00Z",verified_at:"2026-10-09T10:00:00Z"};
  assert.equal(compareEligibilityEvidence(sample,later,t),null,"same immutable revision");
  assert.equal(compareEligibilityEvidence({...sample,hypothesis_key:"old-key",verification_status:"candidate"},later,t),null);
  assert.equal(compareEligibilityEvidence({...sample,hypothesis_key:"old-key",verified_at:"2026-10-11T00:00:00Z"},later,t),null);
});
