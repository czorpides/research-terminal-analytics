import {createFileRoute} from "@tanstack/react-router";
import {z} from "zod";

/** Guarded, source-fed preflight. No live source polling, no auto-verification. */
const fact=<T extends z.ZodType>(value:T)=>z.object({
 value:value.nullable(),sourceUrl:z.string().url().startsWith("https://"),
 sourceName:z.string().min(3).max(140),
 sourcePublishedAt:z.string().datetime({offset:true}),
 observedAt:z.string().datetime({offset:true}),
}).strict().nullable();
const booleanFact=fact(z.boolean());
const numberFact=fact(z.number().finite());
const packet=z.object({
 symbol:z.string().regex(/^[A-Za-z0-9.-]{1,22}$/),
 methodologyVersion:z.literal("2026-07"),
 methodologyReviewedAt:z.string().datetime({offset:true}),
 currentMember:booleanFact,usDomicile:booleanFact,
 eligibleUsListing:booleanFact,eligibleSecurityType:booleanFact,
 secDomesticReporting:booleanFact,ipoSeasoningOrExemption:booleanFact,
 companyMarketCapUsd:numberFact,securityFloatMarketCapUsd:numberFact,
 investableWeightFactor:numberFact,
 lastSixMonthlySharesTraded:fact(z.array(z.number().finite()).length(6)),
 annualFloatAdjustedLiquidityRatio:numberFact,
 gaapContinuingNetIncomeLatestQuarterUsd:numberFact,
 gaapContinuingNetIncomeTrailingFourQuartersUsd:numberFact,
}).strict();

export const Route=createFileRoute("/api/public/catalysts/anticipations/screen-sp500")({
 server:{handlers:{POST:async({request})=>{
  const {authorizeInternalJobRequest}=await import("@/lib/security/internal-job-auth.server");
  if(!authorizeInternalJobRequest(request))return new Response("Unauthorized",{status:401});
  const raw:unknown=await request.json().catch(()=>null);
  const parsed=z.object({packets:z.array(packet).min(1).max(20)}).strict().safeParse(raw);
  if(!parsed.success)return Response.json({ok:false,error:"Invalid source evidence packets",issues:parsed.error.issues.slice(0,4)},{status:422});
  const {screenSP500Preflight,SP500_METHODOLOGY_URL}=await import("@/lib/catalysts/sp500-preflight");
  const now=new Date();
  const screened=parsed.data.packets.map(input=>({input,result:screenSP500Preflight(input,now)}));
  const accepted=screened.filter(s=>["eligible_for_review","partial_research"].includes(s.result.state));
  const symbols=[...new Set(accepted.map(s=>s.input.symbol.toUpperCase()))];
  if(symbols.length!==accepted.length)return Response.json({ok:false,error:"Duplicate issuer symbols in a single batch"},{status:422});
  if(!accepted.length)return Response.json({ok:true,candidates:0,
   withheld:screened.map(s=>({symbol:s.input.symbol,state:s.result.state,
    missing:s.result.missing,failed:s.result.failed})),
   note:"No source-backed non-members with adequate evidence. No candidate created."});
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
  const {data:assets,error:assetError}=await supabaseAdmin.from("assets")
   .select("id,symbol").in("symbol",symbols).eq("asset_class","equity").eq("active",true);
  if(assetError)return Response.json({ok:false,error:"Asset lookup failed"},{status:503});
  const ids=new Map<string,string>(),duplicates=new Set<string>();
  for(const asset of assets??[]){
    const symbol=asset.symbol.toUpperCase();
    if(ids.has(symbol))duplicates.add(symbol);
    else ids.set(symbol,asset.id);
  }
  const invalid=symbols.filter(symbol=>!ids.has(symbol)||duplicates.has(symbol));
  if(invalid.length)return Response.json({ok:false,error:"Ambiguous/unmapped assets",symbols:invalid},{status:422});
  const {createHash:hash}=await import("node:crypto");
  const rows=accepted.map(({input,result})=>{
    const membership=input.currentMember!;
    const symbol=input.symbol.toUpperCase();
    const fingerprint=hash("sha256").update(JSON.stringify(input)).digest("hex").slice(0,20);
    return {
     hypothesis_key:"sp500:"+symbol.replace(/[^A-Z0-9]/g,"_")+":"+fingerprint,
     asset_id:ids.get(symbol),hypothesis_type:"sp500_inclusion",
     headline:"S&P 500 potential-eligibility research: "+symbol,
     source_name:membership.sourceName,source_url:membership.sourceUrl,
     source_published_at:membership.sourcePublishedAt,
     first_observed_at:now.toISOString(),last_reviewed_at:now.toISOString(),
     target_at:null,expires_at:new Date(now.getTime()+30*86_400_000).toISOString(),
     status:"monitoring",verification_status:"candidate",verified_at:null,verification_note:null,
     criteria:result.criteria,
     reviewer_note:"Generated from dated issuer facts under "+SP500_METHODOLOGY_URL+
       ". No selection forecast; independent verification required.",
    };
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db=supabaseAdmin as any;
  const {error}=await db.from("catalyst_anticipations").upsert(rows,{onConflict:"hypothesis_key",ignoreDuplicates:true});
  if(error)return Response.json({ok:false,error:"Candidate write unavailable"},{status:503});
  return Response.json({ok:true,candidates:rows.length,verificationStatus:"candidate",
   withheld:screened.filter(s=>!accepted.includes(s)).map(s=>({symbol:s.input.symbol,
     state:s.result.state,missing:s.result.missing,failed:s.result.failed})),
   note:"Independent reviewer still required. No index probability or Swing ranking bonus generated."});
 }}},
});
