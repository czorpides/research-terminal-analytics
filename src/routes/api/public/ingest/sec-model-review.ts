import {createFileRoute} from "@tanstack/react-router";

/** Owner-only, original SEC issuer evidence review. Research models only;
 * no changes to raw SEC source facts, historical scores or Radar scoring.
 */
export const Route=createFileRoute("/api/public/ingest/sec-model-review")({
 server:{handlers:{
  GET:async({request})=>{
    const {checkOwnerAccess}=await import("@/lib/security/owner-access.server");
    const owner=await checkOwnerAccess(request);
    if(!owner.ok)return Response.json({error:owner.error},{status:owner.status});
    try{
      const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
      const db=supabaseAdmin as any;
      const [coverage,requests]=await Promise.all([
        db.from("sec_reconciliation_coverage")
          .select("asset_id,symbol,filing_years,three_year_history_available,metric_code,display_label,eligible_basis,direct_original_years,issuer_document_checked_years,review_stage,automatically_model_eligible,automatically_score_eligible")
          .order("symbol",{ascending:true}).order("metric_code",{ascending:true})
          .limit(550),
        db.from("sec_model_readiness_review")
          .select("id,asset_id,symbol,metric_basis,latest_annual_period,state,submitted_at,reviewed_at,proposal_notes,review_notes,research_model_approval_current,radar_scoring_eligible,automatic_live_model_consumption_enabled")
          .order("submitted_at",{ascending:false}).limit(200),
      ]);
      if(coverage.error||requests.error)throw new Error("SEC model review source unavailable");
      const rows=coverage.data??[];
      if(rows.length>500 || rows.some((r:{automatically_model_eligible:boolean;automatically_score_eligible:boolean})=>
         r.automatically_model_eligible!==false||r.automatically_score_eligible!==false))
        throw new Error("Unexpected SEC review source eligibility");
      return Response.json({
        rows,cases:requests.data??[],issuerCount:new Set(rows.map((x:{asset_id:string})=>x.asset_id)).size,
        modelConsumersEnabled:false,scoreConsumersEnabled:false,
        approvalScope:"research_only",
      },{headers:{"Cache-Control":"no-store"}});
    }catch{
      return Response.json({error:"SEC model-readiness review unavailable"},{
        status:503,headers:{"Cache-Control":"no-store"},
      });
    }
  },
  POST:async({request})=>{
    const {checkOwnerAccess}=await import("@/lib/security/owner-access.server");
    const owner=await checkOwnerAccess(request);
    if(!owner.ok)return Response.json({error:owner.error},{status:owner.status});
    let body:{action?:unknown;assetId?:unknown;metricBasis?:unknown;caseId?:unknown;notes?:unknown};
    try{body=await request.json()}catch{
      return Response.json({error:"Invalid SEC review payload"},{status:400});
    }
    const action=body.action;
    if(typeof body.notes!=="string"||body.notes.length>4000||
       body.notes.trim().length<(action==="propose"?40:80))
      return Response.json({error:"Detailed review explanation required (40 characters to propose, 80 to decide)"},{status:400});
    const uuid=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    const db=supabaseAdmin as any;
    try{
      if(action==="propose"){
        if(typeof body.assetId!=="string"||!uuid.test(body.assetId)||
          !["consolidated_net_income","bank_issuer_total_revenue"].includes(String(body.metricBasis)))
          return Response.json({error:"Unsupported SEC original issuer metric or ID"},{status:400});
        const r=await db.rpc("sec_model_propose_review",{
          p_owner:owner.userId,p_asset:body.assetId,
          p_basis:body.metricBasis,p_notes:body.notes.trim(),
        });
        if(r.error)throw r.error;
        return Response.json({caseId:r.data,state:"proposed",approvalScope:"research_only",
          scoreConsumersEnabled:false},{status:201});
      }
      if(["research_approved","rejected","revoked"].includes(String(action))){
        if(typeof body.caseId!=="string"||!uuid.test(body.caseId))
          return Response.json({error:"Invalid SEC review case"},{status:400});
        // An explicit second request with a long written justification is
        // necessary; no preview, GET or proposal can approve an issuer.
        const r=await db.rpc("sec_model_decide_review",{
          p_owner:owner.userId,p_case:body.caseId,
          p_decision:action,p_notes:body.notes.trim(),
        });
        if(r.error)throw r.error;
        return Response.json({state:r.data,approvalScope:"research_only",
          scoreConsumersEnabled:false,automatedModelUseEnabled:false});
      }
      return Response.json({error:"Unsupported SEC review decision"},{status:400});
    }catch{
      return Response.json({error:"Review was not accepted: evidence incomplete, invalid state or prior review already exists"},
        {status:409,headers:{"Cache-Control":"no-store"}});
    }
  }
 }}
});
