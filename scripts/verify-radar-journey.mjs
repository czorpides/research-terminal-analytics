import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = "https://research-terminal-web-staging.up.railway.app";
const browser = await chromium.launch({ headless: true });
const results = [];
const start = Date.now();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const elapsed = () => Math.round((Date.now() - start) / 1000);

async function checkRadar(path, label, otherLabel) {
  const loadStart = Date.now();
  const response = await page.goto(base + path, { waitUntil: "domcontentloaded", timeout: 35000 });
  await page.getByRole("navigation", { name: "Switch research radar" }).waitFor({ timeout: 20000 });
  const tabs = page.getByRole("navigation", { name: "Switch research radar" });
  assert.equal(await tabs.getByRole("link", { name: label }).getAttribute("aria-current"), "page");
  assert.ok(await tabs.getByRole("link", { name: otherLabel }).isVisible());
  const result = {
    path, status: response?.status(), shellMs: Date.now() - loadStart,
    dataState: "pending", dataMs: null,
  };
  assert.equal(result.status, 200);

  const loading = path === "/radar" ? "Loading Opportunity Radar research data" : "Loading Swing Radar opportunities";
  const unavailable = path === "/radar" ? "Opportunity Radar data is unavailable" : "Swing Radar data is unavailable";
  const deadline = Date.now() + 85000;
  while (Date.now() < deadline) {
    const body = await page.locator("body").innerText();
    if (body.includes(unavailable)) { result.dataState = "error"; break; }
    if (!body.includes(loading)) { result.dataState = "loaded"; break; }
    await page.waitForTimeout(2500);
  }
  if (result.dataState !== "pending") result.dataMs = Date.now() - loadStart;
  results.push(result);
  console.log(JSON.stringify({ elapsedSec: elapsed(), result }));
}

try {
  await checkRadar("/radar", "Opportunity Radar", "Swing Radar");
  const tabs = page.getByRole("navigation", { name: "Switch research radar" });
  await tabs.getByRole("link", { name: "Swing Radar" }).click({ timeout: 15000 });
  await page.waitForURL("**/swing-trades", { timeout: 20000 });
  results.push({ switch: "Opportunity -> Swing", ok: true, atSeconds: elapsed() });
  await checkRadar("/swing-trades", "Swing Radar", "Opportunity Radar");
  await page.getByRole("navigation", { name: "Switch research radar" }).getByRole("link", { name: "Opportunity Radar" }).click({ timeout: 15000 });
  await page.waitForURL("**/radar", { timeout: 20000 });
  results.push({ switch: "Swing -> Opportunity", ok: true, atSeconds: elapsed() });
  await page.getByRole("heading", { name: "One research queue. One company research screen." }).waitFor({ timeout: 12000 });
  console.log("RADAR JOURNEY RESULTS", JSON.stringify(results));
  assert.ok(results.find(r => r.path === "/radar").dataState === "loaded", "Opportunity Radar did not return data in 85s");
  assert.ok(results.find(r => r.path === "/swing-trades").dataState === "loaded", "Swing Radar did not return data in 85s");
} finally {
  await browser.close();
}
