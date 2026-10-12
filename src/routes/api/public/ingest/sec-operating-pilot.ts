import {createFileRoute} from "@tanstack/react-router";

/** Read-only original 10-K evidence. No collection, scoring or approval action. */
export const Route=createFileRoute("/api/public/ingest/sec-operating-pilot")({
 server:{handlers:{
  GET:async({request})=>{
   const {checkOwnerAccess}=await import("@/lib/security/owner-access.server");
   const owner=await checkOwnerAccess(request);
   if(!owner.ok)return Response.json({error:owner.error},{status:owner.status});
   try{
    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    const db=supabaseAdmin as any;
    const result=await db.from("sec_operating_pilot_review")
     .select("symbol,period_end,observed_basis,reported_usd,components,source_section,accounting_caveat,definition_version,evidence_state,model_eligible,scoring_eligible,source_checked_at,original_accession,filing_first_observed,original_10k_url")
     .order("symbol",{ascending:true})
     .order("observed_basis",{ascending:true}).limit(10);
    if(result.error)throw new Error("SEC pilot evidence not available");
    const rows=result.data??[];
    if(rows.length!==6||
       rows.some((r:{model_eligible:boolean;scoring_eligible:boolean;definition_version:string})=>
        r.model_eligible!==false||r.scoring_eligible!==false||
        r.definition_version!=="sec.operating.pilot.v1"))
      throw new Error("Pilot expected six non-scoring original source observations");
    return Response.json({
      version:"sec.operating.pilot.v1",rows,
      recordedAs:"original_consolidated_operating_income_and_borrowings_excluding_leases",
      ebitApproved:false,enterpriseValueDebtApproved:false,
      radarEnabled:false,modelUseEnabled:false,
      shareIssuanceBasis:"Separate Piotroski correction pending: year-end common shares outstanding is NOT weighted-average diluted EPS shares.",
    },{headers:{"Cache-Control":"no-store"}});
   }catch{
    return Response.json({error:"Original SEC pilot review unavailable"},{
       status:503,headers:{"Cache-Control":"no-store"},
    });
   }
  }
 }}
});
