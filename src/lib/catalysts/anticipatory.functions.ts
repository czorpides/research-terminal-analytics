import { createServerFn } from "@tanstack/react-start";
import { assessAnticipation, compareEligibilityEvidence, ANTICIPATION_VERSION,
  type AnticipationAssessment, type AnticipationHypothesis, type EligibilityProgress } from "./anticipatory-model";

export interface AnticipatoryCandidate {
  id:string;
  symbol:string;
  companyName:string;
  hypothesisKey:string;
  hypothesisType:AnticipationHypothesis["hypothesis_type"];
  headline:string;
  evidenceUrl:string;
  firstObservedAt:string;
  lastReviewedAt:string;
  targetAt:string|null;
  verificationStatus:AnticipationHypothesis["verification_status"];
  assessment:AnticipationAssessment;
  progress:EligibilityProgress|null;
}
export interface AnticipatoryWorkspace {
  mode:"shadow";
  modelVersion:string;
  asOf:string;
  reviewed:number;
  awaitingReview:number;
  qualifiedForResearch:number;
  rows:AnticipatoryCandidate[];
  note:string;
}

export const getAnticipatoryCatalysts=createServerFn({method:"GET"}).handler(
  async ():Promise<AnticipatoryWorkspace>=>{
    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    // Additive staging migration; deliberately isolated from the event workspace.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db=supabaseAdmin as any;
    const {data,error}=await db.from("catalyst_anticipations")
      .select("id,asset_id,hypothesis_key,hypothesis_type,headline,source_name,source_url,source_published_at,first_observed_at,last_reviewed_at,target_at,expires_at,status,verification_status,verified_at,criteria")
      .order("last_reviewed_at",{ascending:false}).limit(150);
    if(error)throw new Error("Anticipatory evidence store unavailable");
    const hypotheses=(data??[]) as AnticipationHypothesis[];
    const ids=[...new Set(hypotheses.map(h=>h.asset_id))];
    const {data:assets,error:assetError}=ids.length
      ?await supabaseAdmin.from("assets").select("id,symbol,name").in("id",ids)
      :{data:[],error:null};
    if(assetError)throw new Error("Anticipatory asset mapping unavailable");
    const names=new Map((assets??[]).map(a=>[a.id,{symbol:a.symbol,name:a.name}]));
    const now=new Date();
    // Keep the latest revision visible while comparing earlier independently verified snapshots.
    const ordered=[...hypotheses].sort((a,b)=>b.first_observed_at.localeCompare(a.first_observed_at));
    const byAssetType=new Map<string,AnticipationHypothesis[]>();
    for(const h of ordered){const key=`${h.asset_id}:${h.hypothesis_type}`;
      byAssetType.set(key,[...(byAssetType.get(key)??[]),h]);}
    const current=[...byAssetType.values()].map(all=>({
      newest:all[0],prior:all.slice(1).find(h=>h.verification_status==="verified")??null,
    }));
    const rows=current.map(({newest:h,prior})=>{
      const asset=names.get(h.asset_id);
      return {
        id:h.id,symbol:asset?.symbol??"UNMAPPED",companyName:asset?.name??"Unknown instrument",
        hypothesisKey:h.hypothesis_key,hypothesisType:h.hypothesis_type,
        headline:h.headline,evidenceUrl:h.source_url,
        firstObservedAt:h.first_observed_at,lastReviewedAt:h.last_reviewed_at,
        targetAt:h.target_at,verificationStatus:h.verification_status,
        assessment:assessAnticipation(h,now),
        progress:prior?compareEligibilityEvidence(prior,h,now):null,
      };
    });
    // Sort by research readiness, not fabricated expected return.
    const rank:Record<AnticipationAssessment["state"],number>={
      criteria_pass_review:0,investigate:1,insufficient:2,unverified:3,
      blocked:4,stale:5,expired:6,closed:7,not_yet_known:8,
    };
    rows.sort((a,b)=>rank[a.assessment.state]-rank[b.assessment.state]
      ||b.lastReviewedAt.localeCompare(a.lastReviewedAt));
    return {mode:"shadow",modelVersion:ANTICIPATION_VERSION,asOf:now.toISOString(),
      reviewed:rows.filter(r=>r.verificationStatus==="verified").length,
      awaitingReview:rows.filter(r=>r.verificationStatus==="candidate").length,
      qualifiedForResearch:rows.filter(r=>r.assessment.state==="criteria_pass_review").length,
      rows,
      note:"Documented eligibility is a research flag, never an inclusion forecast. Probabilities and Swing ranking adjustments are disabled.",
    };
  }
);
