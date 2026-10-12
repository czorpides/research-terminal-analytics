import {useState} from "react";
import {
 calculateSoftwareCapitalScenario,SOFTWARE_POLICY_MATRIX,
 type SoftwareCapitalPolicy,
 type AcquisitionTreatment,type DeferredRevenueTreatment,
 type OperatingLeaseTreatment,type ResearchTreatment,
} from "@/lib/ingestion/sec/software-capital-policy-matrix";

const fmt=(v:string|null)=>v===null?"Unavailable":Number(v).toLocaleString("en-US",{maximumFractionDigits:2});
const percent=(v:string|null)=>v===null?"Unavailable":(Number(v)/100).toFixed(2)+"%";
const defaults:SoftwareCapitalPolicy={
 acquisitions:"tangible_only",deferredRevenue:"full_face",
 operatingLeases:"rent_inclusive",research:"gaap_expensed",
};
const choiceLabels={
 acquisitions:{
  tangible_only:"Tangible (no acquisition assets)",
  acquisition_inclusive:"Include goodwill + purchased intangibles",
 },
 deferredRevenue:{
  full_face:"Retain 100% of current deferred revenue",
  half_face:"Retain 50% — hypothetical stress",
  excluded_from_nwc:"Retain 0% — hypothetical stress",
 },
 operatingLeases:{
  rent_inclusive:"GAAP rent-inclusive: no ROU uplift",
  capitalized_lease:"Capitalise operating lease ROU + finance claim",
 },
 research:{
  gaap_expensed:"GAAP R&D expense as reported",
  hypothetical_five_year:"Hypothetical 5-year R&D research asset",
 },
};
export function SecSoftwareCapitalPolicyMatrix(){
 const [policy,setPolicy]=useState<SoftwareCapitalPolicy>(defaults);
 const change=<K extends keyof SoftwareCapitalPolicy>(key:K,value:SoftwareCapitalPolicy[K])=>
  setPolicy(prev=>({...prev,[key]:value}));
 const cases=(["ADBE","ADSK","NOW"] as const).map(symbol=>
  calculateSoftwareCapitalScenario(symbol,policy));
 return <section className="mb-5 rounded border border-border/70 bg-card/60 p-4 text-xs space-y-4">
  <h2 className="text-sm font-semibold">Phase 2J19 · Economic capital policy sensitivity</h2>
  <p className="text-muted-foreground">
   Choose explicit accounting definitions and compare the same three original
   SEC annual-report issuers. All amounts USD millions. Each policy produces a
   change to a deliberately INCOMPLETE book-capital bridge, NOT economic invested
   capital, audited adjusted operating income, a certified return on capital,
   enterprise value or an investable ranking.
  </p>
  <div className="grid gap-3 sm:grid-cols-2">
   <label className="space-y-1">
    <span className="font-semibold">Acquisition accounting</span>
    <select className="w-full rounded border border-border bg-background p-2"
     value={policy.acquisitions}
     onChange={e=>change("acquisitions",e.target.value as AcquisitionTreatment)}>
     {Object.entries(choiceLabels.acquisitions).map(([k,v])=>
      <option key={k} value={k}>{v}</option>)}
    </select>
   </label>
   <label className="space-y-1">
    <span className="font-semibold">Current deferred revenue</span>
    <select className="w-full rounded border border-border bg-background p-2"
     value={policy.deferredRevenue}
     onChange={e=>change("deferredRevenue",e.target.value as DeferredRevenueTreatment)}>
     {Object.entries(choiceLabels.deferredRevenue).map(([k,v])=>
      <option key={k} value={k}>{v}</option>)}
    </select>
   </label>
   <label className="space-y-1">
    <span className="font-semibold">Operating lease treatment</span>
    <select className="w-full rounded border border-border bg-background p-2"
     value={policy.operatingLeases}
     onChange={e=>change("operatingLeases",e.target.value as OperatingLeaseTreatment)}>
     {Object.entries(choiceLabels.operatingLeases).map(([k,v])=>
      <option key={k} value={k}>{v}</option>)}
    </select>
   </label>
   <label className="space-y-1">
    <span className="font-semibold">R&D treatment</span>
    <select className="w-full rounded border border-border bg-background p-2"
     value={policy.research}
     onChange={e=>change("research",e.target.value as ResearchTreatment)}>
     {Object.entries(choiceLabels.research).map(([k,v])=>
      <option key={k} value={k}>{v}</option>)}
    </select>
   </label>
  </div>
  <p className="text-muted-foreground">
   Complete research grid: {SOFTWARE_POLICY_MATRIX.length} scenario combinations per issuer,
   72 in total. The interactive table shows the selected identical assumptions across all
   companies, even when the accounting basis is incomplete.
  </p>
  <div className="overflow-x-auto">
   <table className="min-w-[740px] w-full">
    <thead className="border-b border-border/60 text-muted-foreground"><tr>
     <th className="py-2 text-left">Metric / original FY</th>
     {cases.map(c=><th key={c.issuer} className="py-2 text-right">
      {c.issuer} · {c.fiscalEnd}</th>)}
    </tr></thead>
    <tbody>
     {([
      ["Unadjusted CA−CL+PPE","rawCurrentAssetsLessLiabilitiesPlusPpeMillions"],
      ["Current operating lease liability classified outside NWC","observedCurrentOperatingLeaseLiabilityAdjustmentMillions"],
      ["Noncurrent contract commission asset, counted once","noncurrentContractCostIncludedOnceMillions"],
      ["Acquired goodwill and intangibles policy delta","acquisitionsMillions"],
      ["Current deferred revenue reclassification delta","deferredRevenueReclassificationMillions"],
      ["Capitalised operating lease ROU policy delta","leaseRouCapitalMillions"],
      ["Hypothetical five-year R&D policy delta","hypotheticalResearchAssetMillions"],
      ["Total policy delta from accounting choices","knownPolicyDeltaMillions"],
      ["Conditional INCOMPLETE book-capital bridge","conditionalBookBridgeMillions"],
      ["FY illustrative earnings (null for capitalized leases)","compatibleIllustrativeAnnualOperatingIncomeMillions"],
      ["FY illustrative operating margin","compatibleIllustrativeAnnualOperatingMarginBps"],
     ] as const).map(([title,key])=><tr key={key} className="border-b border-border/30">
      <td className="py-2">{title}</td>
      {cases.map(c=><td key={c.issuer} className="py-2 text-right tabular-nums">
       {key==="compatibleIllustrativeAnnualOperatingMarginBps"?
        percent(c.compatibleIllustrativeAnnualOperatingMarginBps):
        key==="acquisitionsMillions"||key==="deferredRevenueReclassificationMillions"||
        key==="leaseRouCapitalMillions"||key==="hypotheticalResearchAssetMillions"||
        key==="knownPolicyDeltaMillions"?
        fmt(c.additivePolicyDeltas[key]):fmt(c[key])}
      </td>)}
     </tr>)}
    </tbody>
   </table>
  </div>
  {policy.operatingLeases==="capitalized_lease"&&<p className="font-semibold">
   Capitalised leases change the financing perimeter and operating earnings.
   No issuer has a verified rent-addback, ROU depreciation and lease-interest
   earnings bridge, so illustrative adjusted EBIT and ROC are deliberately unavailable.
  </p>}
  {policy.deferredRevenue!=="full_face"&&<p className="font-semibold">
   Deferred-revenue percentages are mechanical stress cases, not established
   delivery costs or cost-to-serve cash liabilities.
  </p>}
  {cases.some(c=>c.conditionalBookBridgeMillions===null)&&
   <p className="font-semibold">Autodesk's original FY contract acquisition asset
    has no independently identified current/noncurrent split. Its partial
    book-capital subtotal is therefore unavailable in every scenario, even though
    each separately supported policy delta is visible.</p>}
  <details className="rounded border border-border/70 p-3">
   <summary className="cursor-pointer font-semibold">
    Required source controls and outstanding accounting decisions
   </summary>
   <div className="mt-2 space-y-3 text-muted-foreground">
    <p>Reported current assets include cash and current contract assets;
     reported current liabilities include borrowings and deferred revenue.
     The base capital calculation is therefore NOT operating working capital.</p>
    <p>Lease-funded financing, separate finance leases, goodwill acquisition
     economics, cash restrictions and contract allocations need a complete
     source-verified numerator and denominator before any ROIC.</p>
    <p>{cases[0].blockers.join(" ")}</p>
   </div>
  </details>
  <p className="font-semibold">Investable capital: Not verified · Comparable ROC: Not available ·
   Economic EV: Not available · Independent accountant approval: Not performed ·
   Model and Radar scores: Unchanged · No stored data changes.</p>
 </section>;
}