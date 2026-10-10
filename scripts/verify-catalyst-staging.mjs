import assert from "node:assert/strict";
import { chromium } from "playwright";

const base="https://research-terminal-web-staging.up.railway.app";
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1280,height:840}});
const report={};
try{
  const r=await page.goto(base+"/catalysts",{waitUntil:"domcontentloaded",timeout:40000});
  assert.equal(r?.status(),200);
  await page.getByRole("heading",{name:"What could materially change market expectations?"}).waitFor({timeout:20000});
  report.page="loaded";
  await page.getByText("Source connections",{exact:true}).waitFor({timeout:20000});
  report.sourceStatus=await page.getByText(/SEC EDGAR earnings filings:/).innerText();
  const body=await page.locator("body").innerText();
  assert.match(body,/Shadow research/);
  assert.match(body,/verified source events|Verified source events/i);
  report.emptyState=body.includes("Event infrastructure is ready");
  const untrusted=await page.request.post(base+"/api/public/catalysts/ingest-sec",{data:{symbols:["QCOM"]}});
  assert.equal(untrusted.status(),401,"SEC ingest must require job token even without UI sign-in");
  report.unauthorisedSecIngest=untrusted.status();
  const review=await page.request.post(base+"/api/public/catalysts/review",{data:{event_key:"test-event",decision:"verified",verification_note:"test note long enough"}});
  assert.equal(review.status(),401,"Verification must require independent reviewer token");
  report.unauthorisedVerification=review.status();
  const sidebar=page.getByRole("link",{name:"Swing Radar"}).first();
  await sidebar.click({timeout:10000});
  await page.waitForURL("**/swing-trades",{timeout:15000});
  await page.getByRole("link",{name:/Catalyst Intelligence.*verified event monitoring/}).waitFor({timeout:12000});
  report.linkFromSwing="passed";
  await page.getByRole("link",{name:/Catalyst Intelligence.*verified event monitoring/}).click();
  await page.waitForURL("**/catalysts",{timeout:15000});
  report.returnFromSwing="passed";
  console.log("CATALYST STAGING SMOKE",JSON.stringify(report));
}finally{await browser.close();}
