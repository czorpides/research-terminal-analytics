import assert from "node:assert/strict";
import {test} from "node:test";
import {screenSP500Preflight,SP500_JULY_2026,SP500_METHODOLOGY_URL,
 type EvidenceFact,type SP500FactPacket} from "./sp500-preflight.ts";

const at=new Date("2026-10-09T12:00:00Z");
const observed="2026-10-08T12:00:00Z";
function evidence<T>(value:T):EvidenceFact<T>{
 return {value,sourceUrl:"https://www.sec.gov/Archives/edgar/data/example",
  sourceName:"Test dated official evidence",sourcePublishedAt:observed,observedAt:observed};
}
const fixture:SP500FactPacket={
 symbol:"EXAMPLE",methodologyReviewedAt:observed,methodologyVersion:"2026-07",
 currentMember:evidence(false),usDomicile:evidence(true),
 eligibleUsListing:evidence(true),eligibleSecurityType:evidence(true),
 companyMarketCapUsd:evidence(SP500_JULY_2026.companyMarketCapUsd),
 securityFloatMarketCapUsd:evidence(SP500_JULY_2026.securityFloatMarketCapUsd),
 investableWeightFactor:evidence(0.1),
 lastSixMonthlySharesTraded:evidence([250000,250000,250000,250000,250000,250000]),
 annualFloatAdjustedLiquidityRatio:evidence(0.75),
 gaapContinuingNetIncomeLatestQuarterUsd:evidence(1),
 gaapContinuingNetIncomeTrailingFourQuartersUsd:evidence(1),
};
test("all published July thresholds pass at boundary yet no inclusion probability",()=>{
 const a=screenSP500Preflight(fixture,at);
 assert.equal(a.state,"eligible_for_review");assert.equal(a.passed,11);
 assert.equal(a.probability,null);assert.equal(a.scoreAdjustment,0);
 assert.ok(a.criteria.every(x=>x.sourceUrl.startsWith("https://")));
});
test("constituent is excluded even with outstanding recent performance",()=>{
 const a=screenSP500Preflight({...fixture,currentMember:evidence(true)},at);
 assert.equal(a.state,"excluded");assert.deepEqual(a.failed,["not_current_member"]);
});
test("missing or stale membership is withheld rather than surfaced",()=>{
 assert.equal(screenSP500Preflight({...fixture,currentMember:null},at).state,"withheld");
 const stale=evidence(false);stale.observedAt="2026-08-01T00:00:00Z";
 assert.equal(screenSP500Preflight({...fixture,currentMember:stale},at).state,"withheld");
});
test("fresh verified nonmember with unknown financials is research, not eligible",()=>{
 const a=screenSP500Preflight({...fixture,gaapContinuingNetIncomeLatestQuarterUsd:null},at);
 assert.equal(a.state,"partial_research");assert.ok(a.missing.includes("gaap_latest_quarter"));
});
test("quarterly GAAP loss vetoes candidate despite positive four-quarter sum",()=>{
 const a=screenSP500Preflight({...fixture,gaapContinuingNetIncomeLatestQuarterUsd:evidence(-10)},at);
 assert.equal(a.state,"excluded");assert.ok(a.failed.includes("gaap_latest_quarter"));
});
test("each monthly volume must pass, not a six-month average",()=>{
 const volumes=[1,1200000,100000,900000,900000,900000];
 const a=screenSP500Preflight({...fixture,lastSixMonthlySharesTraded:evidence(volumes)},at);
 assert.equal(a.state,"excluded");assert.ok(a.failed.includes("monthly_share_volume"));
});
test("market cap uses current company USD not price momentum or stale methodology",()=>{
 const a=screenSP500Preflight({...fixture,companyMarketCapUsd:evidence(22_699_999_999)},at);
 assert.equal(a.state,"excluded");assert.ok(a.failed.includes("market_cap_threshold"));
 const noMethod=screenSP500Preflight({...fixture,methodologyReviewedAt:"2026-06-01T00:00:00Z"},at);
 assert.equal(noMethod.state,"withheld");assert.ok(noMethod.missing.includes("market_cap_threshold"));
});
test("a source from the future or HTTP source cannot provide eligibility evidence",()=>{
 const future={...evidence(false),observedAt:"2026-10-10T12:00:00Z"};
 assert.equal(screenSP500Preflight({...fixture,currentMember:future},at).state,"withheld");
 const insecure={...evidence(false),sourceUrl:"http://example.net"};
 assert.equal(screenSP500Preflight({...fixture,currentMember:insecure},at).state,"withheld");
});
test("S&P requires float-adjusted size and free float in addition to company size",()=>{
 assert.equal(screenSP500Preflight({...fixture,securityFloatMarketCapUsd:evidence(5_000_000_000)},at).state,"excluded");
 assert.equal(screenSP500Preflight({...fixture,investableWeightFactor:evidence(0.01)},at).state,"excluded");
});
test("only the official published methodology supplies the fixed July rules",()=>{
 assert.ok(SP500_METHODOLOGY_URL.includes("spglobal.com"));
});
