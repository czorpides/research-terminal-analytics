import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.STAGING_URL ?? "https://research-terminal-web-staging.up.railway.app";
const browser = await chromium.launch({ headless: true });
const failures = [];
const reports = [];
const paths = ["/", "/radar", "/screeners", "/security", "/undervaluation",
  "/overvaluation", "/data-health", "/macro", "/macro/growth", "/swing-trades"];
try {
  for (const path of paths) {
    const page = await browser.newPage({ viewport: { width: 1366, height: 860 } });
    try {
      const response = await page.goto(base + path, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.locator("main").first().waitFor({ timeout: 18000 });
      const body = await page.locator("body").innerText();
      const headings = await page.locator("h1,h2").allTextContents();
      const status = response?.status() ?? -1;
      const good = status === 200 &&
        !body.includes("Enter password") &&
        !body.includes("This page didn't load") &&
        !body.includes("Page not found") &&
        body.includes("Research Terminal");
      reports.push({ path, status, passed: good, headings: headings.slice(0, 4) });
      if (!good) failures.push(path + ": unexpected page/error/auth");
      if (path === "/radar") {
        await page.waitForTimeout(6000);
        const radarBody = await page.locator("body").innerText();
        const state = radarBody.includes("Opportunity Radar data is unavailable")
          ? "query-error-visible"
          : radarBody.includes("Loading Opportunity Radar")
            ? "loading" : "loaded";
        reports[reports.length - 1].radarState = state;
      }
    } catch (err) {
      failures.push(path + ": " + String(err));
      reports.push({ path, passed: false, error: String(err) });
    } finally {
      await page.close();
    }
  }
  // Prove the tabs remain usable in both directions even during slow data loads.
  const switching = await browser.newPage({ viewport: { width: 1366, height: 860 } });
  try {
    await switching.goto(base + "/radar", { waitUntil: "domcontentloaded", timeout: 45000 });
    const nav = switching.getByRole("navigation", { name: "Switch research radar" });
    await nav.getByRole("link", { name: "Swing Radar" }).click({ timeout: 10000 });
    await switching.waitForURL("**/swing-trades", { timeout: 12000 });
    await switching.getByRole("heading", { name: "Multi-strategy swing opportunities" }).waitFor({ timeout: 12000 });
    await nav.getByRole("link", { name: "Opportunity Radar" }).click({ timeout: 10000 });
    await switching.waitForURL("**/radar", { timeout: 12000 });
    await switching.getByRole("heading", { name: "One research queue. One company research screen." }).waitFor({ timeout: 12000 });
    reports.push({ path: "Radar tab round-trip", passed: true, from: "/radar", via: "/swing-trades", back: "/radar" });
  } catch (err) {
    failures.push("Radar tab round-trip: " + String(err));
    reports.push({ path: "Radar tab round-trip", passed: false, error: String(err) });
  } finally {
    await switching.close();
  }
  console.log(JSON.stringify(reports, null, 2));
  assert.equal(failures.length, 0, "Failed routes:\n" + failures.join("\n"));
} finally {
  await browser.close();
}
