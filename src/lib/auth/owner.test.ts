import assert from "node:assert/strict";
import { test } from "node:test";
import { isConfiguredOwnerPassword } from "./owner.server.ts";

const strong = "this-is-only-a-nonproduction-unit-test-password-042";

test("owner bootstrap requires exact long server-side password", () => {
  assert.equal(isConfiguredOwnerPassword(strong, strong), true);
  assert.equal(isConfiguredOwnerPassword(strong + "x", strong), false);
  assert.equal(isConfiguredOwnerPassword(strong.slice(0,-1), strong), false);
  assert.equal(isConfiguredOwnerPassword("", strong), false);
  assert.equal(isConfiguredOwnerPassword(42, strong), false);
});
test("owner bootstrap fails closed without a strong configured password", () => {
  assert.equal(isConfiguredOwnerPassword("short", "short"), false);
  assert.equal(isConfiguredOwnerPassword(strong, undefined), false);
  assert.equal(isConfiguredOwnerPassword({}, strong), false);
});
