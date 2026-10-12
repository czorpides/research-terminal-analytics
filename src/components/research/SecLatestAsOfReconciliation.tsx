import {getSec2J14Reconciliation,type Sec2J14Result} from "@/lib/ingestion/sec/latest-asof-reconciliation";
import type {SecScenarioSymbol} from "@/lib/ingestion/sec/point-in-time-valuation-sensitivity";

const fmt=(s:string)=>Number(s).toLocaleString("en-US");
const per=(s:string)=>(Number(s)/100).toFixed(2)+"%";
function Evidence({v}:{v:Sec2J14Result}){
 return <div className="space-y-3">
  <p className="text-muted-foreground">
   Latest source: {v.financialSource.form} · {v.financialSource.periodEnd} ·
   filed {v.financialSource.filedDate} · accession {v.financialSource.accession}.
   All values below use filings public at the 9 October 2026 market close.
  </p>
  <a className="underline" href={v.financialSource.originalUrl}
   target="_blank" rel="noopener noreferrer">Open original SEC filing</a>
  <div className="grid gap-2 sm:grid-cols-3">
   <div className="rounded border border-border/60 p-3">
    <p className="text-muted-foreground">Trailing-12-month GAAP operating income</p>
    <p className="mt-1 text-lg font-semibold tabular-nums">USD {fmt(v.earnings.trailing12MonthsOperatingIncomeMillions)}m</p>
    <p className="text-muted-foreground">{v.earnings.basis==="reported_fy_latest_asof"?
      "Most recent FY operating income":"FY2025 + 9m FY2026 − 9m FY2025"}</p>
   </div>
   <div className="rounded border border-border/60 p-3">
    <p className="text-muted-foreground">Latest finance borrowings excluding leases</p>
    <p className="mt-1 text-lg font-semibold tabular-nums">USD {fmt(v.latestBalance.carryingBorrowingsExLeasesMillions)}m</p>
    <p className="text-muted-foreground">
     Finance lease liability: {v.latestBalance.financeLeaseLiabilitiesMillions===null?
      "not verified":fmt(v.latestBalance.financeLeaseLiabilitiesMillions)+"m"}.
    </p>
   </div>
   <div className="rounded border border-border/60 p-3">
    <p className="text-muted-foreground">Hypothetical cash deduction ceiling</p>
    <p className="mt-1 text-lg font-semibold tabular-nums">USD {fmt(v.latestBalance.cashDeductionCeilingMillions)}m</p>
    <p className="text-muted-foreground">{v.latestBalance.cashCeilingReason}</p>
   </div>
  </div>
  <div className="overflow-x-auto">
   <table className="w-full min-w-[620px]">
    <thead className="border-b border-border/60 text-muted-foreground"><tr>
     <th className="py-2 text-left">Valuation assumption</th>
     <th className="py-2 text-right">Cash deducted (USD m)</th>
     <th className="py-2 text-right">Conditional EV (USD bn)</th>
     <th className="py-2 text-right">TTM operating earnings yield</th>
     <th className="py-2 text-right">ROC usable?</th>
    </tr></thead><tbody>{v.scenarios.map(s=><tr key={s.assumption} className="border-b border-border/40">
     <td className="py-2">{s.assumption.replaceAll("_"," ")}</td>
     <td className="text-right tabular-nums">{fmt(s.provisionalDeductionMillions)}</td>
     <td className="text-right tabular-nums">{(Number(s.evProxyUsd)/1e9).toFixed(3)}</td>
     <td className="text-right tabular-nums">{per(s.operatingEarningsYieldBps)}</td>
     <td className="text-right">No</td>
    </tr>)}</tbody>
   </table>
  </div>
  {v.softwareTangibleCapitalDiagnostic&&<div className="rounded border border-border/60 p-3">
    <p className="font-semibold">Software-capital suitability: generic ROC blocked</p>
    <p className="text-muted-foreground mt-1">
     Conditional tangible capital (USD m): cash retained
     {' '}{fmt(v.softwareTangibleCapitalDiagnostic.cashRetainedMillions)};
     cash excluded {fmt(v.softwareTangibleCapitalDiagnostic.cashExcludedMillions)};
     cash plus short investments excluded
     {' '}{fmt(v.softwareTangibleCapitalDiagnostic.cashAndInvestmentsExcludedMillions)}.
    </p>
    <p className="text-muted-foreground mt-1">{v.softwareTangibleCapitalDiagnostic.warning}</p>
  </div>}
  <p className="text-muted-foreground">
   These are counterfactual yields on an approximate market-cap proxy, not certified EV
   or investable results. No verified NCI, unrestricted cash, operating liquidity,
   finance-lease completeness or share count exactly at the market close. Return on
   capital is intentionally suppressed until a consistent capital policy is approved.
  </p>
  <details className="rounded border border-border/60 p-3">
   <summary className="cursor-pointer font-semibold">
    Exact original statement and debt-note cross-footing ({v.financingBridges.filter(b=>b.pass).length}/{v.financingBridges.length} passed)
   </summary>
   <div className="mt-3 space-y-1">
    {v.financingBridges.map((b,i)=><p key={i} className="border-b border-border/30 py-1">
     {b.pass?"Matches":"ERROR"} · {b.name}:
     {b.components.join(" + ")} = {b.calculatedMillions}m
    </p>)}
   </div>
  </details>
  <details className="rounded border border-border/60 p-3">
   <summary className="cursor-pointer font-semibold">Model eligibility and unresolved economic accounting</summary>
   <div className="mt-3 space-y-2 text-muted-foreground">
    {v.unresolved.map((s,i)=><p key={i}>{i+1}. {s}</p>)}
   </div>
  </details>
 </div>;
}
export function SecLatestAsOfReconciliation({symbol}:{symbol:SecScenarioSymbol}){
 const v=getSec2J14Reconciliation(symbol);
 return <section className="mb-5 rounded border border-border/70 bg-card/60 p-4 text-xs space-y-3">
  <h2 className="text-sm font-semibold">Phase 2J14 · TTM, latest financing and operating cash constraints</h2>
  <p className="text-muted-foreground">
   Version {v.policyVersion}. Research-only point-in-time accounting evidence.
   Price snapshot fixed at 9 October 2026, not a live market quote.
  </p>
  <Evidence v={v}/>
  <p className="font-semibold">Model eligible: No · Scoring eligible: No · Stored changes: 0</p>
 </section>;
}
