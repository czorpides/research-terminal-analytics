import {createServerFn} from "@tanstack/react-start";

export interface SecOriginalBasisEvidence {
  symbol:string;periodEnd:string;metricCode:string;
  accession:string;secTag:string|null;
  observedBasis:string;sourceUrl:string|null;
  firstObserved:string;basisVersion:string;
  originalValue:number|null;unit:string|null;
  unresolvedNote:string;
  peerComparable:false;scoringEligible:false;
}
interface DbRow {
  symbol:string;period_end:string;metric_code:string;
  accession:string;sec_tag:string|null;observed_basis:string;
  source_document_url:string|null;fact_first_observed:string;
  basis_version:string;original_value:number|null;unit:string|null;
  unresolved_semantic_note:string;
  peer_comparable:boolean;scoring_eligible:boolean;
}

/** Explicit owner-only raw SEC basis inspection, without modifying evidence. */
export const getSecOriginalBasisEvidence=createServerFn({method:"POST"})
 .inputValidator((input:{accessToken?:string})=>input)
 .handler(async({data}):Promise<{
   rows:SecOriginalBasisEvidence[];
   version:"sec.original.basis.v1";
   allUnreconciled:true;
 }>=>{
   const {checkOwnerAccess}=await import("@/lib/security/owner-access.server");
   if(!data.accessToken)throw new Error("Owner sign-in required");
   const owner=await checkOwnerAccess(new Request("https://internal.invalid/sec-basis",{
     method:"POST",headers:{Authorization:"Bearer "+data.accessToken},
   }));
   if(!owner.ok)throw new Error(owner.error);
   const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
   // Explicit exception set provides practical direct original-filing references
   // without pulling every issuer's historic SEC filing payload into the UI.
   const sampleSymbols=["AVGO","PNC","WMT","WFC","GS","MS","BLK","SPGI"];
   const result=await supabaseAdmin
     .from("sec_original_fact_basis_audit" as "assets")
     .select("symbol,period_end,metric_code,accession,sec_tag,observed_basis,source_document_url,fact_first_observed,basis_version,original_value,unit,unresolved_semantic_note,peer_comparable,scoring_eligible")
     .in("symbol",sampleSymbols)
     .in("metric_code",["STMT_REVENUE","STMT_NET_INCOME","STMT_WEIGHTED_AVG_SHARES"])
     .order("symbol",{ascending:true})
     .order("period_end",{ascending:false})
     .limit(150);
   if(result.error)throw new Error("Original SEC semantic provenance unavailable: "+result.error.message);
   const rows=((result.data??[]) as unknown as DbRow[]).map((r):SecOriginalBasisEvidence=>{
     if(r.peer_comparable!==false||r.scoring_eligible!==false||
       r.basis_version!=="sec.original.basis.v1")
       throw new Error("SEC semantic evidence missing conservative gating");
     return{
       symbol:r.symbol,periodEnd:r.period_end,metricCode:r.metric_code,
       accession:r.accession,secTag:r.sec_tag,observedBasis:r.observed_basis,
       sourceUrl:r.source_document_url,firstObserved:r.fact_first_observed,
       basisVersion:"sec.original.basis.v1",
       originalValue:r.original_value===null?null:Number(r.original_value),
       unit:r.unit,unresolvedNote:r.unresolved_semantic_note,
       peerComparable:false,scoringEligible:false,
     };
   });
   return{rows,version:"sec.original.basis.v1",allUnreconciled:true};
 });
