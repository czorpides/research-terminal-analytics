import test from "node:test";
import assert from "node:assert/strict";
import {authorizedInternalSwingJob} from "./internal-job-auth.ts";

const secret="generated-internal-job-auth-token-at-least-32-characters";
const headers=(values:Record<string,string>={})=>new Headers(values);

test("privileged ingestion rejects missing secret regardless of request headers",()=>{
 assert.equal(authorizedInternalSwingJob(headers({"x-internal-job-token":secret}),undefined),false);
 assert.equal(authorizedInternalSwingJob(headers({"x-internal-job-token":secret}),"short"),false);
});
test("publishable/anon apikey can NEVER authorize ingestion",()=>{
 assert.equal(authorizedInternalSwingJob(headers({apikey:secret}),secret),false);
 assert.equal(authorizedInternalSwingJob(headers({"authorization":"Basic "+secret}),secret),false);
});
test("valid private bearer and custom header pass without requiring public API key",()=>{
 assert.equal(authorizedInternalSwingJob(headers({"x-internal-job-token":secret}),secret),true);
 assert.equal(authorizedInternalSwingJob(headers({authorization:"Bearer "+secret}),secret),true);
});
test("different, short and oversized tokens fail closed",()=>{
 assert.equal(authorizedInternalSwingJob(headers({"x-internal-job-token":secret+"x"}),secret),false);
 assert.equal(authorizedInternalSwingJob(headers({"x-internal-job-token":"short"}),secret),false);
 assert.equal(authorizedInternalSwingJob(headers({"x-internal-job-token":"x".repeat(4097)}),secret),false);
});
test("private token takes precedence if both credential headers are present",()=>{
 assert.equal(authorizedInternalSwingJob(headers({
  "x-internal-job-token":"wrong-but-long-enough-to-be-valid-form",
  authorization:"Bearer "+secret,
 }),secret),false);
});
