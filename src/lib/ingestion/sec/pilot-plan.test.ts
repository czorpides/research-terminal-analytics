import assert from "node:assert/strict";
import test from "node:test";
import { pickSecPilotCandidates, PILOT_SYMBOLS, type SecPilotAsset } from "./pilot-plan.ts";

const values: SecPilotAsset[] = PILOT_SYMBOLS.map((symbol, index) => ({
  symbol, id: String(index + 1), exchange: "XNAS", currency: "USD",
}));
test("caps every pilot at ten companies with stable issuer identities", () => {
  assert.equal(PILOT_SYMBOLS.length,100);
  assert.equal(new Set(PILOT_SYMBOLS).size,100);
  const chosen = pickSecPilotCandidates(values, [], 10);
  assert.equal(chosen.length, 10);
  assert.deepEqual(chosen.map(c => c.symbol), PILOT_SYMBOLS.slice(0, 10));
});
test("skips already ingested and resumes an interrupted pilot without duplication", () => {
  const previous = pickSecPilotCandidates(values, [], 10);
  const next = pickSecPilotCandidates(values, previous.map(c => c.assetId), 10);
  assert.equal(next.length,10);
  assert.deepEqual(next.map(c => c.symbol), PILOT_SYMBOLS.slice(10,20));
  assert.deepEqual(pickSecPilotCandidates(values, values.map(x => x.id)), []);
});
test("refuses ambiguous symbols, unsupported exchanges and non-USD issuers", () => {
  const altered = [
    ...values,
    { ...values[0], id: "duplicate" },
  ];
  altered[1] = { ...altered[1], currency: "EUR" };
  altered[2] = { ...altered[2], exchange: "XOFF" };
  const result = pickSecPilotCandidates(altered, [], 10);
  assert.equal(result.some(c => ["ADBE", "AMZN", "COST"].includes(c.symbol)), false);
});
test("never accepts pilot size above the approved ten-company ceiling", () => {
  assert.throws(() => pickSecPilotCandidates(values, [], 11), /between one and ten/);
  assert.throws(() => pickSecPilotCandidates(values, [], 0), /between one and ten/);
});
