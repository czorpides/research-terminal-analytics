import assert from "node:assert/strict";
import test from "node:test";
import { summarizeSecLedgerIntegrity } from "./quality-summary.ts";

test("no structural flags still stops short of certifying financial correctness", () => {
  assert.deepEqual(summarizeSecLedgerIntegrity({
    checked_filings: 3, invalid_metadata_filings: 0, empty_filings: 0,
    duplicate_metrics: 0, inconsistent_fact_rows: 0,
  }), { issues: 0, status: "no_structural_flags" });
});
test("counts independently detected integrity defects", () => {
  assert.deepEqual(summarizeSecLedgerIntegrity({
    checked_filings: 3, invalid_metadata_filings: 1, empty_filings: 1,
    duplicate_metrics: 2, inconsistent_fact_rows: 3,
  }), { issues: 7, status: "review" });
});
test("unknown, malformed, or missing audit input never reports a clean result", () => {
  assert.equal(summarizeSecLedgerIntegrity(undefined).status, "unavailable");
  assert.equal(summarizeSecLedgerIntegrity({
    checked_filings: 0, invalid_metadata_filings: 0, empty_filings: 0,
    duplicate_metrics: 0, inconsistent_fact_rows: 0,
  }).status, "unavailable");
  assert.equal(summarizeSecLedgerIntegrity({
    checked_filings: 3, invalid_metadata_filings: null, empty_filings: 0,
    duplicate_metrics: 0, inconsistent_fact_rows: 0,
  }).status, "unavailable");
});
