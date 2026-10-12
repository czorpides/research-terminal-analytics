import {createFileRoute} from "@tanstack/react-router";
import {extractSecOperatingModelCandidates,type SecGaap} from "@/lib/ingestion/sec/reusable-concept-extractor";
import {forceManualRedirect,requireNonRedirectResponse} from "@/lib/ingestion/providers/edge-safe-redirect";
const PILOT=new Set(["MSFT","GOOGL","NVDA"]);
const HOLDOUT=new Set(["COST","AMZN","ADBE"]);
const APPROVED=new Set([...PILOT,...HOLDOUT]);
const MAX=24_000_000;
/** One issuer, one SEC API call, explicit owner POST; no persistence or score updates. */
export const Route=createFileRoute("/api/public/ingest/sec-concept-preview")({
 server:{handlers:{POST:async({request})=>{
  const {checkOwnerAccess}=await import("@/lib/security/owner-access.server");
  const owner=await checkOwnerAccess(request);
  if(!owner.ok)return Response.json({error:owner.error},{status:owner.status});
  let body:{symbol?:unknown};
  try{body=await request.json()}catch{return Response.json({error:"Invalid request"},{status:400})}
  if(typeof body?.symbol!=="string"||!APPROVED.has(body.symbol))
   return Response.json({error:"Explicit approved single issuer required"},{status:400});
  const symbol=body.symbol;
  try{
   const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
   const db=supabaseAdmin as any;
   const [settings,company,source]=await Promise.all([
    db.from("research_provider_settings").select("value").eq("name","sec_edgar_user_agent").maybeSingle(),
    db.from("assets").select("id,symbol,exchange").eq("symbol",symbol).eq("active",true)
      .eq("asset_class","equity").eq("currency","USD").maybeSingle(),
    db.from("data_sources").select("id").eq("provider_code","sec_edgar").eq("active",true).single(),
   ]);
   if(settings.error||company.error||source.error||!company.data||!source.data||
      !["XNAS","XNYS","XASE"].includes(company.data.exchange))
    throw new Error("SEC issuer identity unavailable");
   const ua=String(settings.data?.value??"").trim();
   if(ua.length<12||!/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(ua))
    throw new Error("SEC contact identity unavailable");
   const filings=await db.from("fundamental_filings")
    .select("id,source_filing_id,period_end,raw,known_at")
    .eq("asset_id",company.data.id).eq("source_id",source.data.id)
    .eq("fiscal_period","FY").eq("revision_no",1).eq("is_restatement",false)
    .order("period_end",{ascending:false}).limit(1);
   if(filings.error||filings.data?.length!==1)throw new Error("Original 10-K missing");
   const f=filings.data[0];
   const cik=Number(f.raw?.cik),accn=String(f.source_filing_id??"");
   if(!Number.isSafeInteger(cik)||cik<1||f.raw?.form!=="10-K"||
       f.raw?.accession!==accn||!/^\d{10}-\d{2}-\d{6}$/.test(accn))
    throw new Error("Source integrity mismatch");
   const url="https://data.sec.gov/api/xbrl/companyfacts/CIK"+String(cik).padStart(10,"0")+".json";
   const resp=await fetch(url,forceManualRedirect({
    headers:{"User-Agent":ua,"Accept":"application/json","Accept-Encoding":"gzip, deflate"},
    signal:AbortSignal.timeout(20000),
   }));
   requireNonRedirectResponse(resp,"SEC EDGAR");
   if(!resp.ok||Number(resp.headers.get("content-length")??0)>MAX)
    throw new Error("Official SEC source failed");
   const raw=await resp.text();
   if(raw.length>MAX)throw new Error("SEC payload too large");
   const data=JSON.parse(raw) as {cik?:number;facts?:{"us-gaap"?:SecGaap}};
   if(data.cik!==cik||!data.facts?.["us-gaap"])throw new Error("CIK mismatch");
   const candidates=extractSecOperatingModelCandidates(data.facts["us-gaap"],{
    accession:accn,periodEnd:String(f.period_end),
    filedDate:String(f.raw?.filedDate??""),sector:"nonfinancial",
   });
   return Response.json({
    symbol,sampleKind:PILOT.has(symbol)?"pilot":"independent_holdout",
    originalAccession:accn,originalPeriod:f.period_end,originalFirstObserved:f.known_at,
    candidates,providerRequests:1,storedChanges:0,
    modelReady:false,scoringEligible:false,
    caveat:"SEC direct-tag candidates, not approved EBIT/EV debt or audited issuer-note financials",
   },{headers:{"Cache-Control":"no-store"}});
  }catch{
   return Response.json({error:"Original SEC preview unavailable or integrity check failed"},
      {status:503,headers:{"Cache-Control":"no-store"}});
  }
}}}
});
