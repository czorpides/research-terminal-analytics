/**
 * Outcome validation for anticipatory catalysts.  No reconstructed probability,
 * market return, or retroactive "hit" may be assigned without original
 * timestamped evidence and an independently sourced future outcome.
 */
import { assessAnticipation, type AnticipationHypothesis } from "./anticipatory-model.ts";

export const CATALYST_VALIDATION_VERSION="company.catalyst.outcome-study.v0.1";
export type OutcomeLabel="announced_addition"|"not_added_complete_membership"|"unresolved";
export interface HistoricalCatalystCase {
  caseId:string;
  assetId:string;
  symbol:string;
  hypothesisType:AnticipationHypothesis["hypothesis_type"];
  evaluationAt:string;
  outcome:OutcomeLabel;
  outcomeObservedAt:string|null;
  outcomeSourceUrl:string|null;
  /** Negative class requires full membership census, not absence in press releases. */
  completeMembershipEvidence:boolean;
}
export interface HistoricalCaseResult {
  caseId:string;
  symbol:string;
  evaluationAt:string;
  researchState:"eligible_for_review"|"partial_research"|"blocked"|"no_usable_evidence";
  outcome:OutcomeLabel;
  labelled:boolean;
  eligibleSignal:boolean;
  priorSnapshotId:string|null;
  disqualification:string|null;
}
export interface HistoricalValidationReport {
  version:string;
  cases:number;
  labelled:number;
  excludedUnresolved:number;
  announcedAdditions:number;
  knownNonAdditions:number;
  eligibleSignals:number;
  truePositives:number;
  falsePositives:number;
  falseNegatives:number;
  trueNegatives:number;
  precision:number|null;
  recall:number|null;
  specificity:number|null;
  coverage:number;
  caseResults:HistoricalCaseResult[];
  note:string;
}
const parseTime=(v:string|null)=>v?Date.parse(v):NaN;
const urlOk=(v:string|null)=>{
  try{const u=new URL(v??"");return u.protocol==="https:"&&!u.username&&!u.password;}
  catch{return false;}
};
function mostRecentAt(
  item:HistoricalCatalystCase,history:AnticipationHypothesis[],cutoff:number,
):AnticipationHypothesis|null{
  const eligible=history.filter(h=>
    h.asset_id===item.assetId&&h.hypothesis_type===item.hypothesisType&&
    h.verification_status==="verified"&&h.status==="monitoring"&&
    Number.isFinite(parseTime(h.first_observed_at))&&
    Number.isFinite(parseTime(h.verified_at))&&
    Number.isFinite(parseTime(h.last_reviewed_at))&&
    parseTime(h.first_observed_at)<=cutoff&&parseTime(h.verified_at)<=cutoff&&
    parseTime(h.last_reviewed_at)<=cutoff);
  eligible.sort((a,b)=>b.last_reviewed_at.localeCompare(a.last_reviewed_at));
  return eligible[0]??null;
}
export function validateAnticipatoryHistory(
  cases:HistoricalCatalystCase[],history:AnticipationHypothesis[],
  studyAsOf:Date=new Date(),
):HistoricalValidationReport{
  const observedNow=studyAsOf.getTime();
  const unique=new Set<string>();
  const caseResults:HistoricalCaseResult[]=[];
  for(const item of cases){
    if(unique.has(item.caseId))throw new Error("Repeated historical case identifier: "+item.caseId);
    unique.add(item.caseId);
    const evaluation=parseTime(item.evaluationAt);
    if(!Number.isFinite(evaluation)||evaluation>observedNow)
      throw new Error("Invalid/future evaluation cutoff: "+item.caseId);
    // Outcomes cannot become training labels at a historical date when they
    // were not publicly observable. "Not added" is meaningful only with a
    // COMPLETE dated constituent universe at the end of the event window.
    const futureOutcome=item.outcome!=="unresolved"&&
      Number.isFinite(parseTime(item.outcomeObservedAt))&&
      parseTime(item.outcomeObservedAt)>evaluation&&
      parseTime(item.outcomeObservedAt)<=observedNow&&
      urlOk(item.outcomeSourceUrl)&&
      (item.outcome!=="not_added_complete_membership"||item.completeMembershipEvidence);
    const labelled=Boolean(futureOutcome);
    const outcome:OutcomeLabel=labelled?item.outcome:"unresolved";
    const snapshot=mostRecentAt(item,history,evaluation);
    const state=snapshot?assessAnticipation(snapshot,new Date(evaluation)).state:null;
    const researchState:HistoricalCaseResult["researchState"]=state==="criteria_pass_review"
      ?"eligible_for_review":state==="investigate"?"partial_research":state==="blocked"
        ?"blocked":"no_usable_evidence";
    caseResults.push({caseId:item.caseId,symbol:item.symbol,evaluationAt:item.evaluationAt,
      researchState,outcome,labelled,eligibleSignal:researchState==="eligible_for_review",
      priorSnapshotId:snapshot?.id??null,
      disqualification:!labelled?"No complete, post-cutoff public outcome":!snapshot
        ?"No independently verified pre-cutoff evidence":null});
  }
  const known=caseResults.filter(r=>r.labelled);
  const truePositives=known.filter(r=>r.eligibleSignal&&r.outcome==="announced_addition").length;
  const falsePositives=known.filter(r=>r.eligibleSignal&&r.outcome==="not_added_complete_membership").length;
  const falseNegatives=known.filter(r=>!r.eligibleSignal&&r.outcome==="announced_addition").length;
  const trueNegatives=known.filter(r=>!r.eligibleSignal&&r.outcome==="not_added_complete_membership").length;
  const precision=truePositives+falsePositives>0?truePositives/(truePositives+falsePositives):null;
  const recall=truePositives+falseNegatives>0?truePositives/(truePositives+falseNegatives):null;
  const specificity=trueNegatives+falsePositives>0?trueNegatives/(trueNegatives+falsePositives):null;
  return {version:CATALYST_VALIDATION_VERSION,cases:cases.length,labelled:known.length,
    excludedUnresolved:caseResults.length-known.length,
    announcedAdditions:known.filter(r=>r.outcome==="announced_addition").length,
    knownNonAdditions:known.filter(r=>r.outcome==="not_added_complete_membership").length,
    eligibleSignals:caseResults.filter(r=>r.eligibleSignal).length,
    truePositives,falsePositives,falseNegatives,trueNegatives,
    precision,recall,specificity,coverage:cases.length?known.length/cases.length:0,
    caseResults,
    note:"Eligibility signals reflect documented criteria, not committee-selection probabilities. Empty/incomplete study inputs produce null precision/recall; no inferred trading returns.",
  };
}
