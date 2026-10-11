import { createFileRoute } from "@tanstack/react-router";

/** One authorized database-leased SEC issuer per delivery. The cron poller
 * creates NO waves and performs NO source requests without owner-approved jobs.
 * The credential is created in the production database, not in this repo.
 */
export const Route = createFileRoute("/api/public/ingest/sec-queue-worker")({
  server:{handlers:{POST:async({request})=>{
    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    const {timingSafeEqual}=await import("node:crypto");
    const db=supabaseAdmin as any;
    const supplied=request.headers.get("X-SEC-Queue-Token")??"";
    if(supplied.length!==64||!/^[0-9a-f]{64}$/.test(supplied))
      return Response.json({error:"Unauthorized worker"},{status:401});
    const credential=await db.from("sec_queue_worker_auth")
      .select("token").eq("name","sec-queue").single();
    if(credential.error||typeof credential.data?.token!=="string")
      return Response.json({error:"Worker configuration unavailable"},{status:503});
    const expected=credential.data.token as string;
    if(expected.length!==supplied.length ||
       !timingSafeEqual(Buffer.from(expected),Buffer.from(supplied)))
      return Response.json({error:"Unauthorized worker"},{status:401});

    const lease=await db.rpc("sec_queue_claim");
    if(lease.error)return Response.json({error:"SEC queue lease unavailable"},{status:503});
    const job=(lease.data as Array<{
      job_id:string;asset_id:string;symbol:string;lease_token:string;
      wave_id:string;attempt:number
    }>??[])[0];
    if(!job)return Response.json({claimed:false});

    let outcome:"succeeded"|"partial"|"failed"|"retryable"="failed";
    let newFilings=0,newFacts=0,reason:string|null=null;
    try{
      const {recoverSecAnnualFacts}=await import(
        "@/lib/ingestion/sec/recover-annual.server");
      const result=await recoverSecAnnualFacts([job.asset_id]);
      const issuer=result.results[0];
      if(!issuer||issuer.symbol!==job.symbol)throw new Error("SEC issuer identity mismatch");
      newFilings=issuer.filingsInserted;
      newFacts=issuer.factsInserted;
      if(!Number.isSafeInteger(newFilings)||newFilings<0||
         !Number.isSafeInteger(newFacts)||newFacts<0)
        throw new Error("Unverifiable SEC persisted counts");
      if(issuer.status==="failed"){
        reason=issuer.reason??"Source failed";
        outcome=retryableSecError(reason)?"retryable":"failed";
      }else if(issuer.status==="skipped"){
        outcome="partial";reason=issuer.reason??"SEC source skipped issuer";
      }else{
        // Never call a source request successful merely because HTTP 200,
        // filing count=3 or raw values were written.
        const [coverage,integrity]=await Promise.all([
          db.from("sec_original_10k_coverage")
            .select("three_year_history_available").eq("asset_id",job.asset_id).maybeSingle(),
          db.from("sec_original_10k_integrity")
            .select("invalid_metadata_filings,empty_filings,duplicate_metrics,inconsistent_fact_rows")
            .eq("asset_id",job.asset_id).maybeSingle(),
        ]);
        if(coverage.error||integrity.error||!integrity.data||!coverage.data)
          throw new Error("SEC persisted verification unavailable");
        const flagKeys=["invalid_metadata_filings","empty_filings",
          "duplicate_metrics","inconsistent_fact_rows"] as const;
        if(flagKeys.some(key=>!Number.isSafeInteger(integrity.data[key])||
           integrity.data[key]!==0)){
          outcome="failed";reason="SEC ledger integrity flagged after import";
        }else if(coverage.data.three_year_history_available===true){
          outcome="succeeded";
        }else{
          outcome="partial";reason=issuer.reason??"Incomplete original 10-K history";
        }
      }
    }catch(e){
      reason=e instanceof Error?e.message:"Unexpected SEC worker error";
      outcome=retryableSecError(reason)?"retryable":"failed";
    }
    const done=await db.rpc("sec_queue_complete",{
      p_job_id:job.job_id,p_lease_token:job.lease_token,
      p_outcome:outcome,p_filings:newFilings,p_facts:newFacts,p_error:reason,
    });
    if(done.error)return Response.json({
      error:"SEC worker lease completion unavailable; job will recover after lease expiry",
      jobId:job.job_id,
    },{status:503});
    return Response.json({
      claimed:true,jobId:job.job_id,symbol:job.symbol,
      state:done.data,attempt:job.attempt,
      newFilings,newFacts,
      ...(reason?{reason}:{}),
    },{headers:{"Cache-Control":"no-store"}});
  }}}
});

/** Retry only intermittent network/server/rate-limit failures.
 * Semantic SEC/XBRL validation errors require inspection.
 */
function retryableSecError(reason:string):boolean{
  return /\b(?:429|50[0-9]|52[0-9])\b|timeout|timed out|fetch failed|network/i.test(reason);
}
