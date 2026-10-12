import {createServerFn} from "@tanstack/react-start";

export interface IssuerReconciliationEvidence {
 symbol:string;periodEnd:string;basis:string;value:string;unit:string;
 evidenceKind:string;accession:string;sourceUrl:string|null;
 originalPeriodAccession:string;originalPeriodUrl:string|null;
 label:string;location:string;caveat:string;checkedAt:string;
 existingDirectTag:string|null;existingDirectAmount:string|null;
 eligible:false;
}
type SourceRow={
 symbol:string;reported_period_end:string;metric_basis:string;
 reported_value:string|number;unit:string;evidence_kind:string;
 evidence_accession:string;evidence_url:string|null;
 period_original_accession:string;original_period_10k_url:string|null;
 evidence_line_label:string;statement_location:string;
 comparison_caveat:string;source_checked_at:string;
 existing_direct_fact_tag:string|null;existing_direct_fact_amount:string|number|null;
 model_eligible:boolean;score_eligible:boolean;
 accounting_policy_version:string;
};

/** Owner-only original issuer line reconciliation. Read-only, never scoring. */
export const getSecIssuerReconciliationReview=createServerFn({method:"POST"})
 .inputValidator((data:{accessToken?:string})=>data)
 .handler(async({data}):Promise<{
  rows:IssuerReconciliationEvidence[];
  evidenceCount:number;accountingVersion:"sec.issuer.reconciliation.v1";
  sourceCheckedNotModelReady:true;
 }>=>{
  const {checkOwnerAccess}=await import("@/lib/security/owner-access.server");
  if(!data.accessToken)throw new Error("Owner session required");
  const owner=await checkOwnerAccess(new Request("https://internal.invalid/sec-reconciliation",{
   method:"POST",headers:{Authorization:"Bearer "+data.accessToken},
  }));
  if(!owner.ok)throw new Error(owner.error);
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
  const result=await supabaseAdmin.from("sec_issuer_reconciliation_review" as "assets")
   .select("*").order("symbol",{ascending:true})
   .order("reported_period_end",{ascending:false}).limit(150);
  if(result.error)throw new Error("Issuer reconciliation view unavailable: "+result.error.message);
  const rows=((result.data??[]) as unknown as SourceRow[]).map((v):IssuerReconciliationEvidence=>{
   if(v.model_eligible!==false||v.score_eligible!==false||
      v.accounting_policy_version!=="sec.issuer.reconciliation.v1")
     throw new Error("Unexpected issuer evidence permission or policy state");
   const official=(url:string|null):string|null=>
     typeof url==="string"&&/^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/\d+\/\d+\/[\w.-]+$/.test(url)?url:null;
   return{
    symbol:v.symbol,periodEnd:v.reported_period_end,basis:v.metric_basis,
    value:String(v.reported_value),unit:v.unit,
    evidenceKind:v.evidence_kind,accession:v.evidence_accession,
    sourceUrl:official(v.evidence_url),
    originalPeriodAccession:v.period_original_accession,
    originalPeriodUrl:official(v.original_period_10k_url),
    label:v.evidence_line_label,location:v.statement_location,
    caveat:v.comparison_caveat,checkedAt:v.source_checked_at,
    existingDirectTag:v.existing_direct_fact_tag,
    existingDirectAmount:v.existing_direct_fact_amount===null?null:String(v.existing_direct_fact_amount),
    eligible:false,
   };
  });
  return{rows,evidenceCount:rows.length,
   accountingVersion:"sec.issuer.reconciliation.v1",sourceCheckedNotModelReady:true};
 });
