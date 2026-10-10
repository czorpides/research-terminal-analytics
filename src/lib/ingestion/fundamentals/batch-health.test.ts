import assert from "node:assert/strict";
import test from "node:test";
import { summarizeFundamentalsBatch } from "./batch-health.ts";
test("never calls provider entitlement denial a successful ingest", () => {
  const s = summarizeFundamentalsBatch([{status:"skipped",rowsInserted:0,reason:"FMP key-metrics-ttm entitlement unavailable (HTTP 402)"}]);
  assert.equal(s.httpStatus,503);
  assert.equal(s.outcome,"blocked");
  assert.equal(s.rowsInserted,0);
});
test("treats a mixed partial ingestion as multi-status not a clean success", () => {
  const s = summarizeFundamentalsBatch([
    {status:"success",rowsInserted:14},
    {status:"skipped",rowsInserted:0,reason:"No FMP provider symbol"},
  ]);
  assert.equal(s.httpStatus,207);
  assert.equal(s.rowsInserted,14);
});
test("no candidates or no usable observations is never healthy", () => {
  assert.equal(summarizeFundamentalsBatch([]).httpStatus,424);
  assert.equal(summarizeFundamentalsBatch([{status:"skipped",rowsInserted:0,reason:"Quota exhausted"}]).httpStatus,424);
  assert.equal(summarizeFundamentalsBatch([{status:"success",rowsInserted:0}]).httpStatus,424);
});
test("honest success and honest failure", () => {
  assert.equal(summarizeFundamentalsBatch([{status:"success",rowsInserted:13}]).httpStatus,200);
  assert.equal(summarizeFundamentalsBatch([{status:"failed",rowsInserted:0,error:"upstream unavailable"}]).httpStatus,502);
});
