import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const allowedEventTypes = z.enum(["index_inclusion","earnings_expectation","earnings_result","government_contract","political_statement"]);
const candidate = z.object({
  event_key:z.string().regex(/^[A-Za-z0-9_:-]{8,180}$/),
  symbol:z.string().min(1).max(22),
  event_type:allowedEventTypes,
  headline:z.string().min(8).max(500),
  summary:z.string().max(3000).default(""),
  direction:z.enum(["positive","negative","uncertain"]).default("uncertain"),
  source_name:z.string().min(2).max(160),
  source_url:z.string().url().startsWith("https://"),
  source_tier:z.enum(["official","regulated","reputable","social"]),
  source_published_at:z.string().datetime({offset:true}),
  known_at:z.string().datetime({offset:true}),
  effective_at:z.string().datetime({offset:true}).nullable().default(null),
  expires_at:z.string().datetime({offset:true}).nullable().default(null),
  materiality:z.number().min(0).max(100).nullable().default(null),
  novelty:z.number().min(0).max(100).nullable().default(null),
  evidence_confidence:z.number().min(0).max(100).nullable().default(null),
  evidence:z.record(z.string(),z.unknown()).default({}),
}).strict();

export const Route=createFileRoute("/api/public/catalysts/ingest")({
  server:{handlers:{POST:async ({request})=>{
    const {authorizeInternalJobRequest}=await import("@/lib/security/internal-job-auth.server");
    if(!authorizeInternalJobRequest(request)) return new Response("Unauthorized",{status:401});
    const body:unknown=await request.json().catch(()=>null);
    const validation=z.object({events:z.array(candidate).min(1).max(50)}).safeParse(body);
    if(!validation.success) return Response.json({ok:false,error:"Invalid event payload",issues:validation.error.issues.slice(0,5)},{status:422});
    const events=validation.data.events;
    const now=Date.now();
    for(const item of events){
      const published=Date.parse(item.source_published_at),known=Date.parse(item.known_at);
      if(known+2000<published || published>now+60_000 || known>now+60_000 || (item.expires_at && Date.parse(item.expires_at)<known)) {
        return Response.json({ok:false,error:"Invalid point-in-time evidence dates"},{status:422});
      }
    }
    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    const symbols=[...new Set(events.map(e=>e.symbol.toUpperCase()))];
    const {data:assets,error:assetError}=await supabaseAdmin.from("assets").select("id,symbol").in("symbol",symbols);
    if(assetError) return Response.json({ok:false,error:"Unable to resolve asset symbols"},{status:503});
    const assetsBySymbol=new Map((assets??[]).map(a=>[a.symbol.toUpperCase(),a.id]));
    const unknown=symbols.filter(s=>!assetsBySymbol.has(s));
    if(unknown.length) return Response.json({ok:false,error:"Unknown symbols",symbols:unknown},{status:422});
    const rows=events.map(({symbol,...event})=>({
      ...event,asset_id:assetsBySymbol.get(symbol.toUpperCase()),
      status:"candidate",verified_at:null,verification_note:null,
      // Repeated headlines with identical keys must not overwrite prior review.
    }));
    // New table awaits regeneration of the legacy Database type.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db=supabaseAdmin as any;
    const {error}=await db.from("catalyst_events").upsert(rows,{onConflict:"event_key",ignoreDuplicates:true});
    if(error){
      console.error("[catalyst-intake] database insert failed",error.code);
      return Response.json({ok:false,error:"Catalyst intake unavailable"},{status:503});
    }
    return Response.json({ok:true,accepted:events.length,status:"candidate",note:"All new events require independent review before scoring."});
  }}},
});
