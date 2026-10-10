import assert from "node:assert/strict";
import test from "node:test";
import { extractBearerToken, isOwnerAuthEmail } from "./owner-bearer.ts";

test("rejects absence of a real Supabase JWT and public publishable-key impostors", () => {
  for (const input of [null, "", "Basic a.b.c", "Bearer ", "Bearer a.b",
    "Bearer sb_publishable_test", "Bearer a.b.c\nX-Test: injected"]) {
    assert.equal(extractBearerToken(input), null);
  }
});
test("parses a candidate JWT only; server must separately call Supabase Auth getUser", () => {
  assert.equal(extractBearerToken("Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig"),
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig");
});
test("only the actual configured owner is allowed after server-side JWT verification", () => {
  assert.equal(isOwnerAuthEmail("owner@research.local"), true);
  assert.equal(isOwnerAuthEmail("OWNER@RESEARCH.LOCAL"), true);
  assert.equal(isOwnerAuthEmail("notowner@research.local"), false);
  assert.equal(isOwnerAuthEmail("czorpides@gmail.com"), false);
  assert.equal(isOwnerAuthEmail(undefined), false);
});
