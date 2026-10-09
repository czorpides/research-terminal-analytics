import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Admin-only verification checkpoint. Background feed intake never marks its
 * own headlines verified. The original public timestamp is immutable.
 */
export const Route = createFileRoute("/api/public/catalysts/review")({
  server:{handlers:{POST:async ({request})=>{
    const {authorizeInternalJobRequest}=await import("@/lib/security/internal-job-auth.server");
    if(!authorizeInternalJobRequest(request)) return new Response("Unauthorized",{status:401});
    const body:unknown=await request.json().catch(()=>null);
    const check=z.object({
      event_key:z.string().regex(/^[A-Za-z0-9_:-]{8,180}$/),
      decision:z.enum(["verified","rejected"]),
      verification_note:z.string().min(12).max(1800),
    }).strict().safeParse(body);
    if(!check.success) return Response.json({ok:false,error:"Invalid review decision"},{status:422});
    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    // Legacy generated Database type has not yet been regenerated.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db=supabaseAdmin as any;
    const {data,error}=await db.from("catalyst_events")
      .update({
        status:check.data.decision,
        verification_note:check.data.verification_note,
        verified_at:check.data.decision==="verified"?new Date().toISOString():null,
        updated_at:new Date().toISOString(),
      })
      .eq("event_key",check.data.event_key)
      .eq("status","candidate")
      .select("id,event_key,status")
      .maybeSingle();
    if(error) return Response.json({ok:false,error:"Verification update failed"},{status:503});
    if(!data) return Response.json({ok:false,error:"No pending event with that key"},{status:404});
    return Response.json({ok:true,eventKey:data.event_key,status:data.status});
  }}},
});
