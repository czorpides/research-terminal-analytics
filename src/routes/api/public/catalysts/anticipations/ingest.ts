import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ANTICIPATION_RULEBOOK } from "@/lib/catalysts/anticipatory-model";

/**
 * Authenticated analyst intake. Inputs are unreviewed hypotheses only.
 * Ingestion time is server-created, not supplied by an upstream news story.
 */
const point = z.object({
  code:z.string().min(2).max(64),
  state:z.enum(["pass","fail","unknown"]),
  observedAt:z.string().datetime({offset:true}),
  sourceUrl:z.string().url().startsWith("https://"),
  note:z.string().min(8).max(500),
}).strict();
const hypothesis = z.object({
  hypothesis_key:z.string().regex(/^[A-Za-z0-9_:-]{8,180}$/),
  symbol:z.string().regex(/^[A-Za-z0-9.-]{1,22}$/),
  hypothesis_type:z.enum(["sp500_inclusion","nasdaq100_reconstitution","earnings_revision","government_award","fda_pdufa"]),
  headline:z.string().min(8).max(500),
  source_name:z.string().min(2).max(160),
  source_url:z.string().url().startsWith("https://"),
  source_published_at:z.string().datetime({offset:true}),
  target_at:z.string().datetime({offset:true}).nullable().default(null),
  expires_at:z.string().datetime({offset:true}).nullable().default(null),
  criteria:z.array(point).max(12).default([]),
}).strict();

export const Route=createFileRoute("/api/public/catalysts/anticipations/ingest")({
  server:{handlers:{POST:async ({request})=>{
    const {authorizeInternalJobRequest}=await import("@/lib/security/internal-job-auth.server");
    if(!authorizeInternalJobRequest(request))return new Response("Unauthorized",{status:401});
    const raw:unknown=await request.json().catch(()=>null);
    const parsed=z.object({hypotheses:z.array(hypothesis).min(1).max(30)}).strict().safeParse(raw);
    if(!parsed.success)return Response.json({ok:false,error:"Invalid hypothesis payload",issues:parsed.error.issues.slice(0,4)},{status:422});
    const receivedAt=new Date(),now=receivedAt.getTime();
    for(const item of parsed.data.hypotheses){
      const source=Date.parse(item.source_published_at);
      if(source>now+2000 || (item.expires_at && Date.parse(item.expires_at)<=now))
        return Response.json({ok:false,error:"Invalid source or expiry time"},{status:422});
      const approved=new Set<string>(ANTICIPATION_RULEBOOK[item.hypothesis_type].criteria);
      const seen=new Set<string>();
      for(const point of item.criteria){
        const ts=Date.parse(point.observedAt);
        if(!approved.has(point.code)||seen.has(point.code)||ts>now+2000)
          return Response.json({ok:false,error:"Duplicate, unrecognised or future criterion"},{status:422});
        seen.add(point.code);
      }
    }
    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    const symbols=[...new Set(parsed.data.hypotheses.map(h=>h.symbol.toUpperCase()))];
    const {data:assets,error:assetError}=await supabaseAdmin.from("assets").select("id,symbol").in("symbol",symbols);
    if(assetError)return Response.json({ok:false,error:"Asset resolution unavailable"},{status:503});
    const ids=new Map((assets??[]).map(a=>[a.symbol.toUpperCase(),a.id]));
    if(symbols.some(s=>!ids.has(s)))return Response.json({ok:false,error:"Unknown asset symbol"},{status:422});
    const rows=parsed.data.hypotheses.map(({symbol,...item})=>({
      ...item,asset_id:ids.get(symbol.toUpperCase()),
      first_observed_at:receivedAt.toISOString(),last_reviewed_at:receivedAt.toISOString(),
      status:"monitoring",verification_status:"candidate",verified_at:null,verification_note:null,
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db=supabaseAdmin as any;
    const {error}=await db.from("catalyst_anticipations").upsert(rows,{onConflict:"hypothesis_key",ignoreDuplicates:true});
    if(error)return Response.json({ok:false,error:"Anticipation intake unavailable"},{status:503});
    return Response.json({ok:true,accepted:rows.length,verificationStatus:"candidate",
      note:"No forecast probability, trade-score adjustment, or review decision was generated."});
  }}},
});
