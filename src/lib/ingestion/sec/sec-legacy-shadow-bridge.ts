/**
 * 2J23 — read-only bridge to CURRENT production Magic Formula v0.1 contracts.
 * Refuses to reinterpret operating income as STMT_EBIT, book-note borrowings
 * as STMT_TOTAL_DEBT or financial period-end as first-published known_at.
 * 
 * A valid existing legacy score is NOT approval for the SEC-based model.
 * This module does not import DB writers, ingestion jobs or ranking storage.
 */
import {
 computeMagicFormulaRaw,rankMagicFormula,
 MAGIC_FORMULA_CALC_VERSION,STATEMENT_METRICS,
 type MagicFormulaRawInput,type MagicFormulaRawResult,
} from "../../opportunity/fundamental-models.ts";
import {evaluateSecMagicFormulaDraft,type DraftMagicFormulaAssessment} from "./magic-formula-policy-draft.ts";
import {reviewSecMethodology,type ReviewSubject} from "./sec-methodology-gates.ts";
import {validateSecIssuerSecondPath} from "./sec-independent-codepath-checks.ts";
export const SEC_2J23_VERSION="sec.governance.magic_formula_shadow_bridge.v1" as const;
export const SEC_MODEL_PROMOTION_SWITCH=false as const;
export type SecModelCrosswalkField={
 legacyMetric:string;
 proposedAccountingBasis:string;
 mappingStatus:"blocked_semantics"|"blocked_source"|"blocked_point_in_time";
 requiredEvidence:string;
};
export const SEC_TO_LEGACY_CROSSWALK:readonly SecModelCrosswalkField[]=[
 {legacyMetric:STATEMENT_METRICS.ebit,proposedAccountingBasis:"GAAP operating income proxy",
  mappingStatus:"blocked_semantics",
  requiredEvidence:"Approved match between GAAP operating income, EBIT and period conventions"},
 {legacyMetric:STATEMENT_METRICS.totalDebt,proposedAccountingBasis:"Complete carrying nonlease borrowings plus reviewed separately classified finance leases",
  mappingStatus:"blocked_semantics",
  requiredEvidence:"No missing short-term borrowing, finance lease/NCI or double-counted instrument"},
 {legacyMetric:STATEMENT_METRICS.currentAssets,proposedAccountingBasis:"GAAP current assets with operating/nonoperating split",
  mappingStatus:"blocked_semantics",
  requiredEvidence:"Surplus/restricted/operating cash and noncurrent investments reconciled"},
 {legacyMetric:STATEMENT_METRICS.currentLiabilities,proposedAccountingBasis:"GAAP current liabilities excluding financing and lease components consistently",
  mappingStatus:"blocked_semantics",
  requiredEvidence:"Current and noncurrent leases and borrowing fully mapped"},
 {legacyMetric:STATEMENT_METRICS.netFixedAssets,proposedAccountingBasis:"Net PPE plus unduplicated finance ROU where relevant",
  mappingStatus:"blocked_semantics",
  requiredEvidence:"No double-counted PPE/software/ROU; acquired intangible policy settled"},
 {legacyMetric:"MARKET_CAP",proposedAccountingBasis:"All equity classes at correctly aligned exchange closing snapshot",
  mappingStatus:"blocked_point_in_time",
  requiredEvidence:"Shares issued/outstanding contemporaneously as of market timestamp, not 10-K cover only"},
 {legacyMetric:"SOURCE_KNOWN_AT",proposedAccountingBasis:"Original SEC accepted/first observed timestamp",
  mappingStatus:"blocked_point_in_time",
  requiredEvidence:"Ledger known_at from original SEC source, not the fiscal period end"},
] as const;
export function compareLegacyMagicToSecDraft(
 issuer:ReviewSubject,
 legacyInput:MagicFormulaRawInput|null,
 secDraft:DraftMagicFormulaAssessment|null=null,
){
 const methodology=reviewSecMethodology(issuer);
 const crossChecks=validateSecIssuerSecondPath(issuer);
 // The existing engine may be run in-memory against legacy inputs supplied
 // by its own authorized caller; NEVER fabricate missing fields to force rank.
 const legacy:MagicFormulaRawResult|null=legacyInput===null?null:
  computeMagicFormulaRaw(legacyInput);
 if(legacy&&legacy.assetId!==legacyInput?.assetId)
  throw Error("Legacy input / output identity mismatch");
 const rejectedReasons=[
  ...methodology.unresolvedIds.map(x=>"unapproved:"+x),
  ...(crossChecks.failed?["independent_source_check_failed"]:[]),
  ...(secDraft?.status==="rejected"?["SEC_draft_arithmetic_rejected"]:[]),
  ...(secDraft?.missingFields.length?["SEC_draft_missing_original_items"]:[]),
  "SEC 2J10 evaluator explicitly forbids scoring or model use",
  "Legacy STMT_EBIT, STMT_TOTAL_DEBT and company-specific SEC semantics have not been certified interchangeable",
 ];
 if(secDraft&&(secDraft.modelEligible!==false||secDraft.scoringEligible!==false))
  throw Error("SEC arithmetic preview cannot claim source/model approval");
 // Legacy still may calculate a numerical rank. That alone doesn't permit
 // copying an unapproved SEC preview into the live engine.
 return {
  version:SEC_2J23_VERSION,issuer,
  legacyCalcVersion:MAGIC_FORMULA_CALC_VERSION,
  legacyScoringStatus:legacy===null?"no_authorized_legacy_input":legacy.eligible?
   "legacy_arithmetic_eligible_but_sec_blocked":"legacy_ineligible",
  legacyResult:legacy,
  secDraftStatus:secDraft?.status??"not_submitted",
  crosswalk:SEC_TO_LEGACY_CROSSWALK,
  checkCoverage:{passed:crossChecks.passed,failed:crossChecks.failed,
   humanAttested:crossChecks.secondHumanReviewerSigned},
  reasons:rejectedReasons,
  canPromoteSecToScoring:false as const,
  canWriteStatementMetrics:false as const,
  canGenerateUniverseRank:false as const,
  switchEnabled:SEC_MODEL_PROMOTION_SWITCH,
  databaseChanges:0 as const,
 };
}
/**
 * Dry-run the REAL v0.1 ranker against explicitly supplied LEGACY inputs only,
 * never the 2J17–2J20 source figures or manual 2J11 screenshots.
 * Isolated pure arithmetic; NEVER persists ranks. Independent of SEC policy.
 */
export function dryRunLegacyNoPromotion(
 issuerInputs:Array<{issuer:ReviewSubject;input:MagicFormulaRawInput}>,
){
 const seen=new Set<string>();
 const raw=issuerInputs.map(({issuer,input})=>{
  if(seen.has(input.assetId))throw Error("Duplicate asset in legacy shadow batch");
  seen.add(input.assetId);
  if(issuer!==input.assetId)throw Error("Legacy issuer/source identity mismatch");
  return compareLegacyMagicToSecDraft(issuer,input).legacyResult!;
 });
 const ranks=rankMagicFormula(raw);
 return {
  calculator:MAGIC_FORMULA_CALC_VERSION,
  ranks:ranks.map(r=>({assetId:r.assetId,rawArithmeticEligible:r.eligible,
   wouldHaveBeenRankedByLegacy:r.universeRank!==null,
   legacyRankNumber:r.universeRank,
   permittedForSecScoring:false as const})),
  legacyCanBeEligibleWithoutSecAttestation:raw.some(x=>x.eligible),
  secPromotionAllowed:false as const,
  storedChanges:0 as const,
 };
}