/**
 * Swing recovery is gated in stages: code merge != provider entitlement,
 * schedule activation != price freshness, and a heartbeat != trusted signals.
 * Pure evaluator consumed by tests and the documented operator checklist.
 */
export const SWING_RECOVERY_VERSION="swing.ops.recovery.gated.v1" as const;
export interface SwingRecoveryEvidence {
  checkedAt:string;
  latestPriceDate:string|null;
  latestTechnicalScreenDate:string|null;
  activeEquities:number;
  totalTechnicalScreens:number;
  fresh90BarScreens:number;
  scheduledJobs:number;
  providerCredentialPresent:boolean;
  providerEntitlementVerified:boolean;
  providerQuotaVerified:boolean;
  internalJobSecretPresent:boolean;
  privilegedEndpointRejectsPublishableKey:boolean;
  deployedCommitMatchesReviewedMain:boolean;
  boundedDatedIngestSucceeded:boolean;
  technicalScreenRebuiltFromSourceBars:boolean;
  monitorHeartbeatFresh:boolean;
}
export function evaluateSwingRecovery(e:SwingRecoveryEvidence){
 if(!Number.isFinite(Date.parse(e.checkedAt)))
  throw new Error("Swing preflight requires a real UTC observation time");
 for(const n of [e.activeEquities,e.totalTechnicalScreens,e.fresh90BarScreens,e.scheduledJobs]){
  if(!Number.isSafeInteger(n)||n<0)throw new Error("Invalid operator evidence count");
 }
 if(e.fresh90BarScreens>e.activeEquities)
  throw new Error("Ready coverage cannot exceed managed population");
 const serviceConfigured=e.internalJobSecretPresent&&
  e.privilegedEndpointRejectsPublishableKey&&e.deployedCommitMatchesReviewedMain;
 const sourceReady=e.providerCredentialPresent&&e.providerEntitlementVerified&&e.providerQuotaVerified;
 const canTrialSingleDate=serviceConfigured&&sourceReady;
 const verifiedDateEvidence=canTrialSingleDate&&e.boundedDatedIngestSucceeded&&
  e.technicalScreenRebuiltFromSourceBars&&e.fresh90BarScreens>=Math.ceil(e.activeEquities*.95)&&
  e.activeEquities>=2950;
 const cronReady=verifiedDateEvidence;
 const engineOperational=cronReady&&e.scheduledJobs>=2&&e.monitorHeartbeatFresh;
 const blockers:string[]=[];
 if(!e.providerCredentialPresent)blockers.push("Provider API credential absent in target runtime");
 if(!e.providerEntitlementVerified)blockers.push("Official provider market-data entitlement not probed");
 if(!e.providerQuotaVerified)blockers.push("Provider daily quota / reserve not confirmed");
 if(!e.internalJobSecretPresent)blockers.push("Server-only internal job secret missing");
 if(!e.privilegedEndpointRejectsPublishableKey)blockers.push("Privileged ingest still allows public Supabase key or auth test missing");
 if(!e.deployedCommitMatchesReviewedMain)blockers.push("Runtime commit differs from CI-reviewed main");
 if(!e.boundedDatedIngestSucceeded)blockers.push("No bounded original market-date ingestion acceptance");
 if(!e.technicalScreenRebuiltFromSourceBars)blockers.push("No post-ingest technical screen source-date reconciliation");
 if(e.activeEquities<2950||e.fresh90BarScreens<Math.ceil(e.activeEquities*.95))
  blockers.push("At least 95% of the 2950+ managed universe lacks verified current 90-bar coverage");
 if(e.scheduledJobs<2)blockers.push("No verified daily EOD and Swing monitor scheduled jobs");
 if(!e.monitorHeartbeatFresh)blockers.push("No fresh successful scheduled Swing monitor heartbeat");
 return {
  version:SWING_RECOVERY_VERSION,
  dateEvidence:{prices:e.latestPriceDate,technicalScreen:e.latestTechnicalScreenDate,asOf:e.checkedAt},
  preliminaryOneDateIngestionAllowed:canTrialSingleDate,
  scheduleActivationAllowed:cronReady,
  swingOperational:engineOperational,
  verificationRequired:!engineOperational,
  blockers,
  writes:0 as const,
  neverAutomaticallyChangesCron:true as const,
  neverBackdatesPrices:true as const,
 };
}
