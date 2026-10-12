import assert from "node:assert/strict";
import test from "node:test";
import {eligibleAnnualScoreSourceIds,LEGACY_SCORED_ANNUAL_PROVIDER_CODES} from "./annual-score-source-policy.ts";
const fmp="8854ce79-2fd9-41e6-8c78-233f7196417e";
const sec="a0c2a1ad-ebce-4982-a5dd-9b1ff8b98a3e";
test("new SEC ingestion never becomes Piotroski / Magic Formula input merely by adding original 10-Ks",()=>{
  assert.deepEqual(eligibleAnnualScoreSourceIds([
    {id:sec,provider_code:"sec_edgar"},{id:fmp,provider_code:"fmp"},
    {id:sec,provider_code:"sec_edgar"},
  ]),[fmp]);
  assert.deepEqual(LEGACY_SCORED_ANNUAL_PROVIDER_CODES,["fmp"]);
});
test("unknown/new providers and malformed IDs never gain automatic scoring entitlement",()=>{
 assert.deepEqual(eligibleAnnualScoreSourceIds([
  {id:sec,provider_code:"sec_edgar"},{id:sec,provider_code:"other_vendor"},
  {id:"bad",provider_code:"fmp"},
 ]),[]);
});
