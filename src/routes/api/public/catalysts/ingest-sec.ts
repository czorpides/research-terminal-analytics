import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Operator-triggered official SEC earnings-result filing poll.
 * Internal token required. Inserts only unverified candidate events.
 * Never sets a bullish score or marks a filing as a beat/guidance increase.
 */
export const Route=createFileRoute("/api/public/catalysts/ingest-sec")({
  server:{handlers:{POST:async({request})=>{
    const {authorizeInternalJobRequest}=await import("@/lib/security/internal-job-auth.server");
    if(!authorizeInternalJobRequest(request))return new Response("Unauthorized",{status:401});
    const agent=process.env.SEC_EDGAR_USER_AGENT;
    if(!agent){
      return Response.json({ok:false,error:"SEC EDGAR data source is not configured",
        needs:"SEC_EDGAR_USER_AGENT = YourApplication/1.0 (real-contact@example.com)"},{status:503});
    }
    const payload:unknown=await request.json().catch(()=>({}));
    const parsed=z.object({
      symbols:z.array(z.string().regex(/^[a-zA-Z0-9.-]{1,22}$/)).min(1).max(8).optional(),
      lookbackDays:z.number().int().min(1).max(90).optional(),
    }).strict().safeParse(payload);
    if(!parsed.success)return Response.json({ok:false,error:"Invalid poll arguments"},{status:422});
    const symbols=parsed.data.symbols??["QCOM","PENG","BE","AAOI","INTC","NBIS"];
    const {fetchSecEarningsCandidates}=await import("@/lib/catalysts/providers/sec-edgar.server");
    try{
      const fetched=await fetchSecEarningsCandidates({symbols,lookbackDays:parsed.data.lookbackDays??45,userAgent:agent});
      const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
      const {data:assets,error:assetsError}=await supabaseAdmin.from("assets")
        .select("id,symbol").in("symbol",fetched.tickersFound);
      if(assetsError)throw new Error("Asset reconciliation unavailable");
      const index=new Map((assets??[]).map(a=>[a.symbol.toUpperCase(),a.id]));
      const unresolved=fetched.tickersFound.filter(s=>!index.has(s));
      const rows=fetched.candidates.filter(c=>index.has(c.symbol)).map(({symbol,...c})=>({
        ...c,asset_id:index.get(symbol),status:"candidate",
        verification_note:null,verified_at:null,
      }));
      if(rows.length){
        // Existing review status must not be overwritten by polling.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db=supabaseAdmin as any;
        const {error}=await db.from("catalyst_events")
          .upsert(rows,{onConflict:"event_key",ignoreDuplicates:true});
        if(error)throw new Error("Catalyst database ingestion unavailable");
      }
      return Response.json({ok:true,provider:"SEC EDGAR Form 8-K Item 2.02",
        symbolsRequested:fetched.symbolsRequested.length,symbolsMatched:fetched.tickersFound.length,
        candidatesObserved:fetched.candidates.length,candidatesSubmitted:rows.length,
        status:"candidate_only",unmatched:[...fetched.unmatchedTickers,...unresolved],
        warnings:fetched.warnings,
        note:"No event becomes verified or influences Swing rankings without independent review."});
    }catch(error){
      console.error("[catalyst-sec] ingestion failed",error instanceof Error?error.message:"Unknown error");
      return Response.json({ok:false,error:"SEC poll unavailable; no unverified data promoted"},{status:503});
    }
  }}},
});
