import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { SOURCE_TIER_META } from "@/lib/reliability/tiers";
import { DEFAULT_FRESHNESS } from "@/lib/reliability/freshness";
import {
  getDataHealthOverview,
  getPhase45Health,
  triggerVerifierRun,
} from "@/lib/panels/data-health.functions";
import { getSourceFreshness } from "@/lib/freshness/freshness.functions";
import { getGrowthHealth } from "@/lib/panels/growth-health.functions";
import { getFundamentalsPipelineHealth } from "@/lib/panels/fundamentals-health.functions";
import { getSecEvidenceCoverage } from "@/lib/panels/sec-coverage.functions";
import { getSecSemanticQualityReview } from "@/lib/panels/sec-semantic-quality.functions";
import {getSecOriginalBasisEvidence} from "@/lib/panels/sec-basis-evidence.functions";
import type { SecControlPlan, SecControlledMode } from "@/lib/ingestion/sec/controlled-plan";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { DashboardGrid, DashboardPanel } from "@/components/research/DashboardPanel";
import { InfoTip } from "@/components/research/ResearchContext";
import {
  getReleaseCalendarDashboard,
  type ReleaseCalendarDashboard,
} from "@/lib/panels/release-calendar.functions";

export const Route = createFileRoute("/_authenticated/data-health")({
  head: () => ({
    meta: [
      { title: "Data Health — Research Terminal" },
      {
        name: "description",
        content: "Source tiers, freshness policies, ingestion runs and model governance.",
      },
    ],
  }),
  component: DataHealth,
});

function DataHealth() {
  const fetchOverview = useServerFn(getDataHealthOverview);
  const runVerifier = useServerFn(triggerVerifierRun);
  const fetchFreshness = useServerFn(getSourceFreshness);
  const fetchGrowth = useServerFn(getGrowthHealth);
  const fetchFundamentals = useServerFn(getFundamentalsPipelineHealth);
  const fetchSecEvidence = useServerFn(getSecEvidenceCoverage);
  const fetchSecSemanticAudit = useServerFn(getSecSemanticQualityReview);
  const fetchSecBasis = useServerFn(getSecOriginalBasisEvidence);
  const fetchPhase45 = useServerFn(getPhase45Health);
  const fetchCalendar = useServerFn(getReleaseCalendarDashboard);
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const [ingestAction, setIngestAction] = useState<"sec" | "eodhd" | "preview" | "repair" | "expand" | null>(null);
  const [ingestResult, setIngestResult] = useState<string | null>(null);
  const [queueAction,setQueueAction]=useState(false);
  const [queueMessage,setQueueMessage]=useState<string|null>(null);
  const [finitePreview,setFinitePreview]=useState<{
    candidates:Array<{assetId:string;symbol:string}>;
    eligible:number;verifiedIdentities:number;curatedPoolSize:number;
    coveredThreeYear:number;incompleteHistory:number;untouched:number;
    coolingDown:number;blockedByIntegrity:number;
  }|null>(null);

  const [secPlans, setSecPlans] = useState<{repair:SecControlPlan;expand:SecControlPlan}|null>(null);

  const { data } = useQuery({
    queryKey: ["data-health"],
    queryFn: () => fetchOverview(),
    refetchOnWindowFocus: false,
  });
  const { data: freshness } = useQuery({
    queryKey: ["source-freshness"],
    queryFn: () => fetchFreshness(),
    refetchInterval: 60_000,
  });
  const { data: fundamentals, error: fundamentalHealthError } = useQuery({
    queryKey: ["fundamentals-pipeline-health"],
    queryFn: () => fetchFundamentals(),
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  const { data: secEvidence, error: secEvidenceError } = useQuery({
    queryKey: ["sec-official-filing-coverage"],
    queryFn: async () => {
      const { data: auth, error: sessionError } = await supabase.auth.getSession();
      const accessToken = auth.session?.access_token;
      if (sessionError || !accessToken)
        throw new Error("Owner sign-in required for SEC evidence audit");
      return fetchSecEvidence({ data: { accessToken } });
    },
    refetchInterval: 5 * 60_000,
    retry: 1,
  });
  const { data: secSemanticAudit, error: secSemanticError } = useQuery({
    queryKey:["sec-semantic-quality-review"],
    queryFn:async()=>{
      const {data:auth,error}=await supabase.auth.getSession();
      const accessToken=auth.session?.access_token;
      if(error||!accessToken)throw new Error("Owner sign-in required for SEC semantic quality");
      return fetchSecSemanticAudit({data:{accessToken}});
    },
    refetchInterval:5*60_000,retry:1,
  });

  const {data:secBasis,error:secBasisError}=useQuery({
    queryKey:["sec-accounting-basis-evidence"],
    queryFn:async()=>{
      const {data:auth,error}=await supabase.auth.getSession();
      if(error||!auth.session?.access_token)
        throw new Error("Owner sign-in required for source-basis review");
      return fetchSecBasis({data:{accessToken:auth.session.access_token}});
    },
    refetchInterval:5*60_000,retry:1,
  });

  const { data: secQueue } = useQuery({
    queryKey:["sec-queue-owner"],
    queryFn:async()=>{
      const {headers}=await secOwnerHeaders();
      const response=await fetch("/api/public/ingest/sec-queue",{headers,cache:"no-store"});
      if(!response.ok)throw new Error("SEC queue unavailable");
      return await response.json() as {
        waves:Array<{id:string;state:string;created_at:string}>;
        jobs:Array<{id:string;wave_id:string;symbol:string;state:string;
          attempts:number;new_filings:number;new_facts:number;error:string|null}>;
      };
    },
    refetchInterval:20_000,retry:1,
  });
  const queueActive=secQueue?.waves?.some(w=>
    ["queued","running","paused"].includes(w.state))??false;

  const { data: growth } = useQuery({
    queryKey: ["stage1-growth-health"],
    queryFn: () => fetchGrowth(),
    refetchInterval: 60_000,
  });
  const { data: phase45 } = useQuery({
    queryKey: ["phase4-5-health"],
    queryFn: () => fetchPhase45(),
    refetchInterval: 60_000,
  });
  const { data: calendar } = useQuery({
    queryKey: ["release-calendar", "data-health"],
    queryFn: () => fetchCalendar(),
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  });

  async function onRun() {
    setRunning(true);
    try {
      await runVerifier({ data: {} });
      await qc.invalidateQueries({ queryKey: ["data-health"] });
    } finally {
      setRunning(false);
    }
  }

  async function onManualSourceAction(kind: "sec" | "eodhd") {
    if (ingestAction || (kind==="sec" && queueActive)) return;
    setIngestAction(kind);
    setIngestResult(null);
    try {
      const { data: session, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session.session?.access_token)
        throw new Error("Sign in to your owner account before running a source check.");
      const url = kind === "sec"
        ? "/api/public/ingest/sec-annual"
        : "/api/public/ingest/eodhd-financial-capabilities";
      // Exactly one known active US equity (MSFT), not an automated backfill.
      const body = kind === "sec"
        ? { assetIds: ["e8b1a94b-b7e7-4fb9-981b-72eeee9139db"] }
        : {};
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + session.session.access_token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok && response.status !== 207)
        throw new Error(typeof json?.error === "string"
          ? json.error : "Source request failed (HTTP " + response.status + ")");
      if (kind === "sec") {
        const result = json as {
          filingsInserted?: number;
          factsInserted?: number;
          results?: Array<{symbol?:string;status?:string;reason?:string}>;
        };
        const first = result.results?.[0];
        setIngestResult("SEC original 10-K: " + (first?.symbol ?? "MSFT") +
          " — " + (first?.status ?? "unknown") +
          "; new filings " + (result.filingsInserted ?? 0) +
          "; new facts " + (result.factsInserted ?? 0) +
          (first?.reason ? "; " + first.reason : "") +
          ". No changes to Radar scores.");
        await qc.invalidateQueries({ queryKey: ["fundamentals-pipeline-health"] });
        await qc.invalidateQueries({ queryKey: ["sec-official-filing-coverage"] });
      } else {
        const result = json as {
          configured?:boolean;
          capabilities?: Array<{capability:string;available:boolean;itemsReturned:number;reason:string}>;
        };
        const description = result.capabilities?.map((x) =>
          x.capability + ": " + (x.available ? "available" : "unavailable") +
          " (" + x.itemsReturned + " rows; " + x.reason + ")"
        ).join(" · ");
        setIngestResult(description || "EODHD financial/earnings entitlement not available.");
      }
    } catch (e) {
      setIngestResult(e instanceof Error ? e.message : "Source check failed.");
    } finally {
      setIngestAction(null);
    }
  }

  async function secOwnerHeaders() {
    const { data: auth, error } = await supabase.auth.getSession();
    const token = auth.session?.access_token;
    if(error || !token) throw new Error("Sign in as the owner to access SEC import controls.");
    return {
      token,
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
    };
  }

  async function fetchControlledPlan(
    mode:SecControlledMode,
    headers:Record<string,string>,
  ):Promise<SecControlPlan> {
    const response = await fetch("/api/public/ingest/sec-pilot-candidates?mode="+mode,{
      headers,cache:"no-store",
    });
    const result = await response.json().catch(()=>null) as SecControlPlan & {error?:string}|null;
    if(!response.ok)throw new Error(result?.error || "SEC plan unavailable");
    const max = mode==="repair" ? 2 : 10;
    if(!result || result.mode!==mode || result.maxPerRun!==max ||
       result.maxPerRequest!==2 || !Array.isArray(result.candidates) ||
       result.candidates.length>max ||
       result.candidates.some(x=>typeof x.assetId!=="string" ||
         typeof x.symbol!=="string" || !Number.isInteger(x.existingYears))) {
      throw new Error("Malformed SEC plan; no import permitted.");
    }
    return result;
  }

  async function onPreviewSecWaves() {
    if(ingestAction)return;
    setIngestAction("preview");
    setSecPlans(null);
    setIngestResult("Reading SEC history repair and new-company plans without contacting SEC…");
    try {
      const { headers } = await secOwnerHeaders();
      const [repair,expand]=await Promise.all([
        fetchControlledPlan("repair",headers),
        fetchControlledPlan("expand",headers),
      ]);
      setSecPlans({repair,expand});
      setIngestResult("Preview only: "+repair.candidates.length+" history repairs; "+
        expand.candidates.length+" unstarted issuers available. Confirm a separate manual action below.");
    } catch(e) {
      setIngestResult("SEC preview unavailable: "+(e instanceof Error?e.message:"Unexpected error"));
    } finally {
      setIngestAction(null);
    }
  }

  async function previewFiniteSecBackfill() {
    if(queueAction||ingestAction)return;
    setQueueAction(true);setFinitePreview(null);setQueueMessage(null);
    try{
      const {headers}=await secOwnerHeaders();
      const response=await fetch("/api/public/ingest/sec-finite-backfill",{
        headers,cache:"no-store",
      });
      const data=await response.json().catch(()=>null);
      if(!response.ok)throw new Error(data?.error??"SEC backfill preview failed");
      if(!data||!Array.isArray(data.candidates)||data.eligible!==data.candidates.length||
         data.eligible>100||!Number.isInteger(data.eligible)||
         data.candidates.some((x:unknown)=>typeof x!=="object"||x===null||
           typeof (x as {assetId?:unknown}).assetId!=="string"||
           typeof (x as {symbol?:unknown}).symbol!=="string"))
        throw new Error("Malformed finite SEC preview; approval blocked");
      setFinitePreview(data);
    }catch(e){
      setQueueMessage("Finite preview unavailable: "+
        (e instanceof Error?e.message:"unexpected error"));
    }finally{setQueueAction(false)}
  }

  async function approveFiniteSecBackfill() {
    if(!finitePreview?.candidates.length||queueAction||queueActive||!secQueue)return;
    setQueueAction(true);setQueueMessage(null);
    const requested=finitePreview.candidates.map(c=>c.assetId);
    setFinitePreview(null); // no accidental second approval
    try{
      const {headers}=await secOwnerHeaders();
      const response=await fetch("/api/public/ingest/sec-finite-backfill",{
        method:"POST",headers,body:JSON.stringify({assetIds:requested}),
      });
      const data=await response.json().catch(()=>null);
      if(!response.ok)throw new Error(data?.error??"Finite authorisation rejected");
      setQueueMessage("One-time SEC backfill approved: "+data.accepted+
        " issuers in wave "+data.waveId+
        ". Work continues even if the browser closes; no further batches are auto-created.");
      await qc.invalidateQueries({queryKey:["sec-queue-owner"]});
    }catch(e){
      setQueueMessage("Finite SEC approval was not accepted: "+
        (e instanceof Error?e.message:"unexpected error")+
        ". Preview again to retry.");
    }finally{setQueueAction(false)}
  }

  async function onCreateSecQueue() {
    if(ingestAction||queueAction||queueActive||!secPlans?.expand.candidates.length)return;
    setQueueAction(true);
    setQueueMessage(null);
    try{
      const {headers}=await secOwnerHeaders();
      const data={action:"enqueue",
        assetIds:secPlans.expand.candidates.map(c=>c.assetId)};
      const response=await fetch("/api/public/ingest/sec-queue",{
        method:"POST",headers,body:JSON.stringify(data),
      });
      const result=await response.json().catch(()=>null);
      if(!response.ok)throw new Error(result?.error??"Queue approval refused");
      setSecPlans(null);
      setQueueMessage("Approved "+result.accepted+" issuers in persistent wave "+
        result.waveId+". You may close the browser; progress is stored.");
      await qc.invalidateQueries({queryKey:["sec-queue-owner"]});
    }catch(e){
      setQueueMessage("Queue approval paused: "+
        (e instanceof Error?e.message:"Unknown error")+
        ". No background jobs launched.");
    }finally{setQueueAction(false)}
  }

  async function onControlSecQueue(waveId:string,action:"pause"|"resume"|"cancel") {
    if(queueAction)return;
    setQueueAction(true);setQueueMessage(null);
    try{
      const {headers}=await secOwnerHeaders();
      const response=await fetch("/api/public/ingest/sec-queue",{
        method:"POST",headers,body:JSON.stringify({action,waveId}),
      });
      const r=await response.json().catch(()=>null);
      if(!response.ok)throw new Error(r?.error??"Queue action refused");
      setQueueMessage("SEC wave "+action+" accepted: "+r.state+
        ". Already-running issuer may finish.");
      await qc.invalidateQueries({queryKey:["sec-queue-owner"]});
    }catch(e){
      setQueueMessage(e instanceof Error?e.message:"Queue action failed");
    }finally{setQueueAction(false)}
  }

  async function onRunSecControlled(mode:SecControlledMode) {
    if(ingestAction || queueAction || queueActive || !secPlans)return;
    const approved=secPlans[mode];
    setIngestAction(mode);
    setSecPlans(null); // A second run always requires a fresh, explicit preview.
    let visited=0,filings=0,facts=0,skipped=0,unchanged=0;
    const explanations:string[]=[];
    try {
      const {token,headers}=await secOwnerHeaders();
      // Re-read the plan immediately before work. A change in live coverage,
      // cooldown or issuer identity invalidates the earlier preview.
      const current=await fetchControlledPlan(mode,headers);
      const fingerprint=(p:SecControlPlan)=>JSON.stringify(
        p.candidates.map(c=>[c.assetId,c.symbol,c.existingYears,c.periodEnds]),
      );
      if(fingerprint(approved)!==fingerprint(current))
        throw new Error("The SEC plan changed since preview; preview again before importing.");
      const candidates=current.candidates;
      if(!candidates.length) {
        setIngestResult("No "+mode+" candidates available. No SEC provider requests made.");
        return;
      }
      for(let offset=0;offset<candidates.length;offset+=2) {
        const pair=candidates.slice(offset,offset+2);
        setIngestResult("SEC "+mode+": "+pair.map(p=>p.symbol).join(" / ")+
          " (starting "+(visited+1)+" of "+candidates.length+")…");
        const response=await fetch("/api/public/ingest/sec-annual",{
          method:"POST",headers,
          body:JSON.stringify({assetIds:pair.map(p=>p.assetId)}),
        });
        const result=await response.json().catch(()=>null) as {
          error?:string;filingsInserted?:number;factsInserted?:number;
          results?:Array<{symbol:string;status:string;reason?:string;
            filingsInserted:number;factsInserted:number}>;
        }|null;
        if(!response.ok && response.status!==207)
          throw new Error(result?.error ?? "SEC request failed (HTTP "+response.status+")");
        const outcomes=result?.results ?? [];
        if(outcomes.length!==pair.length ||
           outcomes.some((out,i)=>out.symbol!==pair[i]?.symbol ||
             !["updated","unchanged","skipped","failed"].includes(out.status)))
          throw new Error("SEC returned mismatched issuer results; stop and investigate.");
        const newFiles=Number(result?.filingsInserted);
        const newFacts=Number(result?.factsInserted);
        if(!Number.isSafeInteger(newFiles) || newFiles<0 ||
           !Number.isSafeInteger(newFacts) || newFacts<0)
          throw new Error("SEC totals are invalid; stop and investigate.");
        filings+=newFiles;facts+=newFacts;
        skipped+=outcomes.filter(x=>x.status==="skipped").length;
        unchanged+=outcomes.filter(x=>x.status==="unchanged").length;
        visited+=pair.length;
        // Coverage is re-read from the protected database rather than
        // assuming HTTP 200 or returned ingestion counts mean full history.
        const evidence=await fetchSecEvidence({data:{accessToken:token}});
        for(const p of pair) {
          const row=evidence.rows.find(x=>x.symbol===p.symbol);
          const outcome=outcomes.find(x=>x.symbol===p.symbol)!;
          if(!row && outcome.status!=="skipped")
            throw new Error("No persisted SEC coverage for "+p.symbol+"; pause for investigation.");
          if(row && row.filingYears < p.existingYears)
            throw new Error("SEC coverage unexpectedly declined for "+p.symbol);
          explanations.push(p.symbol+": "+p.existingYears+"→"+
            (row?.filingYears ?? 0)+" FY, "+
            (row?.threeYearHistory?"3-year history available":"partial/unavailable")+
            (outcome.reason?" ("+outcome.reason+")":""));
          if(row && row.ledgerStatus!=="no_structural_flags")
            throw new Error("SEC ledger QA requires review for "+p.symbol+
              "; stop before importing the next pair.");
        }
        await qc.invalidateQueries({queryKey:["fundamentals-pipeline-health"]});
        await qc.invalidateQueries({queryKey:["sec-official-filing-coverage"]});
        setIngestResult("SEC "+mode+": "+visited+"/"+candidates.length+
          " issuers; "+filings+" new filings and "+facts+" facts. "+
          explanations.join(" | "));
        const failed=outcomes.find(x=>x.status==="failed");
        if(failed)
          throw new Error(failed.symbol+" SEC error: "+(failed.reason??"unknown")+
            "; previous completed filing writes remain in place.");
      }
      setIngestResult("SEC "+mode+" completed: "+visited+" issuers; "+filings+
        " new filings, "+facts+" new facts; "+skipped+" skipped, "+
        unchanged+" unchanged. "+explanations.join(" | ")+
        ". Figures still require official filing reconciliation; Radar scores unchanged.");
    } catch(e) {
      setIngestResult("SEC "+mode+" PAUSED after "+visited+" issuers, "+
        filings+" filings, "+facts+" facts: "+
        (e instanceof Error?e.message:"Unexpected error")+
        ". Preview again to resume; no automatic retries.");
    } finally {
      setIngestAction(null);
    }
  }

  return (
    <AppShell>
      <SectionHeader
        code="DH · Data Health & Governance"
        title="Is the underlying data trustworthy right now?"
        purpose="The reliability framework driving every panel's confidence score. Owner-only administration lives here."
      />

      <DashboardPanel
        title="Fundamentals and earnings evidence"
        eyebrow="Measured coverage · provider diagnostics"
        description="Separates ingested SEC/FMP statement evidence, metric coverage and earnings calendars. A successful cron enqueue is not an ingestion result."
        className="mb-6"
      >
        {fundamentalHealthError ? (
          <div className="text-xs text-[var(--negative)]">
            Fundamentals coverage telemetry is unavailable: {fundamentalHealthError.message}
          </div>
        ) : !fundamentals ? (
          <div className="text-xs text-muted-foreground">Loading measured coverage…</div>
        ) : (
          <div className="space-y-3 text-xs">
            <div className="grid gap-3 sm:grid-cols-4">
              {[
                ["Assets with current metrics", fundamentals.assetsWithCurrentMetrics],
                ["Assets with filing history", fundamentals.assetsWithFilings],
                ["Earnings calendar entries", fundamentals.earningsEventCount],
                ["Interrupted ingestion runs", fundamentals.staleFundamentalsRuns],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded border border-border/70 p-2">
                  <div className="text-muted-foreground">{label}</div>
                  <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
                </div>
              ))}
            </div>
            <div className="text-muted-foreground">
              Monitored equities: {fundamentals.activeEquities.toLocaleString()} · Filing records: {fundamentals.filingCount.toLocaleString()} · Latest filing ingestion: {fundamentals.latestFilingIngested ? new Date(fundamentals.latestFilingIngested).toLocaleDateString() : "none"}
            </div>
            <div className="text-muted-foreground">
              FMP provider: {fundamentals.fmpLastStatus ?? "unknown"} · Successful ingestion runs (7d): {fundamentals.successfulRuns7d} · Failed runs (7d): {fundamentals.failedRuns7d}
            </div>
            {fundamentals.warnings.length > 0 && (
              <ul className="list-disc space-y-1 pl-4 text-[var(--warning)]">
                {fundamentals.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            )}
          </div>
        )}
      </DashboardPanel>

      <DashboardPanel
        title="Official-source recovery · manual"
        eyebrow="Owner only · no recurring provider jobs"
        description="Original 10-K filings: one-company verification or manually controlled ten-issuer batches from a curated 100-ticker pool. EODHD financial and earnings subscriptions remain unavailable."
        className="mb-6"
      >
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={ingestAction !== null}
            onClick={() => void onManualSourceAction("sec")}
          >
            {ingestAction === "sec" ? "Checking SEC…" : "Import MSFT SEC 10-K sample"}
          </Button>
          <Button
            variant="outline"
            disabled={ingestAction !== null}
            onClick={() => void onPreviewSecWaves()}
          >
            {ingestAction === "preview" ? "Checking SEC history…" : "Preview SEC repair & expansion"}
          </Button>
          <Button
            variant="outline"
            disabled={ingestAction !== null}
            onClick={() => void onManualSourceAction("eodhd")}
          >
            {ingestAction === "eodhd" ? "Checking entitlement…" : "Check EODHD coverage"}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          SEC: up to three original 10-K years for one company, with first-observed timestamps and no ranking changes.
          SEC coverage: 100 curated candidate tickers. Preview is read-only. Explicit repair runs handle at most 2 incomplete issuers; expansion runs handle at most 10 previously untouched issuers in two-company calls. Keep this page open during imports. Preview again after each run.
          EODHD recheck: optional, up to two metered requests; premium statements and earnings dates are currently unavailable.
        </p>
        {secPlans && (
          <div className="mt-3 space-y-2 rounded border border-border/70 p-3 text-xs">
            <p className="font-semibold">Manual SEC wave preview — no imports performed</p>
            <p>Existing three-year histories: {secPlans.repair.alreadyCovered}. Existing incomplete histories: {secPlans.repair.incompleteHistory}. Not yet imported: {secPlans.expand.untouched}. Identity verified: {secPlans.expand.verifiedIdentities}/100; cooldown: {secPlans.repair.coolingDown}; QA blocked: {secPlans.repair.integrityBlocked}.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {(["repair","expand"] as const).map(mode => (
                <div key={mode} className="space-y-2 rounded border border-border/50 p-2">
                  <p className="font-semibold">{mode==="repair"?"Historical repairs":"Untouched-company expansion"}</p>
                  <p>{secPlans[mode].candidates.length ?
                    secPlans[mode].candidates.map(x =>
                      x.symbol+(mode==="repair"?" ("+x.existingYears+" FY currently)":"")
                    ).join(", ") : "None currently eligible"}</p>
                  <Button size="sm" variant="outline"
                    disabled={ingestAction!==null || queueAction || queueActive || secPlans[mode].candidates.length===0}
                    onClick={()=>void onRunSecControlled(mode)}
                  >{mode==="repair"?"Run up to 2 history repairs":"Import up to 10 new issuers (browser-dependent)"}</Button>
                  {mode==="expand"&&(
                    <Button size="sm" variant="secondary"
                      disabled={ingestAction!==null||queueAction||queueActive||
                        secPlans.expand.candidates.length===0}
                      onClick={()=>void onCreateSecQueue()}
                    >{queueAction?"Saving owner approval…":
                      "Queue up to 10 for background processing"}</Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {ingestResult && <p role="status" className="mt-3 whitespace-pre-wrap text-xs">{ingestResult}</p>}
        <div className="mt-3 space-y-2 rounded border border-border/70 p-3 text-xs">
          <p className="font-semibold">Phase 2I · one-time pilot completion</p>
          <p className="text-muted-foreground">
            Preview and approve all remaining eligible, untouched issuers in the fixed
            100-name SEC pilot with one action. Each company still runs separately
            through the existing leased worker, rate limits and retry controls.
            Incomplete filings, ambiguous identities and semantic exceptions
            are never guessed or added automatically. No financial scoring changes.
          </p>
          <Button size="sm" variant="outline"
            disabled={queueAction||ingestAction!==null||queueActive||!secQueue}
            onClick={()=>void previewFiniteSecBackfill()}>
            {queueAction?"Checking…":"Preview remaining eligible SEC issuers"}
          </Button>
          {finitePreview&&(
            <div className="space-y-2 rounded border border-border/50 p-2">
              <p className="font-semibold">
                One-time authorisation: {finitePreview.eligible} eligible issuers
              </p>
              <p>Verified identities: {finitePreview.verifiedIdentities}/{finitePreview.curatedPoolSize}.
                Existing three-year histories: {finitePreview.coveredThreeYear}.
                Incomplete existing history: {finitePreview.incompleteHistory}.
                Not yet imported: {finitePreview.untouched}.
                In cooldown: {finitePreview.coolingDown}.
                QA blocked: {finitePreview.blockedByIntegrity}.</p>
              <p className="text-muted-foreground">
                {finitePreview.candidates.map(c=>c.symbol).join(", ")||"No companies eligible."}
              </p>
              <Button size="sm" disabled={queueAction||queueActive||!secQueue||
                finitePreview.eligible===0}
                onClick={()=>void approveFiniteSecBackfill()}>
                Approve one-time {finitePreview.eligible}-company SEC backfill
              </Button>
              <Button size="sm" variant="outline" disabled={queueAction}
                onClick={()=>setFinitePreview(null)}>Dismiss preview</Button>
            </div>
          )}
        </div>
        <div className="mt-3 rounded border border-border/70 p-3 text-xs">
          <p className="font-semibold">Phase 2H · persistent SEC queue</p>
          <p className="mt-1 text-muted-foreground">
            Owner-approved jobs only: manual waves have a ten-company limit,
            while a one-time finite backfill may cover the approved remainder.
            The server-side worker processes one queued issuer at a time. No
            automatic discovery and no Radar score updates. Closing this page
            will not cancel an approved wave.
          </p>
          {secQueue?.waves?.length ? secQueue.waves.slice(0,3).map(w=>{
            const jobs=secQueue.jobs.filter(j=>j.wave_id===w.id);
            const finished=jobs.filter(j=>["succeeded","partial","failed","cancelled"].includes(j.state)).length;
            return <div key={w.id} className="mt-3 space-y-1 border-t border-border/50 pt-2">
              <p className="font-semibold">Wave {w.id.slice(0,8)} · {w.state} ·
                {" "+finished+"/"+jobs.length+" issuers processed"}</p>
              <p>{jobs.map(j=>j.symbol+": "+j.state+
                (j.attempts>1?" (attempt "+j.attempts+"/3)":"")).join(" · ")}</p>
              <p className="text-muted-foreground">
                New original 10-K filings: {jobs.reduce((n,j)=>n+j.new_filings,0)};
                financial facts: {jobs.reduce((n,j)=>n+j.new_facts,0)}.
              </p>
              {jobs.filter(j=>j.error).map(j=>
                <p key={j.id} className="text-[var(--negative)]">
                  {j.symbol}: {j.error}
                </p>)}
              {["queued","running","paused"].includes(w.state)&&
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={queueAction}
                    onClick={()=>void onControlSecQueue(w.id,w.state==="paused"?"resume":"pause")}
                  >{w.state==="paused"?"Resume":"Pause"}</Button>
                  <Button size="sm" variant="outline" disabled={queueAction}
                    onClick={()=>void onControlSecQueue(w.id,"cancel")}
                  >Cancel pending jobs</Button>
                </div>}
            </div>;
          }) : <p className="mt-2 text-muted-foreground">No approved background SEC waves.</p>}
          {queueMessage&&<p role="status" className="mt-2">{queueMessage}</p>}
        </div>

      </DashboardPanel>

      <DashboardPanel
        title="SEC filing coverage and ledger integrity"
        eyebrow="Read-only evidence audit · not scoring data"
        description="Shows recovered original 10-K years, core metric presence and internal ledger consistency. Clean structural checks do not validate the reported figures."
        className="mb-6"
      >
        {secEvidenceError ? (
          <p className="text-xs text-[var(--negative)]">
            SEC coverage telemetry unavailable: {secEvidenceError.message}
          </p>
        ) : !secEvidence ? (
          <p className="text-xs text-muted-foreground">Loading SEC evidence completeness…</p>
        ) : (
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
              {[
                ["SEC-covered issuers", secEvidence.rows.length],
                ["At least 3 years", secEvidence.completeThreeYears],
                ["Latest year has 4 core tags", secEvidence.latestCoreObserved],
                ["Ledger QA review flags", secEvidence.integrityReviewIssuers],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded border border-border/70 p-2">
                  <div className="text-muted-foreground">{label}</div>
                  <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
                </div>
              ))}
            </div>
            <p className="text-muted-foreground">
              Incomplete three-year history: {secEvidence.incompleteHistory}. The report
              counts only original SEC filings and observed direct US-GAAP tags.
              Financial sector metrics are not evaluated as industrial-company ratios.
              Ledger audits unavailable: {secEvidence.integrityUnavailableIssuers}.
              Zero integrity flags does not validate the amounts against SEC reports.
            </p>
            <div className="overflow-x-auto rounded border border-border/70">
              <table className="w-full min-w-[500px] text-left">
                <thead><tr className="text-muted-foreground">
                  <th className="p-2">Issuer</th>
                  <th className="p-2">10-K years</th>
                  <th className="p-2">Latest core tags / 4</th>
                  <th className="p-2">Total facts</th>
                  <th className="p-2">Newest period</th>
                  <th className="p-2">Ledger QA</th>
                </tr></thead>
                <tbody>
                  {secEvidence.rows.slice(0, 20).map((r) => (
                    <tr className="border-t border-border/50" key={r.symbol}>
                      <td className="p-2 font-semibold">{r.symbol}</td>
                      <td className="p-2 tabular-nums">{r.filingYears}</td>
                      <td className="p-2 tabular-nums">{r.latestCoreCount} / 4</td>
                      <td className="p-2 tabular-nums">{r.totalFacts}</td>
                      <td className="p-2">{r.lastPeriodEnd ?? "unknown"}</td>
                      <td className={r.ledgerStatus === "review" ? "p-2 text-[var(--negative)]" : "p-2 text-muted-foreground"}>
                        {r.ledgerStatus === "review" ? `Review (${r.ledgerIssues})` :
                          r.ledgerStatus === "unavailable" ? "Unavailable" : "No structural flags"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {secEvidence.rows.length > 20 && (
              <p className="text-muted-foreground">
                Showing 20 least-covered issuers; remaining evidence stays in the protected database.
              </p>
            )}
          </div>
        )}
      </DashboardPanel>

      <DashboardPanel
        title="SEC accounting quality and model readiness"
        eyebrow="Phase 2J · original SEC evidence · read-only"
        description="Accounting semantics, three-year metric availability and share-count comparability. No SEC source figures are cleared for investment scoring."
        className="mb-6"
      >
        {secSemanticError ? (
          <p className="text-xs text-[var(--negative)]">
            Semantic quality review unavailable: {secSemanticError.message}
          </p>
        ) : !secSemanticAudit ? (
          <p className="text-xs text-muted-foreground">
            Loading original SEC financial-semantic diagnostics…
          </p>
        ) : (
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["Source history / integrity issues",secSemanticAudit.requiresSourceRepair],
                ["Missing core annual metrics",secSemanticAudit.missingCoreMetrics],
                ["Tag/share comparability alerts",secSemanticAudit.shareOrTagReview],
                ["Approved for scoring",secSemanticAudit.modelReady],
              ].map(([label,value])=>
                <div key={String(label)} className="rounded border border-border/70 p-2">
                  <div className="text-muted-foreground">{label}</div>
                  <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
                </div>
              )}
            </div>
            <p className="text-muted-foreground">
              {secSemanticAudit.issuers} issuers checked. Automated source checks
              do not establish net-income attribution, revenue definition,
              consolidation perimeter, stock-split adjustments or audited numerical
              reconciliation. {secSemanticAudit.awaitingReconciliation} have no
              major automated defects but still require accounting review.
              Unavailable diagnostics: {secSemanticAudit.unavailable}.
            </p>
            <div className="overflow-x-auto rounded border border-border/70">
              <table className="w-full min-w-[610px] text-left">
                <thead><tr className="text-muted-foreground">
                  <th className="p-2">Issuer</th>
                  <th className="p-2">Semantic status</th>
                  <th className="p-2">Core metrics (min FY)</th>
                  <th className="p-2">Evidence requiring review</th>
                </tr></thead>
                <tbody>
                  {secSemanticAudit.rows.slice(0,30).map(r=>
                    <tr className="border-t border-border/50" key={r.symbol}>
                      <td className="p-2 font-semibold">{r.symbol}</td>
                      <td className="p-2">{r.status.replaceAll("_"," ")}</td>
                      <td className="p-2 tabular-nums">{r.coreYears}/3</td>
                      <td className="p-2 text-muted-foreground">
                        {r.diagnostics.length?r.diagnostics.join(" · "):
                          "Reported tags still require accounting and numerical reconciliation"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {secSemanticAudit.rows.length>30&&(
              <p className="text-muted-foreground">
                Showing the 30 highest-priority issuer reviews; the full review
                remains in the owner-protected database. Source completeness is
                not authorisation to update Radar or valuation models.
              </p>
            )}
          </div>
        )}
      </DashboardPanel>

      <DashboardPanel
        title="SEC original filing accounting basis"
        eyebrow="Phase 2J2 · direct original-filing provenance · scoring embargo"
        description="Shows how stored source tags should be read and where their reported accounting basis is still ambiguous. No normalized figures or automatic corrections."
        className="mb-6"
      >
        {secBasisError ? (
          <p className="text-xs text-[var(--negative)]">{secBasisError.message}</p>
        ) : !secBasis ? (
          <p className="text-xs text-muted-foreground">Loading source-basis audit…</p>
        ) : (
          <div className="space-y-3 text-xs">
            <p className="text-muted-foreground">
              Basis ruleset: {secBasis.version}. Every displayed SEC record is
              excluded from investment scoring until numerical and semantic
              reconciliation. Missing metrics remain missing.
            </p>
            <div className="overflow-x-auto rounded border border-border/70">
              <table className="w-full min-w-[660px] text-left">
                <thead><tr className="text-muted-foreground">
                  <th className="p-2">Company / FY</th>
                  <th className="p-2">Metric</th>
                  <th className="p-2">Original SEC tag</th>
                  <th className="p-2">Accounting basis / caveat</th>
                  <th className="p-2">Evidence</th>
                </tr></thead>
                <tbody>
                  {secBasis.rows
                    .filter(x=>x.metricCode==="STMT_REVENUE" ||
                      x.metricCode==="STMT_NET_INCOME" ||
                      x.metricCode==="STMT_WEIGHTED_AVG_SHARES")
                    .sort((a,b)=>{
                      const priority=(symbol:string)=>
                        ["WMT","PNC","AVGO","GS","WFC","MS","BLK","SPGI"].indexOf(symbol);
                      return priority(a.symbol)-priority(b.symbol) ||
                        b.periodEnd.localeCompare(a.periodEnd) ||
                        a.metricCode.localeCompare(b.metricCode);
                    })
                    .slice(0,50).map(x=>
                      <tr key={x.symbol+x.periodEnd+x.metricCode}
                        className="border-t border-border/50">
                        <td className="p-2 font-semibold">{x.symbol} · {x.periodEnd}</td>
                        <td className="p-2">{x.metricCode.replace("STMT_","").replaceAll("_"," ")}</td>
                        <td className="p-2 font-mono text-[10px]">{x.secTag??"not tagged"}</td>
                        <td className="p-2">
                          <div>{x.observedBasis.replaceAll("_"," ")}</div>
                          <p className="text-muted-foreground">{x.unresolvedNote}</p>
                        </td>
                        <td className="p-2">{x.sourceUrl?(
                          <a href={x.sourceUrl} target="_blank" rel="noopener noreferrer"
                            className="underline">Original 10-K</a>
                        ):"Source link unavailable"}</td>
                      </tr>
                    )}
                </tbody>
              </table>
            </div>
            <p className="text-muted-foreground">
              Evidence is displayed as filed, including unadjusted diluted share
              counts. This table does not infer missing values, bank revenue
              composition, legal-entity continuity or net-income attribution.
            </p>
          </div>
        )}
      </DashboardPanel>

      {calendar && (
        <DashboardPanel
          title="Release-aware refresh health"
          eyebrow="Automatic scheduler"
          description="Provider calendar coverage and unresolved post-release checks."
          className="mb-6"
          expandedChildren={
            <div className="space-y-3">
              <CalendarHealthGrid calendar={calendar} />
              <div className="text-xs leading-relaxed text-muted-foreground">
                Calendar dates start targeted ingestion; they do not mark data current by
                themselves. A release becomes verified only after the worker stores a new or revised
                observation. Waiting events retry automatically, while delayed and failed events
                remain visible for investigation.
              </div>
            </div>
          }
        >
          <CalendarHealthGrid calendar={calendar} />
        </DashboardPanel>
      )}

      <section className="mb-6 rounded-md border border-border/70 bg-card/60 p-3">
        <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Source freshness · live watchdog
        </h2>
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase text-muted-foreground">
            <tr className="border-b border-border/60">
              <th className="py-1 text-left">Source</th>
              <th className="text-left">Cadence</th>
              <th className="text-left">Latest observation</th>
              <th className="text-right">Lag</th>
              <th className="text-right">Max allowed</th>
              <th className="text-left">State</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {(freshness ?? []).map((r) => (
              <tr key={r.sourceCode} className="border-b border-border/40 last:border-b-0">
                <td className="py-1 pr-2 uppercase">{r.sourceCode}</td>
                <td className="pr-2 text-muted-foreground">{r.cadence}</td>
                <td className="pr-2 text-muted-foreground">
                  {r.latestAsOf ? new Date(r.latestAsOf).toLocaleString() : "—"}
                </td>
                <td className="text-right tabular-nums">
                  {r.lagMinutes !== null ? formatDur(r.lagMinutes * 60) : "—"}
                </td>
                <td className="text-right tabular-nums text-muted-foreground">
                  {formatDur(r.maxLagMinutes * 60)}
                </td>
                <td className="pr-2">
                  <span
                    className={
                      r.state === "fresh"
                        ? "text-[var(--positive)]"
                        : r.state === "lagging"
                          ? "text-[var(--warning)]"
                          : "text-[var(--negative)]"
                    }
                  >
                    {r.state}
                  </span>
                </td>
              </tr>
            ))}
            {!freshness && (
              <tr>
                <td colSpan={6} className="py-2 text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="mb-6 rounded-md border border-primary/40 bg-card/60 p-3">
        <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
          Phases 4–5 · US Labour, Market & Regime health
        </h2>
        {!phase45 && <div className="py-2 text-xs text-muted-foreground">Loading…</div>}
        {phase45 && (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              {phase45.engines.map((engine) => (
                <div key={engine.engine} className="rounded border border-border/70 p-2">
                  <div className="mb-2 font-mono text-[10px] uppercase">{engine.engine} engine</div>
                  <div className="grid grid-cols-3 gap-2 font-mono text-[10px]">
                    <Kv k="Registered" v={String(engine.registered)} />
                    <Kv
                      k="With data"
                      v={String(engine.withData)}
                      bad={engine.withData < engine.registered}
                    />
                    <Kv
                      k="Min-history ready"
                      v={String(engine.eligible)}
                      bad={engine.eligible < engine.registered}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4 font-mono text-[10px]">
              <Kv
                k="PCA/HMM pipeline"
                v={(phase45.model?.status as string) ?? "not run"}
                bad={!phase45.model || phase45.model.status !== "success"}
              />
              <Kv k="Model version" v={(phase45.model?.model_version as string) ?? "—"} />
              <Kv
                k="Last started"
                v={
                  phase45.model?.started_at
                    ? new Date(phase45.model.started_at as string).toLocaleString()
                    : "—"
                }
              />
              <Kv k="Persistence" v="shadow only" />
            </div>
            {phase45.warnings.length > 0 && (
              <ul className="list-inside list-disc text-[11px] text-[var(--warning)]">
                {phase45.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className="mb-6 rounded-md border border-primary/40 bg-card/60 p-3">
        <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
          Stage 1 · US Growth Engine health
        </h2>
        {!growth && <div className="py-2 text-xs text-muted-foreground">Loading…</div>}
        {growth && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4 font-mono text-[10px]">
              <Kv
                k="Analytics URL"
                v={growth.analytics.urlConfigured ? "configured" : "missing"}
                bad={!growth.analytics.urlConfigured}
              />
              <Kv
                k="Analytics token"
                v={growth.analytics.tokenConfigured ? "configured" : "missing"}
                bad={!growth.analytics.tokenConfigured}
              />
              <Kv
                k="Service reachable"
                v={
                  growth.analytics.reachable === null
                    ? "not probed"
                    : growth.analytics.reachable
                      ? "yes"
                      : "no"
                }
                bad={growth.analytics.reachable === false}
              />
              <Kv k="Service ver" v={growth.analytics.serviceVersion ?? "—"} />
              <Kv k="Data version" v="raw_observations.v1" />
              <Kv k="Model version" v={growth.model.currentModelVersion ?? "—"} />
              <Kv k="Calc mode" v={growth.model.lastRun?.calculationMode ?? "—"} />
              <Kv k="Successful runs" v={String(growth.model.successfulRunCount)} />
              <Kv k="Eligible" v={String(growth.counts.eligible)} />
              <Kv k="With Kalman output" v={String(growth.counts.withOutput)} />
              <Kv
                k="Skipped (min-history)"
                v={String(growth.counts.skipped)}
                bad={growth.counts.skipped > 0}
              />
              <Kv
                k="Data changed since run"
                v={growth.model.dataChangedSinceLastRun ? "yes — rerun due" : "no"}
                bad={growth.model.dataChangedSinceLastRun}
              />
            </div>
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                Recurring scheduler
              </div>
              {growth.scheduler ? (
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4 font-mono text-[10px]">
                  <Kv
                    k="Cron heartbeat"
                    v={growth.scheduler.silentCron ? "silent >26h" : "active"}
                    bad={growth.scheduler.silentCron}
                  />
                  <Kv
                    k="Failures 24h"
                    v={String(growth.scheduler.failuresLast24h)}
                    bad={growth.scheduler.failuresLast24h > 0}
                  />
                  <Kv
                    k="Last run status"
                    v={growth.scheduler.lastRunStatus ?? "—"}
                    bad={growth.scheduler.lastRunStatus === "failed"}
                  />
                  <Kv
                    k="Last run scope"
                    v={(growth.scheduler.lastRunScope ?? []).join(", ") || "—"}
                  />
                  <Kv
                    k="Stale indicators"
                    v={String(growth.scheduler.staleIndicators.length)}
                    bad={growth.scheduler.staleIndicators.length > 0}
                  />
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">
                  Scheduler view not populated yet.
                </div>
              )}
            </div>
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                Ingestion · last US Growth FRED run (detail)
              </div>
              {growth.ingestion.lastRun ? (
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4 font-mono text-[10px]">
                  <Kv
                    k="Started"
                    v={new Date(growth.ingestion.lastRun.startedAt).toLocaleString()}
                  />
                  <Kv
                    k="Status"
                    v={growth.ingestion.lastRun.status}
                    bad={growth.ingestion.lastRun.status !== "success"}
                  />
                  <Kv k="Rows" v={String(growth.ingestion.lastRun.rowsIngested ?? 0)} />
                  <Kv
                    k="New / revisions / failed"
                    v={`${growth.ingestion.lastRun.newObservations} / ${growth.ingestion.lastRun.revisions} / ${growth.ingestion.lastRun.failedCount}`}
                  />
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">No ingestion run recorded yet.</div>
              )}
            </div>
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                Latest Kalman run
              </div>
              {growth.model.lastRun ? (
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4 font-mono text-[10px]">
                  <Kv k="Started" v={new Date(growth.model.lastRun.startedAt).toLocaleString()} />
                  <Kv
                    k="Status"
                    v={growth.model.lastRun.status}
                    bad={growth.model.lastRun.status !== "success"}
                  />
                  <Kv
                    k="Processed / skipped"
                    v={`${growth.model.lastRun.indicatorsProcessed ?? 0} / ${growth.model.lastRun.indicatorsSkipped ?? 0}`}
                  />
                  <Kv k="Output rows" v={String(growth.model.lastRun.outputRows ?? 0)} />
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">No Kalman run recorded yet.</div>
              )}
            </div>
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase text-muted-foreground">
                <tr className="border-b border-border/60">
                  <th className="py-1 text-left">Indicator</th>
                  <th className="text-left">Series</th>
                  <th className="text-left">Freq</th>
                  <th className="text-right">Obs</th>
                  <th className="text-right">Vintages</th>
                  <th className="text-left">Earliest</th>
                  <th className="text-left">Latest</th>
                  <th className="text-right">Stale (d)</th>
                  <th className="text-left">Min-hist</th>
                  <th className="text-left">Kalman</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {growth.indicators.map((i) => (
                  <tr key={i.concept_code} className="border-b border-border/40 last:border-b-0">
                    <td className="py-1 pr-2">{i.concept_code}</td>
                    <td className="pr-2 text-muted-foreground">{i.series_code}</td>
                    <td className="pr-2 text-muted-foreground">{i.frequency}</td>
                    <td className="text-right tabular-nums">{i.observation_count}</td>
                    <td className="text-right tabular-nums">{i.vintage_count}</td>
                    <td className="pr-2 text-muted-foreground">{i.earliest_observation ?? "—"}</td>
                    <td className="pr-2 text-muted-foreground">{i.latest_observation ?? "—"}</td>
                    <td
                      className={
                        "text-right tabular-nums " +
                        ((i.staleness_days ?? 0) > 45 ? "text-[var(--warning)]" : "")
                      }
                    >
                      {i.staleness_days ?? "—"}
                    </td>
                    <td
                      className={
                        "pr-2 " +
                        (i.meets_min_history ? "text-[var(--positive)]" : "text-[var(--warning)]")
                      }
                    >
                      {i.observation_count}/{i.min_history ?? "?"}
                    </td>
                    <td
                      className={
                        "pr-2 " +
                        (i.has_kalman_output ? "text-[var(--positive)]" : "text-muted-foreground")
                      }
                    >
                      {i.has_kalman_output ? `output @ ${i.latest_output_ts ?? "—"}` : "not run"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {growth.warnings.length > 0 && (
              <div className="rounded-sm border border-[var(--warning)]/40 bg-[var(--warning)]/5 p-2">
                <div className="mb-1 text-[10px] uppercase tracking-wider text-[var(--warning)]">
                  Open warnings
                </div>
                <ul className="list-inside list-disc space-y-0.5 text-[11px]">
                  {growth.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="mb-6 rounded-md border border-border/70 bg-card/60 p-3">
        <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Sources · live · full list
        </h2>
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase text-muted-foreground">
            <tr className="border-b border-border/60">
              <th className="py-1 text-left">Provider</th>
              <th className="text-left">Tier</th>
              <th className="text-left">Last run</th>
              <th className="text-left">Status</th>
              <th className="text-right">Rows 24h</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {(data?.sources ?? []).map((s) => (
              <tr key={s.id} className="border-b border-border/40 last:border-b-0">
                <td className="py-1 pr-2">{s.name}</td>
                <td className="pr-2 text-muted-foreground">{s.tier}</td>
                <td className="pr-2 text-muted-foreground">
                  {s.lastRunAt ? new Date(s.lastRunAt).toLocaleString() : "—"}
                </td>
                <td className="pr-2">
                  {s.lastRunStatus ? (
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {s.lastRunStatus}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">idle</span>
                  )}
                </td>
                <td className="text-right tabular-nums">{s.rowsIngested24h.toLocaleString()}</td>
              </tr>
            ))}
            {!data && (
              <tr>
                <td colSpan={5} className="py-2 text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="mb-6 rounded-md border border-border/70 bg-card/60 p-3">
        <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Recent ingestion runs
        </h2>
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase text-muted-foreground">
            <tr className="border-b border-border/60">
              <th className="py-1 text-left">Started</th>
              <th className="text-left">Source</th>
              <th className="text-left">Category</th>
              <th className="text-left">Status</th>
              <th className="text-right">Rows</th>
              <th className="text-left">Error</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {(data?.recentRuns ?? []).map((r) => (
              <tr key={r.id} className="border-b border-border/40 last:border-b-0">
                <td className="py-1 pr-2 text-muted-foreground">
                  {new Date(r.startedAt).toLocaleString()}
                </td>
                <td className="pr-2">{r.sourceName}</td>
                <td className="pr-2 text-muted-foreground">{r.category}</td>
                <td className="pr-2">
                  <span
                    className={
                      r.status === "success"
                        ? "text-[var(--positive)]"
                        : r.status === "failed"
                          ? "text-[var(--negative)]"
                          : "text-[var(--warning)]"
                    }
                  >
                    {r.status}
                  </span>
                </td>
                <td className="text-right tabular-nums">{r.rowsIngested ?? 0}</td>
                <td className="pr-2 text-[var(--negative)] truncate max-w-[16rem]">
                  {r.error ?? ""}
                </td>
              </tr>
            ))}
            {data && data.recentRuns.length === 0 && (
              <tr>
                <td colSpan={6} className="py-2 text-muted-foreground">
                  No runs recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="mb-6 rounded-md border border-border/70 bg-card/60 p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Verifier audit trail · latest 25 runs
          </h2>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[10px] uppercase tracking-wider"
            disabled={running}
            onClick={onRun}
          >
            {running ? "Running…" : "Run verifier now"}
          </Button>
        </div>
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase text-muted-foreground">
            <tr className="border-b border-border/60">
              <th className="py-1 text-left">Started</th>
              <th className="text-left">Panel</th>
              <th className="text-left">Check</th>
              <th className="text-left">Verifier</th>
              <th className="text-left">Status</th>
              <th className="text-left">Trigger</th>
              <th className="text-left">Runner</th>
              <th className="text-left">Calc ver</th>
              <th className="text-right">Conf</th>
              <th className="text-right">ms</th>
              <th className="text-left">Detail</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {(data?.verifyRuns ?? []).map((r) => (
              <tr key={r.id} className="border-b border-border/40 last:border-b-0">
                <td className="py-1 pr-2 text-muted-foreground">
                  {new Date(r.startedAt).toLocaleString()}
                </td>
                <td className="pr-2">{r.panelId}</td>
                <td className="pr-2 text-muted-foreground truncate max-w-[14rem]">{r.checkId}</td>
                <td className="pr-2">
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {r.verifier}
                  </Badge>
                </td>
                <td className="pr-2">
                  <span
                    className={
                      r.status === "pass"
                        ? "text-[var(--positive)]"
                        : r.status === "fail" || r.status === "stale"
                          ? "text-[var(--negative)]"
                          : "text-[var(--warning)]"
                    }
                  >
                    {r.status}
                  </span>
                </td>
                <td className="pr-2 text-muted-foreground">{r.trigger ?? "—"}</td>
                <td className="pr-2 text-muted-foreground">{r.runnerKey ?? "—"}</td>
                <td className="pr-2 text-muted-foreground">{r.calcVersion ?? "—"}</td>
                <td className="text-right tabular-nums">
                  {r.confidence !== null ? r.confidence.toFixed(2) : "—"}
                </td>
                <td className="text-right tabular-nums text-muted-foreground">
                  {r.durationMs ?? "—"}
                </td>
                <td className="pr-2 text-muted-foreground truncate max-w-[18rem]">
                  {r.detail ?? ""}
                </td>
              </tr>
            ))}
            {data && data.verifyRuns.length === 0 && (
              <tr>
                <td colSpan={11} className="py-2 text-muted-foreground">
                  No verification runs yet — click "Run verifier now" or wait for the 30-minute
                  cron.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <section className="rounded-md border border-border/70 bg-card/60 p-3">
          <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Source hierarchy (spec §19)
          </h2>
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase text-muted-foreground">
              <tr className="border-b border-border/60">
                <th className="py-1 text-left">Tier</th>
                <th className="text-left">Description</th>
                <th className="text-right">Weight</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {Object.entries(SOURCE_TIER_META).map(([k, v]) => (
                <tr key={k} className="border-b border-border/40 last:border-b-0">
                  <td className="py-1 pr-2">{v.label}</td>
                  <td className="pr-2 text-muted-foreground">{v.description}</td>
                  <td className="text-right tabular-nums">{v.weight.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rounded-md border border-border/70 bg-card/60 p-3">
          <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Freshness policies
          </h2>
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase text-muted-foreground">
              <tr className="border-b border-border/60">
                <th className="py-1 text-left">Category</th>
                <th className="text-right">Warn</th>
                <th className="text-right">Max</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {Object.entries(DEFAULT_FRESHNESS).map(([k, v]) => (
                <tr key={k} className="border-b border-border/40 last:border-b-0">
                  <td className="py-1 pr-2">{k}</td>
                  <td className="text-right tabular-nums">{formatDur(v.warnAgeSeconds)}</td>
                  <td className="text-right tabular-nums">{formatDur(v.maxAgeSeconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </AppShell>
  );
}

function CalendarHealthGrid({ calendar }: { calendar: ReleaseCalendarDashboard }) {
  const attention = calendar.counts.waiting + calendar.counts.delayed + calendar.counts.failed;
  const rows = [
    {
      label: "Next 7 days",
      value: String(calendar.counts.nextSevenDays),
      detail: "Mapped release checks",
      explanation: "Automatic checks due during the next seven days.",
      bad: false,
    },
    {
      label: "Waiting",
      value: String(calendar.counts.waiting),
      detail: "Within retry window",
      explanation:
        "The official date passed, but the provider has not supplied a new tracked value yet.",
      bad: false,
    },
    {
      label: "Delayed",
      value: String(calendar.counts.delayed),
      detail: "Past expected window",
      explanation: "No new tracked observation arrived before the verification window closed.",
      bad: calendar.counts.delayed > 0,
    },
    {
      label: "Failed",
      value: String(calendar.counts.failed),
      detail: attention ? "Review release log" : "No worker failures",
      explanation: "Refreshes that exhausted their retry window after a technical failure.",
      bad: calendar.counts.failed > 0,
    },
  ];
  return (
    <DashboardGrid columns={4}>
      {rows.map((row) => (
        <div
          key={row.label}
          className="h-full rounded border border-border/55 bg-background/35 p-2.5"
        >
          <InfoTip label={row.label} explanation={row.explanation}>
            <span className="font-mono text-[9px] uppercase text-muted-foreground">
              {row.label}
            </span>
          </InfoTip>
          <div
            className={
              row.bad
                ? "mt-1 text-lg font-semibold text-[var(--negative)]"
                : "mt-1 text-lg font-semibold"
            }
          >
            {row.value}
          </div>
          <div className="text-[9px] text-muted-foreground">{row.detail}</div>
        </div>
      ))}
    </DashboardGrid>
  );
}

function formatDur(s: number): string {
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

function Kv({ k, v, bad }: { k: string; v: string; bad?: boolean }) {
  return (
    <div className="rounded-sm border border-border/50 bg-background/40 px-2 py-1">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{k}</div>
      <div className={bad ? "text-[var(--warning)]" : ""}>{v}</div>
    </div>
  );
}
