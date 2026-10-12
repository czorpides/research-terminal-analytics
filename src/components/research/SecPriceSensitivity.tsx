import {getSecValuationScenarios,type SecScenarioSymbol} from "@/lib/ingestion/sec/point-in-time-valuation-sensitivity";
const percentage=(s:string|null)=>s===null?"N/M":(Number(s)/100).toFixed(2)+"%";
export function SecPriceSensitivity({symbol}:{symbol:SecScenarioSymbol}){
 const x=getSecValuationScenarios(symbol);
 return <section className="mb-5 rounded border border-border/70 bg-card/60 p-4 text-xs space-y-3">
  <h2 className="font-semibold text-sm">Phase 2J13 · dated SEC price and capital sensitivity</h2>
  <p className="font-semibold text-[var(--warning)]">Archived annual-FY-only research scenario. Phase 2J14 above supersedes this section for updated Adobe TTM earnings and August 2026 borrowing/cash, and constrains Costco card-receivable liquidity. These older comparisons are retained ONLY for methodology audit.</p>
  <p>Original FY {x.originalFiscalEnd}; price USD {x.priceUsd} on 9 Oct 2026;
   public share count as of {x.sharesAsOf} (published {x.sharesFiled}).
   Approximate equity market capitalisation: USD {x.estimatedMarketCapitalizationBillions}bn.</p>
  <p className="text-muted-foreground">The price date differs from the original financial statement and share dates.
   Figures are conditional accounting sensitivities, NOT approved valuation inputs or Magic Formula scores.</p>
  <p className="flex gap-3 flex-wrap">
   <a className="underline" href={x.priceSourceUrl} target="_blank" rel="noopener noreferrer">Price source</a>
   <a className="underline" href={x.priceCrossCheckUrl} target="_blank" rel="noopener noreferrer">Price cross-check</a>
   <a className="underline" href={x.sharesSourceUrl} target="_blank" rel="noopener noreferrer">SEC share count</a>
  </p>
  <div className="overflow-x-auto"><table className="w-full min-w-[600px]">
   <thead className="text-muted-foreground border-b border-border/70"><tr>
    <th className="text-left py-2">Cash treatment</th>
    <th className="text-right py-2">Capital USD m</th>
    <th className="text-right py-2">ROC</th>
    <th className="text-right py-2">Conditional EV USD bn</th>
    <th className="text-right py-2">Conditional EY</th>
   </tr></thead><tbody>{x.cases.map(s=><tr key={s.name} className="border-b border-border/30">
    <td className="py-2">{s.name.replaceAll("_"," ")}</td>
    <td className="text-right tabular-nums">{Number(s.operatingCapitalMillions).toLocaleString()}</td>
    <td className="text-right tabular-nums">{percentage(s.returnOnCapitalBps)}</td>
    <td className="text-right tabular-nums">{(Number(s.conditionalEnterpriseValueUsd)/1e9).toFixed(3)}</td>
    <td className="text-right tabular-nums">{percentage(s.conditionalEarningsYieldBps)}</td>
   </tr>)}</tbody>
  </table></div>
  <p className="text-muted-foreground">N/M means nonpositive operating capital, not a valid percentage.
   All conditional EVs assume zero unobserved financing claims/noncontrolling interests, which is not verified.
   No values are saved, approved or submitted for scoring.</p>
  <details className="rounded border border-border/70 p-3"><summary className="cursor-pointer font-semibold">
   Material accounting and pricing limitations</summary>
   <div className="mt-2 text-muted-foreground space-y-2">
    {x.limitations.map((s,i)=><p key={i}>{i+1}. {s}</p>)}
   </div>
  </details>
 </section>;
}
