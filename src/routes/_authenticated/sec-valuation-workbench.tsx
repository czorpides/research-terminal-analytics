import {createFileRoute,Link} from "@tanstack/react-router";
import {useEffect,useState} from "react";
import {AppShell} from "@/components/layout/AppShell";
import {SectionHeader} from "@/components/layout/SectionHeader";
import {Button} from "@/components/ui/button";
import {supabase} from "@/integrations/supabase/client";
import {
 SEC_VALUATION_FIELDS,SEC_VALUATION_COHORT,
 type SecValuationFieldKey,type SecValuationSymbol,
 type ManualFactMap,type ValuationPreviewResponse,
} from "@/lib/ingestion/sec/valuation-workbench";
import {SecPriceSensitivity} from "@/components/research/SecPriceSensitivity";
import {SecLatestAsOfReconciliation} from "@/components/research/SecLatestAsOfReconciliation";
import {SecEconomicCapitalComparability} from "@/components/research/SecEconomicCapitalComparability";
import {SecIndependentHoldoutReview} from "@/components/research/SecIndependentHoldoutReview";
import {SecHistoricalEconomicsReview} from "@/components/research/SecHistoricalEconomicsReview";
import {SecSoftwareCapitalPerimeter} from "@/components/research/SecSoftwareCapitalPerimeter";
import {SecSoftwareCapitalPolicyMatrix} from "@/components/research/SecSoftwareCapitalPolicyMatrix";
import {SecSoftwareFYGapReview} from "@/components/research/SecSoftwareFYGapReview";

export const Route=createFileRoute("/_authenticated/sec-valuation-workbench")({
 head:()=>({meta:[{title:"SEC valuation workbench — Research Terminal"},
  {name:"description",content:"Owner-only, source-anchored Magic Formula policy diagnostics. No score/model writes."}]}),
 component:SecValuationWorkbench,
});

type DraftField={millions:string;section:string};
const intoUsd=(value:string):string|null=>{
 const s=value.trim();
 if(!/^(0|[1-9]\d*)(?:\.\d{1,6})?$/.test(s))return null;
 const [whole,frac=""]=s.split(".");
 return (BigInt(whole)*1000000n+BigInt((frac+"000000").slice(0,6))).toString();
};
const million=(usd:string|null)=>{
 if(usd===null)return "—";
 try{return (Number(BigInt(usd))/1000000).toLocaleString("en-US",{maximumFractionDigits:3})}catch{return "—"}
};
const percent=(bps:string|null)=>bps===null?"—":(Number(bps)/100).toFixed(2)+"%";

function SecValuationWorkbench(){
 const [symbol,setSymbol]=useState<SecValuationSymbol>("AMZN");
 const [baseline,setBaseline]=useState<ValuationPreviewResponse|null>(null);
 const [result,setResult]=useState<ValuationPreviewResponse|null>(null);
 const [fields,setFields]=useState<Partial<Record<SecValuationFieldKey,DraftField>>>({});
 const [market,setMarket]=useState({millions:"",asOf:"",sourceUrl:"",description:""});
 const [loading,setLoading]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState<string|null>(null);
 useEffect(()=>{
  let cancelled=false;
  setFields({});setMarket({millions:"",asOf:"",sourceUrl:"",description:""});
  setResult(null);setBaseline(null);setError(null);setLoading(true);
  void (async()=>{
   try{
    const {data,error:authError}=await supabase.auth.getSession();
    if(authError||!data.session?.access_token)throw Error("Owner sign-in required");
    const response=await fetch("/api/public/research/sec-valuation-preview?symbol="+symbol,{
     headers:{Authorization:"Bearer "+data.session.access_token},cache:"no-store"});
    const json=await response.json();
    if(!response.ok)throw Error(json.error??"Original filing evidence unavailable");
    if(json.permittedForScoring!==false||json.permittedForModels!==false||
       json.storedChanges!==0)throw Error("Read-only safety contract mismatch");
    if(!cancelled)setBaseline(json as ValuationPreviewResponse);
   }catch(e){if(!cancelled)setError(e instanceof Error?e.message:"Preview unavailable")}
   finally{if(!cancelled)setLoading(false)}
  })();
  return()=>{cancelled=true};
 },[symbol]);

 function updateField(key:SecValuationFieldKey,field:keyof DraftField,value:string){
  setResult(null);
  setFields(old=>({...old,[key]:{millions:old[key]?.millions??"",
   section:old[key]?.section??"",[field]:value}}));
 }
 function loadOriginalObservedAmounts(){
  if(!baseline)return;
  const next={...fields};
  for(const item of baseline.independentSourceReview.fields){
   if(!SEC_VALUATION_FIELDS.some(f=>f.key===item.key))continue;
   const key=item.key as SecValuationFieldKey;
   if(next[key]?.millions?.trim())continue;
   next[key]={millions:item.amountMillions,section:item.sourceSection};
  }
  setFields(next);setResult(null);
 }
 async function calculate(){
  if(!baseline||busy)return;
  setError(null);setBusy(true);setResult(null);
  try{
   const supplementary:ManualFactMap={};
   for(const line of SEC_VALUATION_FIELDS){
    const input=fields[line.key];
    if(!input||(!input.millions.trim()&&!input.section.trim()))continue;
    const amount=intoUsd(input.millions);
    if(amount===null)throw Error(line.label+": use nonnegative USD millions (up to 6 decimal places)");
    supplementary[line.key]={
     valueUsd:amount,sourceSection:input.section.trim(),
     sourceUrl:baseline.originalSourceUrl,
    };
   }
   let marketInput:null|{valueUsd:string;asOf:string;sourceUrl:string;sourceDescription:string}=null;
   if(Object.values(market).some(x=>x.trim()!=="")){
    const amount=intoUsd(market.millions);
    if(amount===null)throw Error("Market cap: use nonnegative USD millions");
    marketInput={valueUsd:amount,asOf:market.asOf.trim(),
     sourceUrl:market.sourceUrl.trim(),sourceDescription:market.description.trim()};
   }
   const {data,error:authError}=await supabase.auth.getSession();
   if(authError||!data.session?.access_token)throw Error("Owner sign-in required");
   const response=await fetch("/api/public/research/sec-valuation-preview",{
    method:"POST",cache:"no-store",headers:{
     Authorization:"Bearer "+data.session.access_token,"Content-Type":"application/json"},
    body:JSON.stringify({symbol,supplementary,market:marketInput}),
   });
   const json=await response.json();
   if(!response.ok)throw Error(json.error??"Read-only valuation calculation unavailable");
   if(json.permittedForScoring!==false||json.permittedForModels!==false||
      json.storedChanges!==0||json.originalAccession!==baseline.originalAccession)
    throw Error("Returned valuation safety or original-issuer identity mismatch");
   setResult(json as ValuationPreviewResponse);
  }catch(e){setError(e instanceof Error?e.message:"Calculation unavailable")}
  finally{setBusy(false)}
 }
 const active=result??baseline;
 const groups=[...new Set(SEC_VALUATION_FIELDS.map(f=>f.section))];
 return <AppShell>
  <SectionHeader code="SEC · Phase 2J11" title="Original SEC valuation workbench"
   purpose="Provisional Magic Formula arithmetic with explicit source gaps, finance leases and operating capital. Owner-only, no stored data or scores."/>
  <section className="mb-4 rounded border border-border/70 bg-card/60 p-4 text-xs space-y-3">
   <p className="font-semibold">Source-noted but NOT accounting-approved for models</p>
   <p className="text-muted-foreground">
    Company anchors below were independently reconciled against original 10-K financial statements
    in the previous research phase. New numbers you enter are unverified transcriptions,
    even if the calculations balance. This workbench never saves, ranks or scores.
   </p>
   <div className="flex flex-wrap items-end gap-3">
    <label className="space-y-1">
     <span className="block text-muted-foreground">Original 10-K issuer</span>
     <select value={symbol} onChange={e=>setSymbol(e.currentTarget.value as SecValuationSymbol)}
      className="rounded border border-border bg-background p-2">
      {Object.keys(SEC_VALUATION_COHORT).map(s=><option key={s} value={s}>{s}</option>)}
     </select>
    </label>
    <div className="min-w-[14rem]">
     <span className="text-muted-foreground">Original filing</span>
     <div className="font-mono">{baseline?.originalPeriodEnd??(loading?"Loading…":"Unavailable")}</div>
     <div className="font-mono text-muted-foreground">{baseline?.originalAccession??"—"}</div>
    </div>
    {baseline&&<a className="underline" rel="noopener noreferrer" target="_blank"
      href={baseline.originalSourceUrl}>Open original SEC 10-K</a>}
    <Link className="underline" to="/data-health">Data Health</Link>
   </div>
   <p className="text-muted-foreground">
    First observed: {baseline?.knownAt??"—"} · Policy: {baseline?.policyVersion??"—"}
   </p>
  </section>
  {error&&<p className="mb-4 rounded border border-destructive/50 p-3 text-sm text-destructive">{error}</p>}
  {baseline&&<>
   <section className="mb-5 rounded border border-border/70 bg-card/60 p-4">
    <h2 className="mb-3 text-sm font-semibold">Source-anchored original 10-K values</h2>
    <div className="overflow-x-auto">
     <table className="w-full text-xs"><thead className="text-muted-foreground">
      <tr className="border-b border-border/70"><th className="py-2 text-left">Statement item</th>
       <th className="py-2 text-right">USD million</th><th className="py-2 text-left pl-4">Original source section</th>
      </tr></thead><tbody>{baseline.sourceAnchors.map(a=><tr key={a.key} className="border-b border-border/30">
       <td className="py-2 font-mono">{a.key}</td>
       <td className="py-2 text-right tabular-nums">{million(a.valueUsd)}</td>
       <td className="py-2 pl-4 text-muted-foreground">{a.section}</td>
      </tr>)}</tbody>
     </table>
    </div>
   </section>
   <section className="mb-5 rounded border border-border/70 bg-card/60 p-4 text-xs space-y-3">
    <h2 className="text-sm font-semibold">Phase 2J12 · original filing independent accounting recheck</h2>
    <p className="text-muted-foreground">Statement and note amounts are separately cross-footed against the filed 10-K.
    These checks verify arithmetic, not the economic valuation policy or a second human review.
    Research-model and score permissions remain disabled.</p>
    <p>{baseline.independentSourceReview.checks.filter(x=>x.status==="matches").length}
      /{baseline.independentSourceReview.checks.length} bridges match
      · Borrowing scope: {baseline.independentSourceReview.borrowingPerimeter.replaceAll("_"," ")}
      · Reviewer attestation: {baseline.independentSourceReview.reviewerAttestation.replaceAll("_"," ")}</p>
    <Button variant="outline" onClick={loadOriginalObservedAmounts}>
      Populate reported 10-K amounts into empty fields
    </Button>
    <p className="text-muted-foreground">Only explicitly observed line items are inserted, each with its actual SEC note.
    No missing nonoperating classification, unrestricted cash, finance lease absence or market price is silently set to zero.
    Review the values before submitting a provisional calculation.</p>
    <div className="overflow-x-auto">
     <table className="w-full min-w-[670px]"><thead><tr className="border-b border-border/60 text-muted-foreground">
      <th className="text-left py-2">Original 10-K observation</th><th className="text-right py-2">USD m</th>
      <th className="text-left py-2 pl-3">Section</th></tr></thead>
     <tbody>{baseline.independentSourceReview.fields.map(f=><tr key={f.key} className="border-b border-border/40">
      <td className="py-2 font-mono">{f.key}</td><td className="text-right tabular-nums">{f.amountMillions}</td>
      <td className="pl-3 text-muted-foreground">{f.sourceSection}</td>
     </tr>)}</tbody></table>
    </div>
    <h3 className="font-semibold">Unresolved accounting decisions</h3>
    {baseline.independentSourceReview.flags.map((f,i)=><p key={i} className="text-muted-foreground">
     • {f}
    </p>)}
   </section>
   {symbol==="ADBE"&&<SecSoftwareFYGapReview/>}
   {symbol==="ADBE"&&<SecSoftwareCapitalPolicyMatrix/>}
   {symbol==="ADBE"&&<SecSoftwareCapitalPerimeter/>}
   {symbol==="ADBE"&&<SecHistoricalEconomicsReview type="software"/>}
   {symbol==="COST"&&<SecHistoricalEconomicsReview type="costco"/>}
   {symbol==="ADBE"&&<SecIndependentHoldoutReview mode="software"/>}
   {symbol==="COST"&&<SecIndependentHoldoutReview mode="costco"/>}
   {(symbol==="COST"||symbol==="ADBE")&&<SecEconomicCapitalComparability symbol={symbol}/>}
   {(symbol==="COST"||symbol==="ADBE")&&<SecLatestAsOfReconciliation symbol={symbol}/>}
   {(symbol==="COST"||symbol==="ADBE")&&<SecPriceSensitivity symbol={symbol}/>}
   <section className="mb-5 rounded border border-border/70 bg-card/60 p-4 text-xs">
    <h2 className="text-sm font-semibold">Additional original 10-K figures</h2>
    <p className="mt-2 mb-4 text-muted-foreground">Enter amounts in USD millions. Record the exact note/statement section for EACH value. Enter 0 only if the original report supports zero. Blank means unavailable. Inputs are temporary in this browser session.</p>
    {groups.map((g,i)=><details open={i===0} key={g} className="mb-2 rounded border border-border/50">
     <summary className="cursor-pointer p-3 font-semibold">{g} · {SEC_VALUATION_FIELDS.filter(f=>f.section===g).length} inputs</summary>
     <div className="overflow-x-auto p-3 pt-0"><table className="w-full min-w-[680px] text-xs">
      <thead><tr className="text-muted-foreground"><th className="py-2 text-left">Input</th>
       <th className="py-2 text-left">USD millions</th><th className="py-2 text-left">10-K note / statement section</th></tr></thead>
      <tbody>{SEC_VALUATION_FIELDS.filter(f=>f.section===g).map(f=><tr key={f.key} className="border-t border-border/40">
       <td className="w-[39%] py-2 pr-3">{f.label}</td>
       <td className="py-2 pr-2"><input aria-label={f.label+" USD millions"} value={fields[f.key]?.millions??""}
        onChange={e=>updateField(f.key,"millions",e.currentTarget.value)}
        placeholder="e.g. 125.750" inputMode="decimal" className="w-36 rounded border border-border bg-background px-2 py-1.5"/></td>
       <td className="py-2"><input aria-label={f.label+" original note"} value={fields[f.key]?.section??""}
        onChange={e=>updateField(f.key,"section",e.currentTarget.value)}
        placeholder="e.g. Note 5 — Leases, p. 68" className="w-full rounded border border-border bg-background px-2 py-1.5"/></td>
      </tr>)}</tbody>
     </table></div>
    </details>)}
   </section>
   <section className="mb-5 rounded border border-border/70 bg-card/60 p-4 text-xs">
    <h2 className="text-sm font-semibold">Contemporaneous equity market capitalisation</h2>
    <p className="my-2 text-muted-foreground">Market data is NOT in the original 10-K. Supply a dated source and an exact time on or after the first-observed SEC filing timestamp to avoid look-ahead bias. Use total equity market cap, not price per share.</p>
    <div className="grid gap-3 md:grid-cols-2">
     {([
      ["millions","Equity market cap (USD millions)","e.g. 250000"],
      ["asOf","Market snapshot (ISO timestamp)","2026-10-12T14:30:00Z"],
      ["sourceUrl","Market-data source URL (HTTPS)","https://..."],
      ["description","Source details / share-class scope","Provider, price, share count and classes"],
     ] as const).map(([k,label,placeholder])=>
      <label key={k} className="block"><span className="mb-1 block text-muted-foreground">{label}</span>
       <input className="w-full rounded border border-border bg-background p-2" value={market[k]}
        placeholder={placeholder} onChange={e=>{setResult(null);setMarket(old=>({...old,[k]:e.currentTarget.value}))}}/>
      </label>)}
    </div>
    <Button className="mt-4" disabled={busy} onClick={()=>void calculate()}>
     {busy?"Checking candidate…":"Calculate read-only provisional ratios"}
    </Button>
    <p className="mt-2 text-muted-foreground">No data will be saved or automatically promoted into Magic Formula, Piotroski or Radar.</p>
   </section>
   <section className="mb-6 rounded border border-border/70 bg-card/60 p-4">
    <h2 className="text-sm font-semibold">Accounting readiness and methodology comparison</h2>
    <p className="my-2 text-xs text-muted-foreground">Latest preview status: {active?.assessment.status??"—"} · {active?.assessment.missingFields.length??0} required values unavailable · {active?.suppliedManualFields.length??0} manual values entered. {result?"Inputs assessed (not independently corroborated).":"Showing source-only baseline; calculate to review your entries."}</p>
    <div className="overflow-x-auto">
     <table className="w-full text-xs"><thead><tr className="border-b border-border/60 text-muted-foreground">
      <th className="py-2 text-left">Metric</th><th className="py-2 text-right">2J10 draft (USD m)</th><th className="py-2 text-right">Legacy-style reconstruction (USD m)</th>
     </tr></thead><tbody>
      {([
       ["Operating earnings",active?.assessment.gaapOperatingIncomeUsd,null],
       ["Borrowings excluding leases",active?.assessment.financialBorrowingsExLeasesUsd,null],
       ["Finance leases",active?.assessment.financeLeaseLiabilityUsd,null],
       ["Operating leases (excluded from EV)",active?.assessment.operatingLeaseLiabilityExcludedUsd,null],
       ["Operating working capital",active?.assessment.operatingWorkingCapitalUsd,null],
       ["Capital employed",active?.assessment.operatingCapitalEmployedUsd,active?.legacyStyle.capitalEmployedUsd],
       ["Enterprise value",active?.assessment.enterpriseValueUsd,active?.legacyStyle.enterpriseValueUsd],
      ] as const).map(([label,refined,legacy])=><tr key={label} className="border-b border-border/40">
       <td className="py-2">{label}</td><td className="text-right tabular-nums">{million(refined??null)}</td>
       <td className="text-right tabular-nums">{million(legacy??null)}</td>
      </tr>)}
      <tr className="font-semibold border-b border-border/40"><td className="py-2">Return on capital</td>
       <td className="text-right">{percent(active?.assessment.returnOnCapitalBps??null)}</td>
       <td className="text-right">{percent(active?.legacyStyle.returnOnCapitalBps??null)}</td></tr>
      <tr className="font-semibold"><td className="py-2">Earnings yield</td>
       <td className="text-right">{percent(active?.assessment.earningsYieldBps??null)}</td>
       <td className="text-right">{percent(active?.legacyStyle.earningsYieldBps??null)}</td></tr>
     </tbody></table>
    </div>
    <p className="mt-3 text-xs text-muted-foreground">Legacy-style is a reconstruction of basic v0.1 equations on manually supplied inputs, NOT a prior published score and not debt-definition equivalent. Do not rank issuers using either column.</p>
    {(active?.assessment.problems.length??0)>0&&<div className="mt-3 text-xs text-destructive">
     <p className="font-semibold">Validation problems</p>
     {active?.assessment.problems.map((p,i)=><p key={i}>• {p}</p>)}
    </div>}
    {(active?.assessment.missingFields.length??0)>0&&<div className="mt-3 text-xs text-muted-foreground">
     <p className="font-semibold">Missing inputs</p>
     <p className="font-mono break-words">{active?.assessment.missingFields.join(" · ")}</p>
    </div>}
   </section>
  </>}
 </AppShell>;
}
