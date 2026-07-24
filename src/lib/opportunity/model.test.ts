import assert from "node:assert/strict";
import test from "node:test";

import {
  computePriceDislocation,
  missingSignal,
  scoreOpportunityHorizon,
  type OpportunityEvidence,
  type OpportunitySignalKey,
  type SignalStatus,
} from "./model.ts";

function signal(
  key: OpportunitySignalKey,
  value: number,
  status: SignalStatus = "observed",
): NonNullable<OpportunityEvidence[OpportunitySignalKey]> {
  return {
    key,
    label: key,
    value,
    confidence: 90,
    status,
    detail: "test fixture",
  };
}

test("classifies a high-confidence intact dislocation as a broken stock", () => {
  const evidence: OpportunityEvidence = {
    priceDislocation: signal("priceDislocation", 88),
    fundamentalResilience: signal("fundamentalResilience", 82),
    valuationCompression: signal("valuationCompression", 80),
    temporaryEvidence: signal("temporaryEvidence", 76),
    recoveryConfirmation: signal("recoveryConfirmation", 66),
    ownershipEvidence: signal("ownershipEvidence", 70),
    idiosyncrasy: signal("idiosyncrasy", 78),
    impairmentRisk: signal("impairmentRisk", 18),
  };
  const result = scoreOpportunityHorizon("one_to_three", evidence);

  assert.equal(result.classification, "broken_stock");
  assert.equal(result.productionEligible, true);
  assert.equal(result.modelState, "eligible");
  assert.ok(result.score >= 75);
  assert.ok(result.researchPriority > 55);
});

test("scores isolated price damage more highly than a broad sector fall", () => {
  const isolated = computePriceDislocation({
    return12m: -0.35,
    drawdown: -0.42,
    peerMedianReturn: 0.02,
    sectorBreadth: 0.15,
  });
  const sectorWide = computePriceDislocation({
    return12m: -0.25,
    drawdown: -0.3,
    peerMedianReturn: -0.23,
    sectorBreadth: 0.85,
  });

  assert.ok((isolated.priceDislocation ?? 0) > 80);
  assert.ok((isolated.absolutePriceDamage ?? 0) > 70);
  assert.ok((isolated.idiosyncrasy ?? 0) > 80);
  assert.ok((sectorWide.idiosyncrasy ?? 100) < 20);
  assert.ok((sectorWide.priceDislocation ?? 100) < 25);
  assert.ok((sectorWide.absolutePriceDamage ?? 0) >= 50);
});

test("can measure drawdown while refusing to invent a company-specific return", () => {
  const result = computePriceDislocation({
    return12m: null,
    drawdown: -0.35,
    peerMedianReturn: null,
    sectorBreadth: null,
  });

  assert.ok((result.priceDislocation ?? 0) > 50);
  assert.equal(result.residualReturn, null);
  assert.equal(result.idiosyncrasy, null);
});

test("does not let cheapness hide permanent impairment", () => {
  const evidence: OpportunityEvidence = {
    priceDislocation: signal("priceDislocation", 90),
    fundamentalResilience: signal("fundamentalResilience", 22),
    valuationCompression: signal("valuationCompression", 92),
    temporaryEvidence: signal("temporaryEvidence", 20),
    recoveryConfirmation: signal("recoveryConfirmation", 30),
    ownershipEvidence: signal("ownershipEvidence", 35),
    idiosyncrasy: signal("idiosyncrasy", 80),
    impairmentRisk: signal("impairmentRisk", 78),
  };
  const result = scoreOpportunityHorizon("one_to_three", evidence);

  assert.equal(result.classification, "possible_value_trap");
  assert.equal(result.productionEligible, false);
  assert.ok(result.researchPriority < result.score);
});

test("separates a sector washout from company-specific damage", () => {
  const evidence: OpportunityEvidence = {
    priceDislocation: signal("priceDislocation", 72),
    fundamentalResilience: signal("fundamentalResilience", 78),
    valuationCompression: signal("valuationCompression", 74),
    temporaryEvidence: signal("temporaryEvidence", 65),
    recoveryConfirmation: signal("recoveryConfirmation", 55),
    ownershipEvidence: signal("ownershipEvidence", 60),
    idiosyncrasy: signal("idiosyncrasy", 28),
    impairmentRisk: signal("impairmentRisk", 22),
  };
  const result = scoreOpportunityHorizon("one_to_three", evidence);

  assert.equal(result.classification, "sector_washout");
  assert.equal(result.productionEligible, false);
});

test("caps confidence when critical evidence is only a proxy or missing", () => {
  const evidence: OpportunityEvidence = {
    priceDislocation: signal("priceDislocation", 80, "proxy"),
    fundamentalResilience: signal("fundamentalResilience", 75, "proxy"),
    valuationCompression: signal("valuationCompression", 76, "proxy"),
    temporaryEvidence: missingSignal("temporaryEvidence", "No estimate revisions."),
    recoveryConfirmation: signal("recoveryConfirmation", 60),
    ownershipEvidence: missingSignal("ownershipEvidence", "No ownership feed."),
    idiosyncrasy: signal("idiosyncrasy", 70, "proxy"),
    impairmentRisk: signal("impairmentRisk", 25, "proxy"),
  };
  const result = scoreOpportunityHorizon("one_to_three", evidence);

  assert.ok(result.dataConfidence <= 69);
  assert.equal(result.productionEligible, false);
  assert.equal(result.modelState, "shadow");
  assert.ok(result.blockedReasons.some((reason) => reason.includes("not available")));
});

test("keeps the 5–10 year output experimental even with complete evidence", () => {
  const evidence: OpportunityEvidence = {
    businessQuality: signal("businessQuality", 82),
    reinvestmentRunway: signal("reinvestmentRunway", 84),
    balanceSheetDurability: signal("balanceSheetDurability", 78),
    industryDurability: signal("industryDurability", 75),
    capitalAllocation: signal("capitalAllocation", 80),
    entryValuation: signal("entryValuation", 65),
    impairmentRisk: signal("impairmentRisk", 18),
    idiosyncrasy: signal("idiosyncrasy", 55),
  };
  const result = scoreOpportunityHorizon("five_to_ten", evidence);

  assert.equal(result.classification, "quality_profile");
  assert.equal(result.experimental, true);
  assert.equal(result.modelState, "experimental");
  assert.equal(result.productionEligible, false);
});
