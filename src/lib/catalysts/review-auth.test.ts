import assert from "node:assert/strict";
import { test } from "node:test";
import { authorizeCatalystReviewRequest } from "./review-auth.server.ts";
const saved=process.env.CATALYST_REVIEW_TOKEN;
function attempt(token:string|undefined,provided:string|undefined):boolean {
  if(token===undefined)delete process.env.CATALYST_REVIEW_TOKEN;
  else process.env.CATALYST_REVIEW_TOKEN=token;
  return authorizeCatalystReviewRequest(new Request("https://localhost/",{
    headers:provided?{"authorization":"Bearer "+provided}:{},
  }));
}
test("separate reviewer authentication fails closed and compares complete token",()=>{
  const token="catalyst-review-key-that-is-at-least-32-bytes-long";
  try{
    assert.equal(attempt(undefined,token),false);
    assert.equal(attempt("short",token),false);
    assert.equal(attempt(token,undefined),false);
    assert.equal(attempt(token,token+"x"),false);
    assert.equal(attempt(token,token),true);
  }finally{
    if(saved===undefined)delete process.env.CATALYST_REVIEW_TOKEN;
    else process.env.CATALYST_REVIEW_TOKEN=saved;
  }
});
