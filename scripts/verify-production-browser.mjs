/**
 * Public production browser smoke. Does not sign in, mutate DB, or access secrets.
 * Detects failures missed by GET /auth returning HTTP 200.
 *
 * Usage: node scripts/verify-production-browser.mjs [base-url]
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";
const origin = (
  process.argv[2] || "https://research-terminal-analytics.lovable.app"
).replace(/\/$/, "");
const paths = ["/", "/auth", "/catalysts", "/swing-trades", "/radar"];
const browser = await chromium.launch({ headless: true });
let warningCount = 0;
try {
  for (const path of paths) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const resourceErrors = [];
    const jsErrors = [];
    let loadedJs = 0, loadedCss = 0;
    page.on("response", (response) => {
      const url = response.url();
      if (!url.startsWith(origin + "/")) return;
      const resourceType = response.request().resourceType();
      if (!["script", "stylesheet"].includes(resourceType)) return;
      if (response.status() >= 400) {
        resourceErrors.push({
          path: new URL(url).pathname.slice(0, 120),
          status: response.status(),
        });
      } else if (response.ok()) {
        if (resourceType === "script") loadedJs++;
        if (resourceType === "stylesheet") loadedCss++;
        const contentType = response.headers()["content-type"] || "";
        if (resourceType === "stylesheet" && !contentType.includes("text/css"))
          resourceErrors.push({ path: new URL(url).pathname, mime: contentType });
        if (resourceType === "script" &&
            !(contentType.includes("javascript") || contentType.includes("ecmascript")))
          resourceErrors.push({ path: new URL(url).pathname, mime: contentType });
      }
    });
    page.on("pageerror", (error) => jsErrors.push(String(error).slice(0, 180)));
    const response = await page.goto(origin + path, {
      waitUntil: "domcontentloaded",
      timeout: 40000,
    });
    assert.equal(response?.status(), 200, "Failed GET " + path);
    await page.locator('input[type="password"]').waitFor({
      state: "visible",
      timeout: 25000,
    });
    await page.waitForTimeout(750);
    const actualPath = new URL(page.url()).pathname;
    assert.equal(actualPath, "/auth", "Unauthenticated route must require login: " + path);
    assert.ok(
      await page.getByRole("heading", { name: "Enter password" }).isVisible(),
      "Password form not rendered: " + path,
    );
    assert.equal(
      await page.getByText("This page didn't load").count(),
      0,
      "Client render failed: " + path,
    );
    assert.ok(loadedJs > 0, "No JS assets loaded for " + path);
    assert.ok(loadedCss > 0, "No CSS assets loaded for " + path);
    assert.deepEqual(resourceErrors, [], "JS/CSS failures for " + path);

    // A known SSR/client mismatch may occur during protected-route redirects.
    // Report it without falsely declaring the authenticated UI tested.
    const knownRedirectWarning = /Minified React error #418/;
    const unexpected = jsErrors.filter((s) => !knownRedirectWarning.test(s));
    warningCount += jsErrors.length - unexpected.length;
    assert.deepEqual(unexpected, [], "Uncaught browser JS errors at " + path);
    console.log(JSON.stringify({
      route: path,
      rendered: true,
      redirectedTo: actualPath,
      jsAssets: loadedJs,
      cssAssets: loadedCss,
      knownRedirectHydrationWarnings: jsErrors.length - unexpected.length,
    }));
    await page.close();
  }
  if (warningCount) {
    console.warn(
      "Non-blocking known React hydration warning #418 appeared " +
      warningCount +
      " times during unauthenticated protected-route redirects. Track separately.",
    );
  }
  console.log(
    "Production public-browser check passed. Authenticated dashboard data awaits a separate owner-session test.",
  );
} finally {
  await browser.close();
}
