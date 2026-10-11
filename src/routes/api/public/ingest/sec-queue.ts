import { createFileRoute } from "@tanstack/react-router";

/** Owner-only control and progress telemetry. The browser never runs provider
 * jobs: only service-only leased queue workers can claim an approved issuer.
 */
export const Route = createFileRoute("/api/public/ingest/sec-queue")({
  server:{handlers:{
    GET:async({request})=>{
      const {checkOwnerAccess}=await import("@/lib/security/owner-access.server");
      const owner=await checkOwnerAccess(request);
      if(!owner.ok)return Response.json({error:owner.error},{status:owner.status});
      try{
        const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
        const db=supabaseAdmin as any;
        const waves=await db.from("sec_queue_waves").select("*")
          .eq("owner_id",owner.userId)
          .order("created_at",{ascending:false}).limit(8);
        if(waves.error)throw new Error("Queue wave read failed");
        const ids=(waves.data??[]).map((w:{id:string})=>w.id);
        const jobs=ids.length?await db.from("sec_queue_jobs")
          .select("id,wave_id,symbol,ordinal,state,attempts,available_at,new_filings,new_facts,error,started_at,finished_at")
          .in("wave_id",ids).order("ordinal",{ascending:true}).limit(80):
          {data:[],error:null};
        if(jobs.error)throw new Error("Queue job read failed");
        return Response.json({waves:waves.data??[],jobs:jobs.data??[]},{
          headers:{"Cache-Control":"no-store"},
        });
      }catch{
        return Response.json({error:"SEC queue status unavailable"},{
          status:503,headers:{"Cache-Control":"no-store"},
        });
      }
    },
    POST:async({request})=>{
      const {checkOwnerAccess}=await import("@/lib/security/owner-access.server");
      const owner=await checkOwnerAccess(request);
      if(!owner.ok)return Response.json({error:owner.error},{status:owner.status});
      let body:{action?:unknown;assetIds?:unknown;waveId?:unknown};
      try{body=await request.json()}catch{
        return Response.json({error:"Invalid SEC queue JSON"},{status:400});
      }
      try{
        const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
        const db=supabaseAdmin as any;
        if(body.action==="enqueue"){
          // Approval is always scoped to exactly the *current* server-approved
          // first <=10 issuers; cannot inject arbitrary ticker/asset/CIK.
          const {getSecQueueExpansionPlan}=await import(
            "@/lib/ingestion/sec/queue-plan.server");
          const plan=await getSecQueueExpansionPlan();
          const expected=plan.candidates.map(x=>x.assetId);
          if(!Array.isArray(body.assetIds)||!expected.length ||
             expected.length!==body.assetIds.length ||
             !expected.every((id,i)=>id===body.assetIds![i]))
            return Response.json({error:"SEC queue preview stale; refresh and approve current batch"},{
              status:409,
            });
          const result=await db.rpc("sec_queue_enqueue",{
            p_owner_id:owner.userId,p_asset_ids:expected,
          });
          if(result.error)throw result.error;
          return Response.json({waveId:result.data,accepted:expected.length,
            message:"SEC jobs persisted; you may close the browser."},{status:201});
        }
        if(["pause","resume","cancel"].includes(String(body.action))){
          if(typeof body.waveId!=="string"||
             !/^[a-f0-9-]{36}$/i.test(body.waveId))
            return Response.json({error:"Valid queue wave required"},{status:400});
          const result=await db.rpc("sec_queue_control",{
            p_wave_id:body.waveId,p_owner_id:owner.userId,p_action:body.action,
          });
          if(result.error)throw result.error;
          return Response.json({state:result.data},{headers:{"Cache-Control":"no-store"}});
        }
        return Response.json({error:"Unsupported SEC queue action"},{status:400});
      }catch(e){
        return Response.json({error:"SEC queue operation unavailable: "+
          (e instanceof Error?e.message:"unknown")},{status:409});
      }
    }
  }}
});
