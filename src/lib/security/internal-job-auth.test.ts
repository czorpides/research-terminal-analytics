import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { authorizeInternalJobRequest } from "./internal-job-auth.server";

const previous = process.env.INTERNAL_JOB_TOKEN;
const secret = "testing-token-for-stage-only-not-a-production-secret-0123456789";
const request = (headers: Record<string, string>) =>
  new Request("https://staging.example.org/api/public/scores/run", { headers });

before(() => { process.env.INTERNAL_JOB_TOKEN = secret; });
after(() => {
  if (previous === undefined) delete process.env.INTERNAL_JOB_TOKEN;
  else process.env.INTERNAL_JOB_TOKEN = previous;
});

test("accepts only exact configured internal Bearer token", () => {
  assert.equal(authorizeInternalJobRequest(request({ authorization: `Bearer ${secret}` })), true);
  assert.equal(authorizeInternalJobRequest(request({ authorization: `Bearer ${secret}x` })), false);
  assert.equal(authorizeInternalJobRequest(request({ authorization: "Bearer wrong" })), false);
});
test("rejects public Supabase publishable key and missing credentials", () => {
  assert.equal(authorizeInternalJobRequest(request({ apikey: "sb_publishable_public" })), false);
  assert.equal(authorizeInternalJobRequest(request({ authorization: "Bearer sb_publishable_public" })), false);
  assert.equal(authorizeInternalJobRequest(request({})), false);
});
test("fails closed on empty or short secret", () => {
  process.env.INTERNAL_JOB_TOKEN = "short";
  assert.equal(authorizeInternalJobRequest(request({ authorization: "Bearer short" })), false);
  delete process.env.INTERNAL_JOB_TOKEN;
  assert.equal(authorizeInternalJobRequest(request({ authorization: `Bearer ${secret}` })), false);
  process.env.INTERNAL_JOB_TOKEN = secret;
});
