import {evaluateSecEconomicCapitalDraft} from "@/lib/ingestion/sec/economic-capital-comparability-draft";
import type {SecScenarioSymbol} from "@/lib/ingestion/sec/point-in-time-valuation-sensitivity";
const fmt=(n:string|null)=>n===null?"Unverified":Number(n).toLocaleString("en-US");
const perc=(bps:string)=> (Number(bps)/100).toFixed(2)+"%";

export function SecEconomicCapitalComparability({symbol}:{symbol:SecScenarioSymbol}){
 const q=evaluateSecEconomicCapitalDraft(symbol);
 const s=q.software;
 return <section className="mb-5 space-y-4 rounded border border-border/70 bg-card/60 p-4 text-xs">
  <h2 className="text-sm font-semibold">Phase 2J15 · economic capital and comparability policy</h2>
  <p className="text-muted-foreground">
   DRAFT policy {q.policyVersion} · research as of 9 October 2026.
   No verified surplus cash, final financing perimeter or issuer-comparable ROC.
   Market cap is an earlier SEC share count multiplied by a dated closing price, not an exact market valuation.
  </p>
  <div className="grid gap-3 sm:grid-cols-3">
   <div className="rounded border border-border/60 p-3">
    <p className="text-muted-foreground">Reported liquid book balances</p>
    <p className="text-lg font-semibold tabular-nums">USD {fmt(q.liquidity.observedLiquidAssetsMillions)}m</p>
   </div>
   <div className="rounded border border-border/60 p-3">
    <p className="text-muted-foreground">Unprotected book-liquidity upper limit</p>
    <p className="text-lg font-semibold tabular-nums">USD {fmt(q.liquidity.unprotectedBookLiquidityCeilingMillions)}m</p>
    <p className="text-muted-foreground">
     Identified card settlement funds: {fmt(q.liquidity.observedSettlementReceivablesMillions)}m
    </p>
   </div>
   <div className="rounded border border-border/60 p-3">
    <p className="text-muted-foreground">Reviewed surplus / operating reserve</p>
    <p className="text-lg font-semibold">Not established</p>
    <p className="text-muted-foreground">Maximum book amount is not necessarily distributable cash.</p>
   </div>
  </div>
  <h3 className="font-semibold">Cash reserve sensitivity — hypothetical, not a policy-approved deduction</h3>
  <div className="overflow-x-auto">
   <table className="min-w-[630px] w-full">
    <thead className="border-b border-border/60 text-muted-foreground"><tr>
     <th className="text-left py-2">Reserve / surplus assumption</th>
     <th className="text-right py-2">Cash deducted USD m</th>
     <th className="text-right py-2">Book liquidity retained USD m</th>
     <th className="text-right py-2">Conditional EV USD bn</th>
     <th className="text-right py-2">Conditional EY</th>
    </tr></thead>
    <tbody>{q.liquidity.scenarios.map(x=><tr key={x.label} className="border-b border-border/30">
     <td className="py-2">{x.label.replaceAll("_"," ")}</td>
     <td className="text-right tabular-nums">{fmt(x.hypotheticalDeductionMillions)}</td>
     <td className="text-right tabular-nums">{fmt(x.residualOperationalBookLiquidityMillions)}</td>
     <td className="text-right tabular-nums">{(Number(x.conditionalEVUsd)/1e9).toFixed(3)}</td>
     <td className="text-right tabular-nums">{perc(x.conditionalOperatingEarningsYieldBps)}</td>
    </tr>)}</tbody>
   </table>
  </div>
  <h3 className="font-semibold">Enterprise financing-claim reconciliation</h3>
  <div className="overflow-x-auto">
   <table className="min-w-[670px] w-full">
    <thead className="border-b border-border/60 text-muted-foreground"><tr>
     <th className="text-left py-2">Instrument</th><th className="text-right py-2">USD m</th>
     <th className="text-left py-2 pl-3">Evidence / policy status</th>
     <th className="text-left py-2 pl-3">Illustrative EV treatment</th>
    </tr></thead>
    <tbody>{q.financing.ledger.map(c=><tr key={c.category} className="border-b border-border/30">
     <td className="py-2">{c.category.replaceAll("_"," ")}</td>
     <td className="text-right tabular-nums">{fmt(c.observedMillions)}</td>
     <td className="py-2 pl-3">
      {c.sourceUrl?<a className="underline" href={c.sourceUrl} target="_blank"
       rel="noopener noreferrer">{c.status.replaceAll("_"," ")}</a>:
       c.status.replaceAll("_"," ")}
      <p className="text-muted-foreground">{c.evidence}</p>
     </td>
     <td className="pl-3">{c.includedInIllustrativeEV?"Included once":
      c.status==="embedded_do_not_add"?"Already inside borrowing total":
      c.status==="policy_excluded"?"Excluded by baseline policy":
      c.status==="unresolved"?"Unknown — not assumed absent":"No claim issued"}</td>
    </tr>)}</tbody>
   </table>
  </div>
  {s&&<div className="space-y-3 rounded border border-border/60 p-3">
   <h3 className="font-semibold">Adobe: software quality diagnostics, not an industrial tangible-capital ROC</h3>
   <p className="text-muted-foreground">Four independently cross-footed FY2025 + current nine months
    − comparative nine months calculations. Based on original FY2025 10-K and Q3 FY2026 10-Q.
    R&D capitalisation and amortisation history are NOT reviewed; no adjusted ROIC is published.</p>
   <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
    {([
     ["TTM revenue", "USD "+fmt(s.ttmRevenueMillions)+"m"],
     ["TTM GAAP operating margin",perc(s.ttmOperatingMarginBps)],
     ["R&D as % of TTM revenue",perc(s.ttmResearchDevelopmentIntensityBps)],
     ["TTM operating cash flow", "USD "+fmt(s.ttmOperatingCashFlowMillions)+"m"],
     ["Operating CFO / op income",perc(s.ttmOperatingCashFlowToOperatingEarningsBps)],
     ["TTM stock compensation","USD "+fmt(s.ttmStockBasedCompensationMillions)+"m"],
     ["CFO minus SBC diagnostic", "USD "+fmt(s.ttmCashFlowLessSbcDiagnosticMillions)+"m"],
     ["CFO less SBC / op income",perc(s.ttmCashFlowLessSbcToOperatingEarningsBps)],
    ] as const).map(([label,value])=><div key={label} className="rounded border border-border/50 p-2">
     <p className="text-muted-foreground">{label}</p><p className="font-semibold tabular-nums">{value}</p>
    </div>)}
   </div>
   <p className="text-muted-foreground">
    CFO includes noncash stock-compensation add-backs; deducting SBC is only a quality
    diagnostic, not free cash flow, an equity owner's cash return, or a substitute for reinvestment.
    Margin and R&D intensity offer usable descriptive comparisons, but not a comparable Magic Formula ROC.
   </p>
   <p>FY + YTD SEC statement bridges: {s.statementArithmeticChecks.filter(x=>x.pass).length}
    /{s.statementArithmeticChecks.length} pass.</p>
  </div>}
  <details className="rounded border border-border/60 p-3">
   <summary className="cursor-pointer font-semibold">Outstanding source and economic accounting decisions</summary>
   <div className="mt-2 space-y-2 text-muted-foreground">
    {q.blockers.map((b,i)=><p key={i}>{i+1}. {b}</p>)}
   </div>
  </details>
  <p className="font-semibold">No live ranking · No model use · No score changes · No persisted inputs.</p>
 </section>;
}
