import assert from "node:assert/strict";
import { test } from "node:test";
import { cachedResearchWorkspace } from "./research-cache.server.ts";

test("concurrent loads share the same in-flight operation", async () => {
  let calls = 0;
  const loader = async () => { calls += 1; await new Promise(r => setTimeout(r, 5)); return { rows: 3000 }; };
  const [a, b] = await Promise.all([
    cachedResearchWorkspace("single-flight-test", loader),
    cachedResearchWorkspace("single-flight-test", loader),
  ]);
  assert.equal(calls, 1);
  assert.deepEqual(a, b);
  await cachedResearchWorkspace("single-flight-test", loader);
  assert.equal(calls, 1);
});

test("failed loads are never retained", async () => {
  let calls = 0;
  const loader = async () => { calls += 1; if (calls === 1) throw new Error("temporary"); return 42; };
  await assert.rejects(() => cachedResearchWorkspace("retry-on-failure-test", loader));
  assert.equal(await cachedResearchWorkspace("retry-on-failure-test", loader), 42);
  assert.equal(calls, 2);
});
