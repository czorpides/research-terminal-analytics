import assert from "node:assert/strict";
import test from "node:test";
import { forceManualRedirect, requireNonRedirectResponse } from "./edge-safe-redirect.ts";

test("Cloudflare-compatible fetch forbids automatic credential forwarding", () => {
  const result = forceManualRedirect({ method: "GET", redirect: "follow" });
  assert.equal(result.redirect, "manual");
  assert.equal(result.method, "GET");
  // "error" is unsupported on Cloudflare's Workers runtime.
  assert.notEqual(result.redirect, "error");
});
test("SEC and EODHD redirects are refused, without reflecting target URL or tokens", () => {
  for (const provider of ["SEC EDGAR", "EODHD"] as const) {
    for (const code of [301, 302, 303, 307, 308]) {
      const response = new Response(null, {
        status: code,
        headers: { location: "https://attacker.example/?api_token=private" },
      });
      assert.throws(
        () => requireNonRedirectResponse(response, provider),
        (e: unknown) =>
          e instanceof Error &&
          /redirect refused/.test(e.message) &&
          !e.message.includes("attacker.example") &&
          !e.message.includes("private"),
      );
    }
    assert.throws(
      () => requireNonRedirectResponse({ status: 0, type: "opaqueredirect" }, provider),
      /redirect refused/,
    );
  }
});
test("legitimate 200 or genuine HTTP provider errors stay available for normal handling", () => {
  for (const status of [200, 204, 401, 402, 403, 429, 500]) {
    assert.doesNotThrow(() => requireNonRedirectResponse(
      { status, type: "basic" }, "SEC EDGAR",
    ));
  }
});
