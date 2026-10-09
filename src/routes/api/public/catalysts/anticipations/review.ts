import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/** Independent, auditable review; ingestion credentials cannot approve themselves. */
export const Route=createFileRoute("/api/public/catalysts/anticipations/review")({
  server:{handlers:{POST:async ({request})=>{
    const {authorizeCatalystReviewRequest}=await import("@/lib/catalysts/review-auth.server");
    if(!authorizeCatalystReviewRequest(request))return new Response("Unauthorized",{status:401});
    const raw:unknown=await request.json().catch(()=>null);
    const parsed=z.object({
      hypothesis_key:z.string().regex(/^[A-Za-z0-9_:-]{8,180}$/),
      decision:z.enum(["verified","rejected"]),
      verification_note:z.string().min(20).max(1800),
    }).strict().safeParse(raw);
    if(!parsed.success)return Response.json({ok:false,error:"Invalid independent review"},{status:422});
    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db=supabaseAdmin as any;
    const {data,error}=await db.from("catalyst_anticipations").update({
      verification_status:parsed.data.decision,
      verified_at:parsed.data.decision==="verified"?new Date().toISOString():null,
      verification_note:parsed.data.verification_note,
      last_reviewed_at:new Date().toISOString(),updated_at:new Date().toISOString(),
    }).eq("hypothesis_key",parsed.data.hypothesis_key)
      .eq("verification_status","candidate")
      .select("id,hypothesis_key,verification_status").maybeSingle();
    if(error)return Response.json({ok:false,error:"Review persistence failed"},{status:503});
    if(!data)return Response.json({ok:false,error:"No pending hypothesis with that key"},{status:404});
    return Response.json({ok:true,key:data.hypothesis_key,status:data.verification_status,
      note:"Eligibility review does not establish that a future event will happen."});
  }}},
});
