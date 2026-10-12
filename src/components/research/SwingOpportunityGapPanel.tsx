import type {SwingOpportunityGapAudit} from "@/lib/swing/opportunity-gap-audit";
import type {SwingV2WorkspaceCandidate} from "@/lib/swing/workspace-v2.functions";

const stages:Record<SwingOpportunityGapAudit["stage"],string>={
 missing_managed_universe:"Outside loaded universe",
 ambiguous_symbol:"Ticker ambiguous",
 missing_broad_evidence:"Broad data missing",
 not_nominated_for_deep_scan:"Not nominated",
 insufficient_price_history:"Price history missing",
 deep_scan_no_valid_setup:"No qualifying setup",
 model_below_surfacing_floor:"Below setup floor",
 model_invalidated:"Setup invalidated",
 shortlist_capacity:"Outside surfaced cap",
 surfaced:"Surfaced (pre-hardening)",
};
export function SwingOpportunityGapPanel({
 audit,candidates,
}:{
 audit:SwingOpportunityGapAudit[]|undefined;
 candidates:SwingV2WorkspaceCandidate[];
}){
 const surfacingIds=new Set(candidates.map(c=>c.assetId));
 return <section className="rounded-2xl border border-border/70 bg-card/50 p-4 sm:p-5">
  <h3 className="text-sm font-semibold">Opportunity-gap investigation · v2.1 shadow</h3>
  <p className="mt-1 text-xs leading-5 text-muted-foreground">
   A stock may disappear from a managed universe or the 220-name deep scan
   before it gets a final setup score. This audit traces watchlist coverage and
   ranking attrition; it does not assert that a ticker is a good investment,
   grant an optimistic catalyst bonus, or override any entry/risk gate.
  </p>
  {!audit&&<p className="mt-3 text-xs text-muted-foreground">
   Funnel tracing is not available in this cached workspace version.
   Wait for an updated engine snapshot. No status can be inferred from a missing audit.
  </p>}
  {audit&&<div className="mt-3 space-y-2">
   {audit.map(row=>{
    // workspace has already gone through v2.1 defensive presentation
    // hardening; a pre-hardening finalist can still be removed at that stage.
    const filteredByGuard=row.stage==="surfaced"&&row.resolvedAssetId!==null&&
      !surfacingIds.has(row.resolvedAssetId);
    const matched=row.resolvedAssetId===null?null:
      candidates.find(candidate=>candidate.assetId===row.resolvedAssetId)??null;
    const status=filteredByGuard?"Removed by defensive guard":stages[row.stage];
    return <details key={row.watchSymbol} className="rounded-lg border border-border/60 p-3">
     <summary className="cursor-pointer list-none">
      <div className="flex flex-wrap items-center justify-between gap-2">
       <div className="flex items-center gap-2">
        <span className="font-mono text-sm font-semibold">{row.watchSymbol}</span>
        {row.assetName&&<span className="text-xs text-muted-foreground">{row.assetName}</span>}
       </div>
       <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="text-muted-foreground">{status}</span>
        <span className="font-mono tabular-nums">
         {row.shadowSetupScore===null?"No v2.1 setup score":"v2.1 "+row.shadowSetupScore.toFixed(1)}
        </span>
       </div>
      </div>
     </summary>
     <div className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
      <p>{filteredByGuard?
       "The ticker reached the pre-hardening shortlist but was removed by the v2.1 defensive guard, which can reject severe 63-session price discontinuities. This is not a conclusion about its fundamental quality.":
       row.progress}</p>
      <p>
       Broad evidence: {row.hasBroadEvidence===null?"Unavailable":row.hasBroadEvidence?"Present":"Missing"}
       {" · "}Deep scanned: {row.deepScanned?"Yes":"No"}
       {" · "}Usable OHLC bars: {row.usableBars??"Unknown"}
       {" · "}Setup: {row.shadowSetupName??"Not computed"}
       {" · "}Entry state: {matched?.setup.entryState??row.shadowEntryState??"Not computed"}
      </p>
      {row.observedReasons.length>0&&<p>
       <span className="font-semibold">Observed setup evidence:</span>{" "}
       {row.observedReasons.join(" · ")}
      </p>}
      {row.observedRisks.length>0&&<p>
       <span className="font-semibold">Model risk / missing confirmation:</span>{" "}
       {row.observedRisks.join(" · ")}
      </p>}
      {matched?.setup.risks?.length? <p>
       <span className="font-semibold">Post-hardening risks:</span>{" "}
       {matched.setup.risks.slice(0,4).join(" · ")}
      </p>:null}
      <p>
       The score shown here is the v2.1 short-horizon setup score, not the
       older fundamental Opportunity Radar composite or a retrospective return.
       A low number may be warranted; whether it actually misses profitable
       outcomes requires point-in-time trade tracking.
      </p>
     </div>
    </details>;
   })}
  </div>}
  <p className="mt-3 text-xs text-muted-foreground">
   Exact exchange symbols only (for example, EOS.AX is not presumed to be EOS
   on a US exchange). Watching a symbol never inserts it into the screened
   universe, deep-scan allocation or displayed top-ranked set.
  </p>
 </section>;
}