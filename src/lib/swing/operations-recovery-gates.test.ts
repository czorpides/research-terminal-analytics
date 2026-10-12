import test from "node:test";
import assert from "node:assert/strict";
import {evaluateSwingRecovery,type SwingRecoveryEvidence} from "./operations-recovery-gates.ts";
const baseline:SwingRecoveryEvidence={
 checkedAt:"2026-10-12T12:00:00Z",
 latestPriceDate:"2026-08-08",latestTechnicalScreenDate:"2026-08-07",
 activeEquities:3000,totalTechnicalScreens:3004,fresh90BarScreens:0,scheduledJobs:0,
 providerCredentialPresent:false,providerEntitlementVerified:false,providerQuotaVerified:false,
 internalJobSecretPresent:true,privilegedEndpointRejectsPublishableKey:false,
 deployedCommitMatchesReviewedMain:false,boundedDatedIngestSucceeded:false,
 technicalScreenRebuiltFromSourceBars:false,monitorHeartbeatFresh:false,
};
test("actual connected October 12 status blocks all recovery promotion",()=>{
 const x=evaluateSwingRecovery(baseline);
 assert.equal(x.preliminaryOneDateIngestionAllowed,false);
 assert.equal(x.scheduleActivationAllowed,false);
 assert.equal(x.swingOperational,false);
 assert.equal(x.writes,0);
 assert.equal(x.neverAutomaticallyChangesCron,true);
 assert.ok(x.blockers.some(v=>v.includes("Provider API credential")));
 assert.ok(x.blockers.some(v=>v.includes("scheduled jobs")));
});
test("credential presence alone does not permit any ingestion",()=>{
 const x=evaluateSwingRecovery({...baseline,
  providerCredentialPresent:true,internalJobSecretPresent:true,
 });
 assert.equal(x.preliminaryOneDateIngestionAllowed,false);
 assert.equal(x.scheduleActivationAllowed,false);
});
test("bounded single-day trial can proceed only after trusted endpoint and quota/entitlement",()=>{
 const qualified={...baseline,providerCredentialPresent:true,
  providerEntitlementVerified:true,providerQuotaVerified:true,
  privilegedEndpointRejectsPublishableKey:true,deployedCommitMatchesReviewedMain:true,
 };
 const x=evaluateSwingRecovery(qualified);
 assert.equal(x.preliminaryOneDateIngestionAllowed,true);
 assert.equal(x.scheduleActivationAllowed,false);
 assert.equal(x.swingOperational,false);
});
test("do not enable cron until price date and 95% checked market coverage verified",()=>{
 const ready={...baseline,providerCredentialPresent:true,providerEntitlementVerified:true,
  providerQuotaVerified:true,privilegedEndpointRejectsPublishableKey:true,
  deployedCommitMatchesReviewedMain:true,boundedDatedIngestSucceeded:true,
  technicalScreenRebuiltFromSourceBars:true,
  fresh90BarScreens:2850,
 };
 assert.equal(evaluateSwingRecovery(ready).scheduleActivationAllowed,true);
 assert.equal(evaluateSwingRecovery(ready).swingOperational,false);
 const operating=evaluateSwingRecovery({...ready,scheduledJobs:2,monitorHeartbeatFresh:true});
 assert.equal(operating.swingOperational,true);
 assert.equal(operating.verificationRequired,false);
});
test("reject invalid audited counts and as-of",()=>{
 assert.throws(()=>evaluateSwingRecovery({...baseline,fresh90BarScreens:3001}),/cannot exceed/);
 assert.throws(()=>evaluateSwingRecovery({...baseline,scheduledJobs:-1}),/Invalid/);
 assert.throws(()=>evaluateSwingRecovery({...baseline,checkedAt:"broken"}),/real UTC/);
});
