import {createFileRoute} from "@tanstack/react-router";

/** Phase 2J5: owner-only, read-only dependency audit of the ACTUAL annual
 * Piotroski and Magic Formula modules. Not a model scoring endpoint.
 */
export const Route=createFileRoute("/api/public/ingest/sec-model-priorities")({
 server:{handlers:{
  GET:async({request})=>{
   const {checkOwnerAccess}=await import("@/lib/security/owner-access.server");
   const owner=await checkOwnerAccess(request);
   if(!owner.ok)return Response.json({error:owner.error},{status:owner.status});
   try{
    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    const db=supabaseAdmin as any;
    const [summary,exceptions]=await Promise.all([
      db.from("sec_model_metric_priorities")
        .select("model_key,metric_code,metric_label,required_annual_periods,priority_band,accounting_risk,covered_issuers,complete_history_issuers,source_period_coverage_issuers,issuer_document_checked_issuers,no_tag_issuers,history_exceptions,unclassified_industries,permitted_for_automatic_models")
        .order("priority_band",{ascending:true})
        .order("model_key",{ascending:true})
        .order("metric_code",{ascending:true}).limit(30),
      db.from("sec_model_metric_readiness")
        .select("symbol,model_key,metric_code,metric_label,required_annual_periods,priority_band,observed_annual_periods,checked_annual_periods,readiness_blocker,industry_mapping_missing,scoring_eligible,model_input_approved")
        .eq("priority_band","P0")
        .in("readiness_blocker",[
          "no_eligible_original_tag","missing_required_annual_observations",
          "weighted_average_not_year_end_issuance_proxy",
        ]).order("metric_code",{ascending:true})
        .order("symbol",{ascending:true}).limit(50),
    ]);
    if(summary.error||exceptions.error)throw new Error("SEC dependency review unavailable");
    const rows=summary.data??[];
    const examples=exceptions.data??[];
    if(rows.length!==15||rows.some((r:{
      permitted_for_automatic_models:boolean
    })=>r.permitted_for_automatic_models!==false) ||
       examples.some((r:{scoring_eligible:boolean;model_input_approved:boolean})=>
         r.scoring_eligible!==false||r.model_input_approved!==false))
      throw new Error("SEC model metric registry out of sync or improperly authorised");
    return Response.json({
      policy:"sec.metric.priority.v1",summary:rows,
      examples,modelScoringEnabled:false,automaticModelConsumptionEnabled:false,
      separateProviderRatioInputs:[
        "FUND_PE_TTM","FUND_PB","FUND_PS_TTM","FUND_EV_EBITDA_TTM",
        "FUND_FCF_YIELD_TTM","FUND_ROE_TTM","FUND_ROIC_TTM",
        "FUND_GROSS_MARGIN_TTM","FUND_NET_MARGIN_TTM","FUND_DEBT_EQUITY",
        "FUND_CURRENT_RATIO",
      ],
      exclusions:"No DCF model here. Pre-calculated FUND ratios are an independent source and cannot be manufactured from the original SEC metric workbench.",
    },{headers:{"Cache-Control":"no-store"}});
   }catch{
    return Response.json({error:"SEC model priority audit unavailable"},{
      status:503,headers:{"Cache-Control":"no-store"},
    });
   }
  }
 }}
});
