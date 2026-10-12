import {
 verifyThreeSoftwareFYSourceGaps,
} from "@/lib/ingestion/sec/software-fy-source-gap-closure";

const amount=(v:string|null)=>v===null?"Not verified":
 Number(v).toLocaleString("en-US",{maximumFractionDigits:2});
const columns=[
 ["liquidity","reportedLiquidBookAmountMillions","Cash + current securities"],
 ["liquidity","cashMillions","Reported cash and equivalents"],
 ["liquidity","shortTermSecuritiesMillions","Reported short-term securities"],
 ["liquidity","noncurrentInvestmentBookAmountMillions","Noncurrent securities (outside CA)"],
 ["liquidity","explicitlyLocatedRestrictedCashOutsideCashMillions","Restricted cash outside reported equivalents"],
 ["finance","reportedCurrentBorrowingMillions","Current borrowing (source scope)"],
 ["finance","reportedLongtermBorrowingCarryingMillions","Noncurrent borrowing (carrying value)"],
 ["finance","explicitFinanceLeaseMillions","Finance leases (explicit absence or unverified)"],
 ["finance","currentOperatingLeaseLiabilityMillions","Current operating lease liabilities"],
 ["finance","noncurrentOperatingLeaseLiabilityMillions","Noncurrent operating lease liabilities"],
 ["leases","originalReportedAnnualOperatingExpenseMillions","FY operating lease cost"],
 ["leases","separatelyIdentifiedFixedCostMillions","Separately identified fixed lease cost"],
 ["leases","separatelyIdentifiedVariableCostMillions","Separately identified variable lease cost"],
 ["leases","originalOperatingLeaseCashPaidMillions","Operating lease payments"],
 ["leases","sourceObservationPretaxOperatingIncomeBeforeDisclosedLeaseCostMillions","GAAP operating profit + disclosed lease cost (NOT adjusted EBIT)"],
 ["contractAssets","longtermCapitalizedCommissionMillions","Noncurrent contract commissions embedded in long-term assets"],
] as const;
export function SecSoftwareFYGapReview(){
 const x=verifyThreeSoftwareFYSourceGaps();
 return <section className="mb-5 space-y-4 rounded border border-border/70 bg-card/60 p-4 text-xs">
  <h2 className="text-sm font-semibold">Phase 2J20 · original FY cash, current debt and lease evidence</h2>
  <p className="text-muted-foreground">
   Three original SEC FY 10-Ks with arithmetic cross-footing. These historic
   FY figures are NOT October 2026 trailing data. Specific original account
   lines can be verified, but operational cash requirements, contract asset
   allocations, lease depreciation and finance interest remain unknown.
   Amounts USD millions.
  </p>
  <div className="flex flex-wrap gap-4">
   {x.cases.map(c=><a key={c.issuer} href={c.official10K} className="underline"
    target="_blank" rel="noopener noreferrer">
    {c.issuer} · {c.sourceFY} original 10-K
   </a>)}
  </div>
  <div className="overflow-x-auto"><table className="w-full min-w-[620px]">
   <thead className="border-b border-border/60 text-muted-foreground"><tr>
    <th className="py-2 text-left">Original filing line (USD m)</th>
    {x.cases.map(c=><th key={c.issuer} className="py-2 text-right">{c.issuer}</th>)}
   </tr></thead><tbody>
    {columns.map(([group,key,label])=><tr key={label} className="border-b border-border/30">
     <td className="py-2">{label}</td>
     {x.cases.map(c=><td key={c.issuer} className="text-right tabular-nums">
      {amount((c[group] as unknown as Record<string,string|null>)[key]??null)}
     </td>)}
    </tr>)}
   </tbody></table></div>
  <p className="text-muted-foreground">
   Adobe's FY2025 10-K explicitly states no finance leases; Autodesk's FY2026
   balance sheet explicitly has no current long-term notes. ServiceNow's
   2025 cash-flow statement locates $6m restricted cash in prepaid/other assets,
   OUTSIDE the $3,726m cash balance. Its current-debt presentation is not
   sufficient to certify an issuer-wide financing zero.
  </p>
  <h3 className="font-semibold">Observed liquid-asset classification sensitivity</h3>
  <div className="overflow-x-auto"><table className="w-full min-w-[580px]">
   <thead className="border-b border-border/60 text-muted-foreground"><tr>
    <th className="py-2 text-left">Cash inclusion assumption</th>
    {x.cases.map(c=><th key={c.issuer} className="py-2 text-right">{c.issuer} · partial book capital</th>)}
   </tr></thead><tbody>
    {x.cases[0].liquidity.scenarios.map((row,i)=><tr key={row.name}
     className="border-b border-border/30">
     <td className="py-2">{row.name.replaceAll("_"," ")}</td>
     {x.cases.map(c=><td key={c.issuer} className="text-right tabular-nums">
      {amount(c.liquidity.scenarios[i]?.conditionalUnapprovedCapitalSubsetMillions??null)}
     </td>)}
    </tr>)}
   </tbody></table></div>
  <p className="text-muted-foreground">
   This compares each cash-removal assumption against Phase 2J19's already
   INCOMPLETE original book-capital bridge. It is not operating capital.
   Autodesk remains unavailable because FY contract costs have no verified
   current/noncurrent allocation. The cash treated as surplus is never approved.
  </p>
  <h3 className="font-semibold">Lease-adjusted earnings consistency</h3>
  <p className="text-muted-foreground">
   Disclosed operating lease expenses and cash payments are known, but ROU
   depreciation and lease interest are not independently allocated. The
   GAAP operating-income-plus-lease-cost line is a pre-cost observation ONLY:
   it is not lease-capitalized EBIT and cannot be divided by ROU-inclusive
   invested capital for a valid return.
  </p>
  <details className="rounded border border-border/60 p-3">
   <summary className="cursor-pointer font-semibold">Unresolved source and policy gates</summary>
   <div className="mt-2 space-y-3 text-muted-foreground">
    {x.cases[0].unresolved.map((s,i)=><p key={i}>{i+1}. {s}</p>)}
   </div>
  </details>
  <p className="font-semibold">Independently reviewed surplus cash: Not established ·
   Current economic capital: Unavailable · Lease-adjusted EBIT: Unavailable ·
   Comparable software ROC: Unavailable · Human second sign-off: Not performed ·
   Production model and Radar: Unchanged · Database changes: 0.</p>
 </section>;
}