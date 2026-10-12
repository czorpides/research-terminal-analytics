import {getSoftwareSourceHoldout,getRDPolicyStress,type SoftwareIssuer} from "@/lib/ingestion/sec/software-holdout-rd-sensitivity";
import {getCostcoSeasonalLiquidityReview} from "@/lib/ingestion/sec/costco-cash-seasonality-review";
const fmt=(v:string|null)=>v===null?"Unavailable":Number(v).toLocaleString("en-US",{maximumFractionDigits:6});
const pc=(bps:string)=> (Number(bps)/100).toFixed(2)+"%";
function SoftwareTable(){
 const companies=(["ADBE","ADSK"] as const).map(symbol=>({
  symbol,valuation:getSoftwareSourceHoldout(symbol),research:getRDPolicyStress(symbol),
 }));
 return <div className="space-y-3">
  <p className="text-muted-foreground">
   Adobe is the previously source-reviewed issuer; Autodesk is a NEW, independent software issuer
   held out from the original SEC workbench cohort. Each uses latest publicly available 10-K
   plus 10-Q year-to-date comparatives before 9 October 2026.
   Their FY and interim periods differ, and neither has an approved invested-capital return.
  </p>
  <div className="flex flex-wrap gap-3">
   {companies.map(x=><div className="flex flex-wrap gap-2" key={x.symbol}>
    <span className="font-semibold">{x.symbol}</span>
    <a href={x.valuation.fySourceUrl} target="_blank" rel="noopener noreferrer" className="underline">Original 10-K</a>
    <a href={x.valuation.interimSourceUrl} target="_blank" rel="noopener noreferrer" className="underline">Original 10-Q</a>
   </div>)}
  </div>
  <div className="overflow-x-auto"><table className="w-full min-w-[540px]">
   <thead className="border-b border-border/70 text-muted-foreground"><tr>
    <th className="text-left py-2">Latest reported TTM (USD m unless ratio)</th>
    {companies.map(x=><th className="text-right py-2" key={x.symbol}>{x.symbol}</th>)}
   </tr></thead><tbody>
    {([
     ["Revenue","revenueMillions"],
     ["GAAP operating income","operatingIncomeMillions"],
     ["Research and development","rndMillions"],
     ["Operating cash flow (not FCF)","operatingCashFlowMillions"],
     ["Cash-flow SBC addback","sbcAddbackMillions"],
     ["CFO minus SBC diagnostic (not FCF)","cashFlowLessSbcMillions"],
    ] as const).map(([label,key])=><tr key={key} className="border-b border-border/30">
     <td className="py-2">{label}</td>{companies.map(x=>
      <td className="text-right tabular-nums" key={x.symbol}>{fmt(x.valuation.ttm[key])}</td>)}
    </tr>)}
    {([
     ["GAAP operating margin","operatingMarginBps"],
     ["R&D / revenue","rAndDIntensityBps"],
     ["CFO / GAAP operating income (non-like-for-like)","operatingCashFlowToOperatingIncomeBps"],
    ] as const).map(([label,key])=><tr key={key} className="border-b border-border/30">
     <td className="py-2">{label}</td>{companies.map(x=>
      <td className="text-right tabular-nums" key={x.symbol}>{pc(x.valuation.ttm[key])}</td>)}
    </tr>)}
   </tbody></table></div>
  <p className="text-muted-foreground">TTM original statement bridge pass:
   {' '}{companies.map(c=>c.symbol+" "+c.valuation.sourceChecks.filter(x=>x.passed).length+
    "/"+c.valuation.sourceChecks.length).join(" · ")}.
   Cash-flow-based ratios are diagnostics with non-comparable tax and working-capital bases,
   not return on capital or shareholder free cash flow.</p>
  <h3 className="font-semibold">R&D capitalisation — full-FY cohort stock-only research stress</h3>
  <div className="overflow-x-auto"><table className="w-full min-w-[550px]">
   <thead className="border-b border-border/70 text-muted-foreground"><tr>
    <th className="text-left py-2">Year-end capitalised R&D treatment</th>
    {companies.map(c=><th className="text-right py-2" key={c.symbol}>{c.symbol} hypothetical asset (USD m)</th>)}
   </tr></thead><tbody>{([2,3,5] as const).map(y=><tr key={y} className="border-b border-border/30">
    <td className="py-2">{y}-year straight-line research life (end-of-year cohort)</td>
    {companies.map(c=><td className="text-right tabular-nums" key={c.symbol}>
     {fmt(c.research.methods.find(x=>x.years===y)!.conditionalUnamortisedAssetMillions)}
    </td>)}
   </tr>)}</tbody></table></div>
  <p className="text-muted-foreground">
   Research stock illustration uses original annual 2023–2025 Adobe and 2024–2026 Autodesk
   R&D, NOT overlapping TTM expense as a new annual cohort. Five-year history is incomplete
   and is intentionally unavailable. No earnings amortisation adjustment,
   R&D-adjusted ROC, cross-sector rank or price-based valuation is calculated.
  </p>
 </div>;
}
function CostcoCash(){
 const r=getCostcoSeasonalLiquidityReview();
 return <div className="space-y-3">
  <p className="text-muted-foreground">
   Original FY2026 10-K plus Q3 FY2026 10-Q provide three irregular original SEC
   liquid-book-value / unsettled card-settlement observations. They reveal seasonality
   but cannot establish an economic operating-cash reserve.
  </p>
  <div className="overflow-x-auto"><table className="w-full min-w-[510px]">
   <thead className="border-b border-border/70 text-muted-foreground"><tr>
    <th className="text-left py-2">Observation</th>
    <th className="text-right py-2">Cash + investments, USD m</th>
    <th className="text-right py-2">Unsettled card receivables, USD m</th>
    <th className="text-right py-2">Residual book liquidity, USD m</th>
   </tr></thead><tbody>{r.observedQuarters.map(o=><tr key={o.observedAt} className="border-b border-border/30">
    <td className="py-2"><a className="underline" href={o.sourceUrl} target="_blank"
     rel="noopener noreferrer">{o.observedAt}</a></td>
    <td className="text-right tabular-nums">{fmt(o.liquidBookAssetsMillions)}</td>
    <td className="text-right tabular-nums">{fmt(o.cardSettlementFundsMillions)}</td>
    <td className="text-right tabular-nums">{fmt(o.residualBookLiquidityMillions)}</td>
   </tr>)}</tbody></table></div>
  <p className="text-muted-foreground">
   Observed residual range: USD {fmt(r.roughVisibleResidualMinMillions)}m to
   {fmt(r.roughVisibleResidualMaxMillions)}m. The lowest observation is NOT a
   permissible operating-cash reserve, and the latest residual is NOT automatically distributable.
  </p>
  <p className="text-muted-foreground">
   FY 2024/25/26 operating cash flow: USD {r.possibleAnnualCashFlowEvidence.fiscal2024CfoMillions}m /
   {r.possibleAnnualCashFlowEvidence.fiscal2025CfoMillions}m /
   {r.possibleAnnualCashFlowEvidence.fiscal2026CfoMillions}m.
   CFO is not cash surplus. Debt {r.latestNonleaseBorrowingMillions}m,
   finance lease {r.latestFinanceLeaseMillions??"Unverified"}m, operating leases
   excluded by current draft policy {r.latestOperatingLeaseMillions}m.
  </p>
  <details className="rounded border border-border/60 p-3">
   <summary className="cursor-pointer font-semibold">Cash and financing review blockers</summary>
   <div className="mt-2 space-y-2 text-muted-foreground">
    {r.unresolved.map((p,i)=><p key={i}>{i+1}. {p}</p>)}
   </div>
  </details>
 </div>;
}
export function SecIndependentHoldoutReview({mode}:{mode:"software"|"costco"}){
 return <section className="mb-5 rounded border border-border/70 bg-card/60 p-4 text-xs space-y-4">
  <h2 className="text-sm font-semibold">
   Phase 2J16 · {mode==="software"?"independent software issuer and R&D stress":
    "Costco operating-cash / financing seasonality"}
  </h2>
  {mode==="software"?<SoftwareTable/>:<CostcoCash/>}
  <p className="font-semibold">Second human sign-off: not performed.
   Model eligible: No · Ranking eligible: No · Database changes: 0.</p>
 </section>;
}
