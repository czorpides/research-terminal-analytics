import {
 annualRDRollforward,originalSecResearchComparison,type SoftwareHoldout,
} from "@/lib/ingestion/sec/rd-rollforward-third-issuer";
import {getCostcoOriginalEightQuarterCash} from "@/lib/ingestion/sec/costco-eight-quarter-cash-evidence";
const usd=(x:string)=>Number(x).toLocaleString("en-US",{maximumFractionDigits:3});
const pc=(bps:string)=> (Number(bps)/100).toFixed(2)+"%";

function ThreeSoftware(){
 const report=originalSecResearchComparison();
 const names=["ADBE","ADSK","NOW"] as const;
 const r=names.map(issuer=>({issuer,rows:([2,3,5] as const).map(life=>
  annualRDRollforward(issuer,life))}));
 return <div className="space-y-3">
  <p className="text-muted-foreground">{report.warning}</p>
  <div className="flex gap-4 flex-wrap">{r.map(x=><div key={x.issuer}>
   <strong>{x.issuer}</strong>: {x.rows[0].fiscalYear}
   <span className="ml-2"><a className="underline" href={x.rows[0].sourceOriginalAnnualCohorts[0].original10k}
    target="_blank" rel="noopener noreferrer">Older original 10-K</a></span>
   <span className="ml-2"><a className="underline" href={x.rows[0].sourceOriginalAnnualCohorts[5].original10k}
    target="_blank" rel="noopener noreferrer">Latest original 10-K</a></span>
  </div>)}</div>
  <div className="overflow-x-auto"><table className="w-full min-w-[850px]">
   <thead className="border-b border-border/60 text-muted-foreground"><tr>
    <th className="text-left py-2">Issuer</th><th className="text-right">Life</th>
    <th className="text-right">Opening USD m</th>
    <th className="text-right">FY R&D + USD m</th>
    <th className="text-right">Amortisation − USD m</th>
    <th className="text-right">Closing USD m</th>
    <th className="text-right">GAAP op margin</th>
    <th className="text-right">Hypothetical FY op margin</th>
   </tr></thead><tbody>{report.studies.map(a=><tr key={a.issuer+"-"+a.hypotheticalResearchLife}
    className="border-b border-border/30">
    <td className="py-2">{a.issuer} FY{a.fiscalYear}</td>
    <td className="text-right">{a.hypotheticalResearchLife}y</td>
    <td className="text-right tabular-nums">{usd(a.openingAssetMillions)}</td>
    <td className="text-right tabular-nums">{usd(a.researchAdditionMillions)}</td>
    <td className="text-right tabular-nums">{usd(a.assumedAnnualAmortisationMillions)}</td>
    <td className="text-right tabular-nums">{usd(a.closingAssetMillions)}</td>
    <td className="text-right tabular-nums">{pc(a.reportedGAAPOperatingMarginBps)}</td>
    <td className="text-right tabular-nums">{pc(a.illustrativeAdjustedOperatingMarginBps)}</td>
   </tr>)}</tbody></table></div>
  <p className="text-muted-foreground">
   Each hypothetical FY operating profit equals GAAP operating profit + reported annual R&D
   − straight-line amortisation of PRIOR fiscal-year cohorts. All figures have original
   six-year filings; this is a mechanical assumption, NOT an approved adjusted EBIT or ROIC.
   Research-asset recognition at fiscal year end is an analytical convention. No R&D TTM
   period is double-counted as a second annual asset. Acquired technologies, subscription
   contract costs, leases, goodwill and economic capital are not reconciled.
  </p>
  <p className="font-semibold">Cross-issuer economic ROI: unavailable · Independent
   second reviewer: not performed · Ranking permission: No.</p>
 </div>;
}
function CostcoEightQuarters(){
 const q=getCostcoOriginalEightQuarterCash();
 return <div className="space-y-3">
  <p className="text-muted-foreground">
   Original Costco liquidity MD&A over FY2025 and FY2026, with FY2024 opening reference.
   Eight consecutive fiscal quarter intervals, nine observations. Financial reporting dates
   are NOT SEC filing receipt timestamps and are never substituted for market known-at dates.
  </p>
  <div className="overflow-x-auto"><table className="w-full min-w-[560px]">
   <thead className="border-b border-border/60 text-muted-foreground"><tr>
    <th className="py-2 text-left">Original quarter/FY date</th>
    <th className="py-2 text-right">Cash + investments USD m</th>
    <th className="py-2 text-right">Unsettled card USD m</th>
    <th className="py-2 text-right">Residual book USD m</th>
   </tr></thead><tbody>{q.fullSeries.map(x=><tr key={x.periodEnd} className="border-b border-border/30">
    <td className="py-2"><a className="underline" href={x.sourceUrl} target="_blank"
     rel="noopener noreferrer">{x.periodEnd} ({x.sourceForm})</a></td>
    <td className="text-right tabular-nums">{usd(x.reportedLiquidAssetsMillions)}</td>
    <td className="text-right tabular-nums">{usd(x.unsettledCardReceivablesMillions)}</td>
    <td className="text-right tabular-nums">{usd(x.postSettlementBookLiquidityMillions)}</td>
   </tr>)}</tbody></table></div>
  <p className="text-muted-foreground">
   Observed residual book range: USD {usd(q.bookResidualRangeMillions.lowest)}m
   – {usd(q.bookResidualRangeMillions.highest)}m. Neither bound is a verified operating
   cash requirement nor a valid enterprise-value cash deduction.
  </p>
  <details className="border border-border/60 rounded p-3">
   <summary className="cursor-pointer font-semibold">Unresolved economic cash controls</summary>
   <div className="mt-2 space-y-2 text-muted-foreground">
    {q.limits.map((v,i)=><p key={i}>{i+1}. {v}</p>)}
   </div>
  </details>
  <p className="font-semibold">Cash-policy approved: No · Point-in-time quarterly receipt dates verified: No · Model eligibility: No.</p>
 </div>;
}
export function SecHistoricalEconomicsReview({type}:{type:"software"|"costco"}){
 return <section className="mb-5 rounded border border-border/70 bg-card/60 p-4 text-xs space-y-3">
  <h2 className="text-sm font-semibold">
   Phase 2J17 · {type==="software"?"three-issuer annual R&D amortisation roll-forward":
    "Costco eight-quarter operating liquidity review"}
  </h2>
  {type==="software"?<ThreeSoftware/>:<CostcoEightQuarters/>}
  <p className="font-semibold">Owner-only research · No DB writes · No model or Radar scores.</p>
 </section>;
}
