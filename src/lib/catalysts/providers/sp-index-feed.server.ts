/**
 * Official S&P DJI index-announcement RSS discovery.
 * First-seen source documents are not ticker-mapped, verified, or scored.
 * This is intentionally stricter than extracting presumed additions from
 * headlines, which frequently combine additions, deletions and acquisitions.
 */
export const SP_DJI_INDEX_FEED =
 "https://www.spglobal.com/spdji/en/rss/rss-details/?rssFeedName=index-news-announcements";
export const SP_DJI_PROVIDER_VERSION="sp.dji.index-announcements.v0.1";

export interface IndexFeedDocument {
 provider:"sp_dji_index_news";
 source_url:string;
 title:string;
 source_published_at:string;
 first_observed_at:string;
 first_known_at:string;
 status:"unmapped";
}
function entities(s:string):string{
 return s.replace(/&#(x[0-9a-f]+|[0-9]+);|&(amp|lt|gt|quot|apos);/gi,part=>{
   const named:Record<string,string>={"&amp;":"&","&lt;":"<","&gt;":">","&quot;":'"',"&apos;":"'"};
   const lower=part.toLowerCase();
   if(named[lower])return named[lower];
   try {
     const isHex=lower.startsWith("&#x");
     const value=Number.parseInt(lower.slice(isHex?3:2,-1),isHex?16:10);
     if(value<32||value>0x10ffff||value>=0xd800&&value<=0xdfff)return "";
     return String.fromCodePoint(value);
   }catch{return "";}
 });
}
function tag(body:string,name:string):string|null{
 const match=new RegExp(`<(?:[a-z0-9_-]+:)?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:[a-z0-9_-]+:)?${name}\\s*>`,"i").exec(body);
 if(!match)return null;
 const s=match[1].replace(/^<!\[CDATA\[|\]\]>$/g,"").replace(/<[^>]+>/g,"");
 return entities(s).trim();
}
function validOfficialURL(value:string):boolean{
 try{
   const u=new URL(value);
   return u.protocol==="https:" && !u.username && !u.password &&
     ["press.spglobal.com","www.spglobal.com"].includes(u.hostname) &&
     !/\s/.test(value);
 }catch{return false;}
}

export function parseSPIndexAnnouncementFeed(
 xml:string,seenAt:Date=new Date(),
):{documents:IndexFeedDocument[];skipped:number}{
 if(xml.length>2_000_000||!/<rss\b|<feed\b/i.test(xml)){
   throw new Error("Malformed or oversized S&P index announcements RSS/Atom feed");
 }
 const blocks=[...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item\s*>|<entry\b[^>]*>([\s\S]*?)<\/entry\s*>/gi)];
 if(blocks.length>250)throw new Error("Unexpectedly large S&P feed");
 const documents:IndexFeedDocument[]=[];let skipped=0;
 for(const entry of blocks){
   const block=entry[1]??entry[2]??"";
   const title=tag(block,"title")?.replace(/\s+/g," ").trim()??"";
   const link=tag(block,"link") ??
     /<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\/?>/i.exec(block)?.[1] ?? "";
   const date=tag(block,"pubDate")??tag(block,"published")??tag(block,"updated");
   const parsed=date?Date.parse(date):NaN;
   // An index announcement is worth triage if it may change constituents;
   // identifying the affected stock requires full source-document review.
   const relevant=/\bs\s*&\s*p\s*(?:500|midcap\s*400|smallcap\s*600)\b/i.test(title) &&
     /\b(?:join|joins|added|addition|additions|replace|replaces|replacing|set\s+to\s+join|index\s+changes)\b/i.test(title);
   if(!relevant||title.length<8||title.length>500||!validOfficialURL(link)||
       !Number.isFinite(parsed)||parsed>seenAt.getTime()+60_000||
       parsed<new Date("2020-01-01T00:00:00Z").getTime()){
     skipped++;continue;
   }
   documents.push({
     provider:"sp_dji_index_news",source_url:link,title,
     source_published_at:new Date(parsed).toISOString(),
     first_observed_at:seenAt.toISOString(),
     // Conservative: do not backdate point-in-time access just because the
     // source publication timestamp predates our first actual observation.
     first_known_at:seenAt.toISOString(),status:"unmapped",
   });
 }
 const seen=new Set<string>();
 return {documents:documents.filter(d=>seen.has(d.source_url)?false:(seen.add(d.source_url),true)),skipped};
}

export async function fetchSPIndexAnnouncementFeed(fetcher:typeof fetch=fetch,seenAt:Date=new Date()){
 const response=await fetcher(SP_DJI_INDEX_FEED,{
   headers:{"Accept":"application/rss+xml, application/atom+xml, application/xml, text/xml"},
   signal:AbortSignal.timeout(18000),
   redirect:"error",
 });
 if(!response.ok)throw new Error(`S&P official announcement feed returned HTTP ${response.status}`);
 const content=await response.text();
 return parseSPIndexAnnouncementFeed(content,seenAt);
}
