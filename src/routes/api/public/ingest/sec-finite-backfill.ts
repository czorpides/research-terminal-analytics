import { createFileRoute } from "@tanstack/react-router";

/** One-time owner authorisation for the finite remainder of the curated SEC
 * pool. GET only previews; POST commits the exact currently eligible snapshot.
 */
export const Route=createFileRoute("/api/public/ingest/sec-finite-backfill")({
 server:{handlers:{
  GET:async({request})=>{
    const {checkOwnerAccess}=await import("@/lib/security/owner-access.server");
    const owner=await checkOwnerAccess(request);
    if(!owner.ok)return Response.json({error:owner.error},{status:owner.status});
    try{
      const {getSecQueueExpansionPlan}=await import("@/lib/ingestion/sec/queue-plan.server");
      const plan=await getSecQueueExpansionPlan(100);
      return Response.json({
        candidates:plan.candidates,
        eligible:plan.candidates.length,
        verifiedIdentities:plan.verifiedIdentities,
        curatedPoolSize:plan.pilotSize,
        coveredThreeYear:plan.alreadyCovered,
        incompleteHistory:plan.incompleteHistory,
        untouched:plan.untouched,
        coolingDown:plan.coolingDown,
        blockedByIntegrity:plan.integrityBlocked,
        note:"Read-only preview. Current incomplete original SEC histories are excluded, not retried.",
      },{headers:{"Cache-Control":"no-store"}});
    }catch{
      return Response.json({error:"SEC finite backfill preview unavailable"},
        {status:503,headers:{"Cache-Control":"no-store"}});
    }
  },
  POST:async({request})=>{
    const {checkOwnerAccess}=await import("@/lib/security/owner-access.server");
    const owner=await checkOwnerAccess(request);
    if(!owner.ok)return Response.json({error:owner.error},{status:owner.status});
    let body:{assetIds?:unknown};
    try{body=await request.json()}catch{
      return Response.json({error:"Invalid SEC backfill JSON"},{status:400});
    }
    if(!Array.isArray(body.assetIds) || body.assetIds.length<1 ||
       body.assetIds.length>100 ||
       body.assetIds.some(v=>typeof v!=="string")){
      return Response.json({error:"Explicit list of 1–100 approved issuers required"},{status:400});
    }
    try{
      const {getSecQueueExpansionPlan}=await import("@/lib/ingestion/sec/queue-plan.server");
      const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
      const plan=await getSecQueueExpansionPlan(100);
      const expected=plan.candidates.map(x=>x.assetId);
      const proposed=body.assetIds as string[];
      if(!expected.length || expected.length!==proposed.length ||
         !expected.every((v,i)=>v===proposed[i]))
        return Response.json({error:"SEC eligible universe changed since preview; preview again"},
          {status:409});
      const result=await (supabaseAdmin as any).rpc("sec_queue_enqueue_finite_backfill",{
        p_owner_id:owner.userId,p_asset_ids:expected,
      });
      if(result.error)throw result.error;
      return Response.json({
        waveId:result.data,accepted:expected.length,
        note:"Finite one-time SEC backfill approved and persisted. No other firms will be automatically enqueued.",
      },{status:201,headers:{"Cache-Control":"no-store"}});
    }catch(e){
      return Response.json({error:"Finite SEC authorisation refused: "+
        (e instanceof Error?e.message:"unknown")},{status:409});
    }
  }
 }}
});
