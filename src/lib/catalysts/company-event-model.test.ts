import assert from "node:assert/strict";
import { test } from "node:test";
import { assessCatalyst, summarizeAssetCatalysts, type CatalystEvidence } from "./company-event-model.ts";

const at = new Date("2026-10-09T12:00:00Z");
const sample: CatalystEvidence = {
  id: "test-event-id", asset_id: "test-asset", event_key: "official-sp500-test",
  event_type: "index_inclusion", headline: "Official index inclusion announcement",
  summary: "", direction: "positive", status: "verified",
  source_name: "Official index provider", source_url: "https://example.org/official",
  source_tier: "official", source_published_at: "2026-10-08T12:00:00Z",
  known_at: "2026-10-08T12:00:00Z", effective_at: "2026-10-20T12:00:00Z",
  expires_at: null, materiality: 75, novelty: 85, evidence_confidence: 90,
  evidence: {}, verified_at: "2026-10-08T13:00:00Z",
};
test("verified official inclusion has an auditable, bounded positive priority", () => {
  const value = assessCatalyst(sample, at);
  assert.equal(value.state, "active");
  assert.ok(value.priorityScore! > 60 && value.priorityScore! <= 100);
  assert.equal(value.downsideRiskScore, null);
});
test("candidate or rejected headlines receive no trading score", () => {
  for (const status of ["candidate","rejected"] as const) {
    const s=assessCatalyst({...sample,status}, at);
    assert.equal(s.priorityScore,null);
    assert.equal(s.state,"unverified");
  }
});
test("future publication cannot leak into a historical backtest", () => {
  const a = assessCatalyst(sample,new Date("2026-10-07T12:00:00Z"));
  assert.equal(a.priorityScore,null);
  assert.equal(a.state,"future");
});
test("old index news expires rather than contributing indefinitely", () => {
  const s=assessCatalyst(sample,new Date("2026-11-30T12:00:00Z"));
  assert.equal(s.state,"expired");
  assert.equal(s.priorityScore,null);
});
test("political statements remain tightly capped and decay rapidly", () => {
  const item={...sample,event_type:"political_statement" as const,source_tier:"social" as const};
  const a=assessCatalyst(item,at);
  assert.ok(a.confidence! <=35);
  assert.ok(a.priorityScore! <=35,"social political statements must not earn an 80-point bullish catalyst");
  assert.equal(assessCatalyst(item,new Date("2026-10-12T14:00:00Z")).priorityScore,null);
});
test("high projected EPS alone is not treated as a positive revision", () => {
  const event={...sample,event_type:"earnings_expectation" as const,evidence:{projected_eps:15}};
  assert.equal(assessCatalyst(event,at).state,"incomplete");
  assert.notEqual(assessCatalyst({...event,evidence:{eps_revision_pct:10}},at).priorityScore,null);
});
test("negative contract news produces downside risk, not a bullish score", () => {
  const event={...sample,event_type:"government_contract" as const,direction:"negative" as const};
  const a=assessCatalyst(event,at);
  assert.equal(a.priorityScore,null);
  assert.ok(a.downsideRiskScore!>0);
});
test("repeated articles with one event key cannot stack priority scores", () => {
  const s=summarizeAssetCatalysts([sample,{...sample,id:"repost"}],at);
  assert.equal(s.verifiedActive,1);
  assert.equal(s.priorityScore,assessCatalyst(sample,at).priorityScore);
});
test("missing materiality is unknown, not a neutral 50", () => {
  const a=assessCatalyst({...sample,materiality:null},at);
  assert.equal(a.priorityScore,null);
  assert.equal(a.state,"incomplete");
});
