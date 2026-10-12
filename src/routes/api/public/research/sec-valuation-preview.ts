import {createFileRoute} from "@tanstack/react-router";
import {
  SEC_VALUATION_COHORT,prepareValuationPreview,
  type SecValuationSymbol,type ManualFactMap,type MarketTranscription,
} from "@/lib/ingestion/sec/valuation-workbench";
import type {Original10KContext} from "@/lib/ingestion/sec/magic-formula-policy-draft";

const responseHeaders={"Cache-Control":"no-store"};
const permitted=(s:string):s is SecValuationSymbol=>Object.prototype.hasOwnProperty.call(SEC_VALUATION_COHORT,s);
async function ownerAccess(request:Request){
 const {checkOwnerAccess}=await import("@/lib/security/owner-access.server");
 return checkOwnerAccess(request);
}

/**
 * All server-origin context, including first-observed-at, is reconstructed from
 * the existing original SEC ledger; neither API caller nor request body can
 * supply/override CIK, accession, FY, filing date or known-at timestamp.
 */
async function lookupOriginal(symbol:SecValuationSymbol):Promise<Original10KContext>{
 const expected=SEC_VALUATION_COHORT[symbol];
 const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
 const db=supabaseAdmin as any;
 const [a,source]=await Promise.all([
  db.from("assets").select("id,symbol,exchange").eq("symbol",symbol)
   .eq("active",true).eq("asset_class","equity").eq("currency","USD").maybeSingle(),
  db.from("data_sources").select("id").eq("provider_code","sec_edgar").eq("active",true).single(),
 ]);
 if(a.error||source.error||!a.data||!source.data||
    !["XNAS","XNYS","XASE"].includes(a.data.exchange)){
  throw new Error("SEC issuer or source unavailable");
 }
 const records=await db.from("fundamental_filings")
  .select("id,source_filing_id,period_end,known_at,raw")
  .eq("asset_id",a.data.id).eq("source_id",source.data.id)
  .eq("source_filing_id",expected.accession).eq("period_end",expected.periodEnd)
  .eq("fiscal_period","FY").eq("revision_no",1).eq("is_restatement",false)
  .limit(2);
 if(records.error||records.data?.length!==1)throw new Error("Original filing identity absent or duplicated");
 const original=records.data[0];
 if(Number(original.raw?.cik)!==expected.cik||
    original.raw?.form!=="10-K"||
    original.raw?.accession!==expected.accession||
    original.raw?.primaryDocumentUrl!==expected.official10k||
    !/^\d{4}-\d{2}-\d{2}$/.test(original.raw?.filedDate??"")||
    typeof original.known_at!=="string"||!original.known_at){
  throw new Error("Original 10-K provenance mismatch: no valuation preview");
 }
 return{
  cik:expected.cik,accession:expected.accession,periodEnd:expected.periodEnd,
  filedDate:original.raw.filedDate,firstObservedAt:original.known_at,
  sourceUrl:expected.official10k,sector:"nonfinancial",
 };
}
async function ownerPreview(request:Request, symbol:SecValuationSymbol,
 supplements:ManualFactMap={},market:MarketTranscription|null=null){
 const owner=await ownerAccess(request);
 if(!owner.ok)return Response.json({error:owner.error},{status:owner.status,headers:responseHeaders});
 try{
  const original=await lookupOriginal(symbol);
  const preview=prepareValuationPreview(symbol,original,supplements,market);
  return Response.json(preview,{headers:responseHeaders});
 }catch{
  return Response.json({error:"Original SEC filing identity unavailable or manual preview invalid"},
   {status:409,headers:responseHeaders});
 }
}
export const Route=createFileRoute("/api/public/research/sec-valuation-preview")({
 server:{handlers:{
  GET:async({request})=>{
   const owner=await ownerAccess(request);
   if(!owner.ok)return Response.json({error:owner.error},{status:owner.status,headers:responseHeaders});
   const symbol=new URL(request.url).searchParams.get("symbol")??"";
   if(!permitted(symbol))return Response.json({error:"Choose AMZN, ADBE or COST"},
    {status:400,headers:responseHeaders});
   return ownerPreview(request,symbol);
  },
  POST:async({request})=>{
   const owner=await ownerAccess(request);
   if(!owner.ok)return Response.json({error:owner.error},{status:owner.status,headers:responseHeaders});
   if(Number(request.headers.get("content-length")??0)>32000)
    return Response.json({error:"Excessive preview payload"},{status:413,headers:responseHeaders});
   let raw:string;
   try{raw=await request.text()}catch{return Response.json({error:"Unreadable request"},{status:400,headers:responseHeaders})}
   if(raw.length>32000)return Response.json({error:"Excessive preview payload"},{status:413,headers:responseHeaders});
   let body:unknown;
   try{body=JSON.parse(raw)}catch{return Response.json({error:"Invalid JSON"},{status:400,headers:responseHeaders})}
   if(!body||typeof body!=="object"||Array.isArray(body))
    return Response.json({error:"Invalid valuation payload"},{status:400,headers:responseHeaders});
   const input=body as Record<string,unknown>;
   if(!permitted(String(input.symbol??""))||
      input.supplementary===null||typeof input.supplementary!=="object"||
      Array.isArray(input.supplementary)||
      (input.market!==null&&input.market!==undefined&&(
        typeof input.market!=="object"||Array.isArray(input.market))))
    return Response.json({error:"Unsupported SEC preview payload"},{status:400,headers:responseHeaders});
   const symbol=input.symbol as SecValuationSymbol;
   return ownerPreview(request,symbol,input.supplementary as ManualFactMap,
    (input.market??null) as MarketTranscription|null);
  },
 }}
});
