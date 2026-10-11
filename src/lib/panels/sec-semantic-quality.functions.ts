import { createServerFn } from "@tanstack/react-start";
import {
  assessSecSemanticQuality,type SecSemanticAuditRow,type SecSemanticAssessment,
} from "@/lib/ingestion/sec/semantic-assessment";

/** Owner-only. This is independent of Radar, fundamental valuation, and
 * live data_points. It does not update any financial facts or eligibility.
 */
export const getSecSemanticQualityReview=createServerFn({method:"POST"})
  .inputValidator((input:{accessToken?:string})=>input)
  .handler(async({data}):Promise<{
    rows:SecSemanticAssessment[];
    issuers:number;requiresSourceRepair:number;
    missingCoreMetrics:number;shareOrTagReview:number;
    awaitingReconciliation:number;unavailable:number;modelReady:0;
  }>=>{
    const {checkOwnerAccess}=await import("@/lib/security/owner-access.server");
    if(typeof data.accessToken!=="string"||!data.accessToken)
      throw new Error("Owner session required for SEC accounting quality report");
    const owner=await checkOwnerAccess(new Request("https://internal.invalid/sec-semantics",{
      method:"POST",headers:{Authorization:"Bearer "+data.accessToken},
    }));
    if(!owner.ok)throw new Error(owner.error);
    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    const result=await supabaseAdmin.from("sec_semantic_quality_review" as "assets")
      .select("*").limit(500);
    if(result.error)throw new Error("SEC semantic quality view unavailable: "+result.error.message);
    const rows=((result.data??[]) as unknown as SecSemanticAuditRow[])
      .map(assessSecSemanticQuality)
      .sort((a,b)=>{
        const priority:Record<SecSemanticAssessment["status"],number>={
          source_incomplete:0,missing_metrics:1,comparability_review:2,
          unavailable:3,awaiting_reconciliation:4,
        };
        return priority[a.status]-priority[b.status]||a.symbol.localeCompare(b.symbol);
      });
    return{
      rows,issuers:rows.length,
      requiresSourceRepair:rows.filter(x=>x.status==="source_incomplete").length,
      missingCoreMetrics:rows.filter(x=>x.status==="missing_metrics").length,
      shareOrTagReview:rows.filter(x=>x.status==="comparability_review").length,
      awaitingReconciliation:rows.filter(x=>x.status==="awaiting_reconciliation").length,
      unavailable:rows.filter(x=>x.status==="unavailable").length,
      modelReady:0,
    };
  });
