import {
 assessThreeSoftwarePerimeters,type DisclosedFact,
} from "@/lib/ingestion/sec/software-operating-capital-perimeter";

const usd=(value:string|null)=>value===null?"Not established":Number(value).toLocaleString("en-US",{maximumFractionDigits:3});
const keyRows=[
 ["current_assets_reported","Reported current assets"],
 ["goodwill","Goodwill (already booked)"],
 ["acquired_intangibles_net","Purchased intangibles, net"],
 ["acquired_developed_technology_net","Purchased technology (subset, net)"],
 ["contract_acquisition_costs_total","Capitalised contract costs"],
 ["contract_acquisition_current","Contract costs embedded in current assets"],
 ["contract_acquisition_noncurrent","Contract costs embedded in long-term assets"],
 ["contract_assets_total","Customer contract assets (unsplit)"],
 ["deferred_revenue_current","Current deferred revenue / obligations"],
 ["deferred_revenue_noncurrent","Noncurrent deferred revenue"],
 ["operating_lease_rou","Operating lease ROU, already booked"],
 ["operating_lease_current_liability","Current operating lease liability"],
 ["operating_lease_noncurrent_liability","Long-term operating lease liability"],
 ["finance_lease_liability","Finance lease liability, original note"],
 ["hypothetical_5y_rd_asset","Five-year hypothetical R&D asset (NOT GAAP)"],
] as const;
const formatStatus=(v:DisclosedFact|undefined)=>{
 if(!v)return "Not established";
 return v.amountMillions===null?"Unverified / unsplit":usd(v.amountMillions);
};
export function SecSoftwareCapitalPerimeter(){
 const all=assessThreeSoftwarePerimeters();
 return <section className="mb-5 rounded border border-border/70 bg-card/60 p-4 text-xs space-y-3">
  <h2 className="text-sm font-semibold">Phase 2J18 · acquired intangible and operating capital reconciliation</h2>
  <p className="text-muted-foreground">{all.scope} Original year-end SEC note amounts,
   not October 2026 current invested capital. All USD millions. These are already
   booked assets and obligations except the separately labelled hypothetical research
   adjustment. No totals are made by adding booked sub-components twice.</p>
  <div className="flex flex-wrap gap-4">
   {all.assessments.map(a=><div key={a.issuer}>
    <strong>{a.issuer}</strong> {a.source.fiscalEnd} ·
    {' '}<a className="underline" href={a.source.original10k}
     rel="noopener noreferrer" target="_blank">Original SEC 10-K</a>
   </div>)}
  </div>
  <div className="overflow-x-auto">
   <table className="w-full min-w-[660px]">
    <thead className="border-b border-border/60 text-muted-foreground">
     <tr><th className="text-left py-2">Original FY accounting item</th>
      {all.assessments.map(a=><th key={a.issuer} className="text-right py-2">{a.issuer}</th>)}
     </tr>
    </thead>
    <tbody>
     {keyRows.map(([key,label])=><tr key={key} className="border-b border-border/30">
      <td className="py-2">{label}</td>
      {all.assessments.map(a=><td key={a.issuer} className="text-right tabular-nums">
       {formatStatus(a.observed.find(x=>x.key===key))}
      </td>)}
     </tr>)}
    </tbody>
   </table>
  </div>
  <p className="text-muted-foreground">Finance leases: ServiceNow expressly states none were
   present in the periods reported. For Adobe and Autodesk, an absent verified numeric
   amount remains unknown—never silently set to zero. A total contractual obligation
   and its operating cash cost are also not the same thing.</p>
  <div className="grid gap-3 md:grid-cols-3">
   {all.assessments.map(a=><div key={a.issuer} className="rounded border border-border/60 p-3 space-y-2">
    <h3 className="font-semibold">{a.issuer} · source disclosure checks</h3>
    <p className="text-muted-foreground">Source arithmetic:
     {' '}{a.checks.filter(c=>c.result==="matched").length}/{a.checks.length} exact bridges;
     other fields are unallocated, not inferred zero.</p>
    <p>Unadjusted reported CA − CL: USD {a.report.negativeWorkingCapitalMillions}m.
     This is NOT an operating-capital denominator.</p>
    <p>Hypothetical 5y R&D asset: USD {usd(a.report.fiveYearHypotheticalRAndDAssetMillions)}m.
     Not a booked development asset.</p>
    <details className="rounded border border-border/60 p-2">
     <summary className="cursor-pointer font-semibold">Source and treatment controls</summary>
     <div className="mt-2 space-y-2 text-muted-foreground">
      {a.report.missingAccountingDecisions.map((v,i)=><p key={i}>{i+1}. {v}</p>)}
     </div>
    </details>
   </div>)}
  </div>
  <p className="font-semibold">Research-only. Reviewed economic capital: Unavailable.
   Valid software ROC: Unavailable. Second human reviewer: Not signed.
   Investment rankings and Radar: Unchanged. No database writes.</p>
 </section>;
}
