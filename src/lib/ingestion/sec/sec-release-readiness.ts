/**
 * Phase 2J24 — reproducible release/rollout status, never self-certification.
 * CI, deployment, owner-login and source sign-off are EXTERNAL attestations.
 * A pure function cannot truthfully claim a browser or production deploy ran.
 */
import {reviewAllSecMethodologies} from "./sec-methodology-gates.ts";
import {runSecIndependentCodePathValidation} from "./sec-independent-codepath-checks.ts";
import {compareLegacyMagicToSecDraft} from "./sec-legacy-shadow-bridge.ts";
export const SEC_2J24_VERSION="sec.release.2j21_24.preproduction_readiness.v1" as const;
export type RuntimeAcceptance={
 gitCommit:string|null;
 ciFrontendPassed:boolean;
 ciPythonPassed:boolean;
 ciContainerPassed:boolean;
 deployedCommitVerified:boolean;
 ownerBrowserRouteVerified:boolean;
 ownerApiAuthenticationVerified:boolean;
 ownerApiOriginalLedgerVerified:boolean;
 humanSourceReviewerAttested:boolean;
};
const NEVER_TESTED:RuntimeAcceptance={
 gitCommit:null,ciFrontendPassed:false,ciPythonPassed:false,
 ciContainerPassed:false,deployedCommitVerified:false,
 ownerBrowserRouteVerified:false,ownerApiAuthenticationVerified:false,
 ownerApiOriginalLedgerVerified:false,humanSourceReviewerAttested:false,
};
const required=[
 "source_original_and_known_at","sector_methodology_policy","complete_debt_and_nonlease_finance",
 "reviewed_operating_cash_and_investments","lease_financing_and_ebit_symmetry",
 "contract_assets_and_acquisition_overlap","all_market_classes_asof",
 "independent_human_accounting_reviewer","pilot_issuer_out_of_sample_acceptance",
] as const;
export function assessSecResearchRelease(
 external:Partial<RuntimeAcceptance>={},
){
 const e={...NEVER_TESTED,...external};
 if(e.gitCommit!==null&&!/^[0-9a-f]{40}$/.test(e.gitCommit))
  throw Error("Release verification requires a full immutable SHA");
 const methodology=reviewAllSecMethodologies();
 const validation=runSecIndependentCodePathValidation();
 const shadows=methodology.map(m=>compareLegacyMagicToSecDraft(m.issuer,null));
 if(methodology.some(x=>x.productionEligible||x.scoringEligible)||
  shadows.some(x=>x.canPromoteSecToScoring||x.canWriteStatementMetrics)||
  validation.modelPromotionAllowed)
  throw Error("Unreviewed SEC values could enter production scores");
 const ci=e.ciFrontendPassed&&e.ciPythonPassed&&e.ciContainerPassed&&e.gitCommit!==null;
 const live=e.deployedCommitVerified&&e.ownerBrowserRouteVerified&&
  e.ownerApiAuthenticationVerified&&e.ownerApiOriginalLedgerVerified;
 const accounting=methodology.every(m=>m.unresolvedIds.length===0)&&
  e.humanSourceReviewerAttested&&validation.checksFailed===0;
 const pending=[
  ...(validation.checksFailed?["Fix second-path original SEC arithmetic mismatches"]:[]),
  ...(!e.ciFrontendPassed?["Frontend production build, typecheck and SEC tests"]:[]),
  ...(!e.ciPythonPassed?["Python analytics tests"]:[]),
  ...(!e.ciContainerPassed?["Standalone Docker smoke tests"]:[]),
  ...(!e.deployedCommitVerified?["Verify production runtime SHA matches CI-validated commit"]:[]),
  ...(!e.ownerBrowserRouteVerified?["Perform authenticated owner browser acceptance of SEC workbench"]:[]),
  ...(!e.ownerApiAuthenticationVerified?["Verify read-only owner API rejects other accounts and unauthenticated callers"]:[]),
  ...(!e.ownerApiOriginalLedgerVerified?["Verify live original 10-K provenance / known_at fields against actual DB ledger"]:[]),
  ...(!e.humanSourceReviewerAttested?["Obtain distinct original 10-K accountant reviewer sign-off"]:[]),
  ...methodology.flatMap(m=>m.unresolvedIds.map(id=>m.issuer+": "+id)),
 ];
 const outcome=ci&&live&&accounting?"preproduction_checks_complete_but_model_promotion_requires_separate_pr":
  "research_only_release_blocked";
 return{
  version:SEC_2J24_VERSION,
  firstFourPhasePass:{
   phase2J21VersionedDraftAccountingPolicy:methodology.length===5,
   phase2J22SecondImplementationArithmetic:validation.validationComplete,
   phase2J23LegacyReadOnlyBridge:shadows.length===5&&
    shadows.every(x=>!x.canPromoteSecToScoring),
   phase2J24ReleaseChecklistReady:true,
  },
  CI:{verified:ci,commit:e.gitCommit,
   frontend:e.ciFrontendPassed,python:e.ciPythonPassed,
   container:e.ciContainerPassed},
  productionAcceptance:{verified:live,
   deployedCommit:e.deployedCommitVerified,ownerBrowser:e.ownerBrowserRouteVerified,
   ownerAuth:e.ownerApiAuthenticationVerified,
   originalLedger:e.ownerApiOriginalLedgerVerified},
  accountingReview:{
   complete:accounting,
   humanAttested:e.humanSourceReviewerAttested,
   automatedChecksPassed:validation.checksPassed,
   automatedChecksFailed:validation.checksFailed,
   reviewedCompanies:methodology.length,
  },
  evidenceRequirements:required,
  pending,
  outcome,
  productionScoringActivated:false as const,
  historicalModelChanged:false as const,
  ingestedStatementFactsModified:false as const,
  databaseWrites:0 as const,
 };
}