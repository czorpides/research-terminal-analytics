import {
 reviewAllSecMethodologies,
} from "@/lib/ingestion/sec/sec-methodology-gates";
import {runSecIndependentCodePathValidation} from "@/lib/ingestion/sec/sec-independent-codepath-checks";
import {assessSecResearchRelease} from "@/lib/ingestion/sec/sec-release-readiness";
import {
 SEC_TO_LEGACY_CROSSWALK,
} from "@/lib/ingestion/sec/sec-legacy-shadow-bridge";
export function SecMethodologyReleaseStatus(){
 const methods=reviewAllSecMethodologies();
 const tested=runSecIndependentCodePathValidation();
 const ready=assessSecResearchRelease();
 return <section className="mb-5 rounded border border-border/70 bg-card/60 p-4 text-xs space-y-4">
  <h2 className="text-sm font-semibold">Phases 2J21–2J24 · policy, validation, model shadow and release gates</h2>
  <p className="text-muted-foreground">
   Approved accounting inputs are required before SEC values may replace the existing
   Magic Formula statement facts. Source-note arithmetic, an automated second
   implementation and a successful CI build are NOT an independent reviewer signature
   or a successful production browser test.
  </p>
  <div className="grid gap-3 sm:grid-cols-4">
   <div className="rounded border border-border/60 p-3">
    <p className="font-semibold">2J21 · methodology</p>
    <p>{methods.length} issuer reviews recorded</p>
    <p className="text-muted-foreground">Selected draft, issuer approval pending</p>
   </div>
   <div className="rounded border border-border/60 p-3">
    <p className="font-semibold">2J22 · independent code path</p>
    <p>{tested.checksPassed} checks passed · {tested.checksFailed} mismatches</p>
    <p className="text-muted-foreground">No separate human attestation</p>
   </div>
   <div className="rounded border border-border/60 p-3">
    <p className="font-semibold">2J23 · legacy bridge</p>
    <p>{SEC_TO_LEGACY_CROSSWALK.length} semantic/source controls</p>
    <p className="text-muted-foreground">Read-only shadow; no STMT_* updates</p>
   </div>
   <div className="rounded border border-border/60 p-3">
    <p className="font-semibold">2J24 · release</p>
    <p>{ready.outcome==="research_only_release_blocked"?"Model activation blocked":"Preproduction checks complete"}</p>
    <p className="text-muted-foreground">External CI, browser and reviewer evidence</p>
   </div>
  </div>
  <div className="overflow-x-auto"><table className="min-w-[580px] w-full">
   <thead className="border-b border-border/60 text-muted-foreground">
    <tr><th className="py-2 text-left">Issuer</th>
     <th className="py-2 text-right">Original-codepath checks</th>
     <th className="py-2 text-right">Policy gaps</th>
     <th className="py-2 text-right">Scoring eligibility</th>
    </tr>
   </thead><tbody>{methods.map(m=>{
    const match=tested.reports.find(t=>t.subject===m.issuer);
    return <tr className="border-b border-border/30" key={m.issuer}>
     <td className="py-2 font-semibold">{m.issuer}</td>
     <td className="py-2 text-right">{match?.passed??0}/{match?.checks.length??0}</td>
     <td className="py-2 text-right">{m.unresolvedIds.length}</td>
     <td className="py-2 text-right">Blocked</td>
    </tr>;
   })}</tbody></table></div>
  <details className="rounded border border-border/60 p-3">
   <summary className="cursor-pointer font-semibold">
    Accounting approval conditions and legacy model crosswalk
   </summary>
   <div className="mt-2 space-y-3">
    {SEC_TO_LEGACY_CROSSWALK.map(item=><div key={item.legacyMetric}
     className="border-b border-border/30 pb-2">
     <p className="font-semibold">{item.legacyMetric} · {item.mappingStatus.replaceAll("_"," ")}</p>
     <p className="text-muted-foreground">{item.requiredEvidence}</p>
    </div>)}
   </div>
  </details>
  <details className="rounded border border-border/60 p-3">
   <summary className="cursor-pointer font-semibold">
    Live acceptance blockers and outstanding source reviews
   </summary>
   <div className="mt-2 space-y-2 text-muted-foreground">
    {ready.pending.map((x,i)=><p key={i}>{i+1}. {x}</p>)}
   </div>
  </details>
  <p className="font-semibold">
   No production scores · No rankings written · No database updates ·
   No approved software ROC. Independent human reviewer and deployment/browser
   acceptance are not recorded by this read-only component.
  </p>
 </section>;
}