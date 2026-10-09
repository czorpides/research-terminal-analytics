import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSPIndexAnnouncementFeed,fetchSPIndexAnnouncementFeed,SP_DJI_INDEX_FEED } from "./sp-index-feed.server.ts";
const now=new Date("2026-10-09T11:00:00Z");
const item=(title:string,link="https://press.spglobal.com/example-index-announcement",pubDate="Thu, 01 Oct 2026 18:00:00 GMT")=>
 `<item><title><![CDATA[${title}]]></title><link>${link}</link><pubDate>${pubDate}</pubDate></item>`;
test("official constituent index additions enter unreviewed triage, never auto-scoring",()=>{
 const feed=`<?xml version="1.0"?><rss><channel>${item("Vylor Added to the S&amp;P 500; Twilio Set to Join S&amp;P 500")}</channel></rss>`;
 const {documents}=parseSPIndexAnnouncementFeed(feed,now);
 assert.equal(documents.length,1);
 const d=documents[0];
 assert.equal(d.status,"unmapped");
 assert.equal(d.first_known_at,now.toISOString());
 assert.equal(d.source_published_at,"2026-10-01T18:00:00.000Z");
 assert.equal(d.title,"Vylor Added to the S&P 500; Twilio Set to Join S&P 500");
 assert.equal("asset_id" in d,false);
});
test("excludes methodology releases, future items and wrong-host URLs",()=>{
 const feed=`<rss><channel>
 ${item("S&P 500 Consultation on Methodology")}
 ${item("Two companies added to S&P 500","https://attacker.example.com/malicious")}
 ${item("New company added to S&P 500","https://press.spglobal.com/a","Sun, 11 Oct 2026 00:00:00 GMT")}
 </channel></rss>`;
 assert.equal(parseSPIndexAnnouncementFeed(feed,now).documents.length,0);
});
test("deduplicates matching official release URLs",()=>{
 const i=item("Twilio to join S&P 500");
 const d=parseSPIndexAnnouncementFeed(`<rss><channel>${i}${i}</channel></rss>`,now);
 assert.equal(d.documents.length,1);
});
test("records honest first observation time, not assumed 00:00 publication",()=>{
 const d=parseSPIndexAnnouncementFeed(`<rss><channel>${item("Twilio to join S&P 500")}</channel></rss>`,now);
 assert.equal(d.documents[0].first_known_at,now.toISOString());
});
test("rejects untrusted/malformed feeds",()=>{
 assert.throws(()=>parseSPIndexAnnouncementFeed("<script>not RSS</script>",now));
 assert.throws(()=>parseSPIndexAnnouncementFeed("x".repeat(2_000_001),now));
});
test("fetches only the pinned official feed address",async()=>{
 let called="";
 const fetcher=async (url: string)=>{
   called=url;
   return new Response(`<rss><channel>${item("Twilio to join S&P 500")}</channel></rss>`,{status:200});
 };
 const r=await fetchSPIndexAnnouncementFeed(fetcher as typeof fetch,now);
 assert.equal(called,SP_DJI_INDEX_FEED);
 assert.equal(r.documents.length,1);
});
