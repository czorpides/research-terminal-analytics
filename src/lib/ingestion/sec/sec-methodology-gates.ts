/**
 * Phase 2J21 — methodology freeze and reviewed-source gate policy.
 *
 * "Selected" means a consistent draft convention for RESEARCH, not approval
 * of issuer numbers, economic invested capital, or a production model.
 */
import {
 reconcileSoftwareFiscalEvidence,
 SEC_2J20_ASOF,
} from "./software-fy-source-gap-closure.ts";
import {getSec2J14Reconciliation} from "./latest-asof-reconciliation.ts";
import {SEC_MAGIC_FORMULA_POLICY_V1} from "./magic-formula-policy-draft.ts";
import type {SoftwareHoldout} from "./rd-rollforward-third-issuer.ts";
export const SEC_2J21_VERSION="sec.governance.methodology.v1.draft" as const;
export type ReviewSubject=SoftwareHoldout|"COST"|"AMZN";
export type EvidenceStatus="original_sec_crossfoot"|"requires_policy_review"|"not_available"|"independent_review_pending";
export type Requirement={
 id:string;meaning:string;status:EvidenceStatus;resolved:boolean;
 issuerSource:string|null;approvalRequired:boolean;missingReason:string|null;
};
export type MethodologyReview={
 issuer:ReviewSubject;version:typeof SEC_2J21_VERSION;knownAt:"2026-10-09T20:00:00Z";
 policy:{
  earnings:"gaap_operating_income_no_adjusted_rent_or_rd_ebit";
  operatingLease:"rent_in_gaap_expense_exclude_operating_lease_liabilities_from_ev";
  financeLease:"separate_borrowing_and_rou_consistently_only_when_verified";
  customerDeposits:"deferred_revenue_in_operating_liabilities_pending_cost_to_serve";
  acquisitions:"gaap_book_assets_no_intangible_or_goodwill_double_count";
  research:"gaap_rd_expensed_and_hypothetical_fy_amortization_shadow_only";
  surplusCash:"null_until_operating_reserve_and_distributability_review";
  capital:"do_not_compute_without_cash_debt_and_contract_asset_splits";
  sector:"software_only_shadow_not_magic_formula_industrial_roc";
 };
 evidence:Requirement[];
 unresolvedIds:string[];
 reviewComplete:false;
 independentHumanReviewer:false;
 operatingCapitalUsd:null;
 productionEligible:false;scoringEligible:false;storedChanges:0;
};
const POLICY={
 earnings:"gaap_operating_income_no_adjusted_rent_or_rd_ebit",
 operatingLease:"rent_in_gaap_expense_exclude_operating_lease_liabilities_from_ev",
 financeLease:"separate_borrowing_and_rou_consistently_only_when_verified",
 customerDeposits:"deferred_revenue_in_operating_liabilities_pending_cost_to_serve",
 acquisitions:"gaap_book_assets_no_intangible_or_goodwill_double_count",
 research:"gaap_rd_expensed_and_hypothetical_fy_amortization_shadow_only",
 surplusCash:"null_until_operating_reserve_and_distributability_review",
 capital:"do_not_compute_without_cash_debt_and_contract_asset_splits",
 sector:"software_only_shadow_not_magic_formula_industrial_roc",
} as const;
const requirement=(id:string,meaning:string,status:EvidenceStatus,source:string|null,
 missingReason:string|null):Requirement=>({
 id,meaning,status,issuerSource:source,
 resolved:status==="original_sec_crossfoot",
 approvalRequired:status!=="original_sec_crossfoot",missingReason,
});
export function reviewSecMethodology(issuer:ReviewSubject):MethodologyReview{
 if(issuer!=="ADBE"&&issuer!=="ADSK"&&issuer!=="NOW"&&
  issuer!=="COST"&&issuer!=="AMZN")throw Error("Issuer not in SEC accounting gate cohort");
 const researchOriginal=issuer==="ADBE"||issuer==="ADSK"||issuer==="NOW"?
  reconcileSoftwareFiscalEvidence(issuer):null;
 const ref=issuer==="COST"?getSec2J14Reconciliation("COST"):
  issuer==="AMZN"?null:null;
 if(researchOriginal&&(!researchOriginal.gates.originalStatementArithmeticChecksPassed||
   researchOriginal.gates.modelEligible!==false))
  throw Error("SEC original research source gate lost");
 const source=researchOriginal?.official10K??ref?.financialSource.originalUrl??
  "https://www.sec.gov/Archives/edgar/data/1018724/000101872426000004/amzn-20251231.htm";
 const isSoftware=issuer==="ADBE"||issuer==="ADSK"||issuer==="NOW";
 const cashMissing=researchOriginal?.liquidity.reviewedFreelyAvailableCashMillions===null||
  ref?.controls.nonOperatingCashReviewed===false||issuer==="AMZN";
 const financeOk=researchOriginal?researchOriginal.finance.explicitFinanceLeaseMillions!==null:
  issuer==="COST";
 const reqs=[
  requirement("original_filing","Original issuer, FY and GAAP operating-income figures arithmetically checked",
   "original_sec_crossfoot",source,null),
  requirement("surplus_cash","Minimum operating reserve, restrictions and truly surplus cash",
   cashMissing?"requires_policy_review":"original_sec_crossfoot",source,
   cashMissing?"Cash source statements are not an approved distributability or reserve analysis":null),
  requirement("financing_perimeter","Complete borrowed money, finance leases, other claims and NCI",
   "requires_policy_review",source,
   issuer==="AMZN"?"Short facilities and fulfilment financing obligations not reconciled":
   financeOk?"NCI, other claims and debt completion not independently reviewed":
   "Finance lease and other financing claims not complete"),
  requirement("contract_assets","Current/noncurrent contracts, capitalization overlap and revenue obligations",
   isSoftware?"requires_policy_review":"not_available",source,
   isSoftware?"Contract assets, software development and deferred revenue cost-to-serve are unresolved":
   "Not established in this pilot"),
  requirement("lease_matched_earnings","ROU, lease liabilities and earnings treatment on the same policy",
   researchOriginal&&researchOriginal.leases.compatibleCapitalizedLeaseEBITMillions===null?
    "requires_policy_review":"requires_policy_review",source,
   "Rent-inclusive operating income is supported; alternative lease capitalization requires adjustment"),
  requirement("dated_equity_value","A point-in-time complete share-class equity cap from sourced market observations",
   "requires_policy_review",null,
   "Public shares are prior-period snapshots; time-aligned exact capitalization unavailable"),
  requirement("sector_fit","Issuer and sector economic-return suitability",
   isSoftware?"requires_policy_review":"independent_review_pending",source,
   isSoftware?"Software cash-excluded tangible capital may be nonpositive":
    "Industrial classification and full capital basis still require reviewer"),
  requirement("independent_reviewer","Distinct accounting reviewer attestation of complete original notes",
   "independent_review_pending",null,
   "Arithmetic cross-footing is not an independent human sign-off"),
 ];
 // The policy remains a "selected draft": the requirements must be closed
 // individually in a future audited/owner-approved release, not inferred.
 const unresolvedIds=reqs.filter(x=>!x.resolved).map(x=>x.id);
 if(unresolvedIds.length<3||SEC_MAGIC_FORMULA_POLICY_V1.reviewState!=="draft_no_model_or_scoring_permission")
  throw Error("Missing governance blockers");
 return {
  issuer,version:SEC_2J21_VERSION,knownAt:SEC_2J20_ASOF,policy:POLICY,evidence:reqs,
  unresolvedIds,reviewComplete:false,independentHumanReviewer:false,
  operatingCapitalUsd:null,productionEligible:false,scoringEligible:false,
  storedChanges:0,
 };
}
export function reviewAllSecMethodologies(){
 return (["ADBE","ADSK","NOW","COST","AMZN"] as const).map(reviewSecMethodology);
}