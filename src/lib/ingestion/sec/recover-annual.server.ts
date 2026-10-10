import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { selectSecAnnualFilings, type SecAnnualFiling } from "./normalize-annual";

const SEC_BASE = "https://data.sec.gov";
const SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const SEC_MAX_ANNUAL = 3;
const SEC_MAX_ASSETS = 2;
const REQUEST_GAP_MS = 500;

export interface SecRecoveryResult {
  symbol: string;
  status: "updated" | "unchanged" | "skipped" | "failed";
  filingsInserted: number;
  factsInserted: number;
  reason?: string;
}
/**
 * Deliberately manual and bounded. No scheduled SEC requests until the
 * operator has configured a real SEC_EDGAR_USER_AGENT with contact email.
 * No historical simulation: known_at is the time this system first sees it.
 */
export async function recoverSecAnnualFacts(assetIds: string[]): Promise<{
  results: SecRecoveryResult[];
  filingsInserted: number;
  factsInserted: number;
}> {
  const agent = process.env.SEC_EDGAR_USER_AGENT?.trim();
  if (!agent || agent.length < 12 || !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(agent))
    throw new Error("SEC_EDGAR_USER_AGENT requires an identifiable organisation and contact email");
  if (!Array.isArray(assetIds) || assetIds.length < 1 || assetIds.length > SEC_MAX_ASSETS ||
      assetIds.some((id) => !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id)))
    throw new Error("Supply one or two valid internal asset IDs only");
  if (new Set(assetIds).size !== assetIds.length)
    throw new Error("Duplicate asset ID");

  const {data: source,error:sourceError} = await supabaseAdmin
    .from("data_sources").select("id").eq("provider_code","sec_edgar").eq("active",true).single();
  if (sourceError || !source) throw new Error("SEC EDGAR data source is not active");
  const sourceId=String(source.id);
  const symbols=await supabaseAdmin
    .from("assets").select("id,symbol,exchange,currency").in("id",assetIds)
    .eq("active",true).eq("asset_class","equity");
  if (symbols.error) throw symbols.error;
  if ((symbols.data??[]).length!==assetIds.length) throw new Error("One or more equities are not active");

  const tickerIndex = await secFetch<Record<string,unknown>>(SEC_TICKERS_URL, agent);
  const indexRecords=Object.values(tickerIndex) as Array<Record<string,unknown>>;
  const results:SecRecoveryResult[]=[];
  for(const assetId of assetIds) {
    const asset=(symbols.data??[]).find((v)=>v.id===assetId)!;
    const symbol=String(asset.symbol);
    if (!["XNAS","XNYS","XASE"].includes(String(asset.exchange)) || asset.currency!=="USD") {
      results.push({symbol,status:"skipped",filingsInserted:0,factsInserted:0,
        reason:"SEC original 10-K path is restricted to verified US-listed USD equities"});
      continue;
    }
    const matches=indexRecords.filter(v=>String(v.ticker??"").toUpperCase()===symbol.toUpperCase());
    if (matches.length!==1 || !Number.isInteger(Number(matches[0].cik_str))) {
      results.push({symbol,status:"skipped",filingsInserted:0,factsInserted:0,
        reason:"No unambiguous SEC ticker-to-CIK identification"});
      continue;
    }
    const cik=Number(matches[0].cik_str);
    const padded=String(cik).padStart(10,"0");
    let runId:string|null=null;
    try {
      const {data:run,error:runError}=await supabaseAdmin.from("ingestion_runs")
        .insert({
          source_id:sourceId,data_category:"fundamentals",status:"running",
          details:{symbol,assetId,provider:"sec_edgar",mode:"original_annual_10k",
            accessionDatePolicy:"raw filing metadata; known_at actual first ingestion"}
        }).select("id").single();
      if(runError || !run)throw runError??new Error("SEC run insert failed");
      runId=String(run.id);
      const submissions=await secFetch(SEC_BASE+"/submissions/CIK"+padded+".json",agent);
      const companyFacts=await secFetch(SEC_BASE+"/api/xbrl/companyfacts/CIK"+padded+".json",agent);
      const filings=selectSecAnnualFilings(cik,symbol,submissions,companyFacts,SEC_MAX_ANNUAL);
      let filingsInserted=0,factsInserted=0;
      for(const filing of filings) {
        const counts=await persistSecFiling({assetId,sourceId,cik,filing});
        filingsInserted+=counts.filingsInserted;factsInserted+=counts.factsInserted;
      }
      const status:SecRecoveryResult["status"]=filingsInserted?"updated":
        filings.length?"unchanged":"skipped";
      const reason=filings.length?"": "No original, report-matched 10-K annual XBRL facts; not inferred";
      await finishRun(runId,status==="skipped"?"partial":"success",factsInserted,reason);
      results.push({symbol,status,filingsInserted,factsInserted,...(reason?{reason}:{})});
    } catch(e) {
      const reason=e instanceof Error?e.message:String(e);
      if(runId) await finishRun(runId,"failed",0,reason);
      results.push({symbol,status:"failed",filingsInserted:0,factsInserted:0,reason:reason.slice(0,240)});
    }
  }
  return {results,filingsInserted:results.reduce((a,v)=>a+v.filingsInserted,0),
    factsInserted:results.reduce((a,v)=>a+v.factsInserted,0)};
}
async function persistSecFiling(input:{
  assetId:string;sourceId:string;cik:number;filing:SecAnnualFiling;
}):Promise<{filingsInserted:number;factsInserted:number}> {
  const {assetId,sourceId,cik,filing}=input;
  // No upgrades to an existing period are allowed in this initial
  // original-10K path; 10-K/A amendments need separate versioning review.
  const prev=await supabaseAdmin.from("fundamental_filings")
    .select("id").eq("asset_id",assetId).eq("source_id",sourceId)
    .eq("period_end",filing.periodEnd).eq("fiscal_period","FY")
    .order("revision_no",{ascending:false}).limit(1).maybeSingle();
  if(prev.error)throw prev.error;
  if(prev.data) return {filingsInserted:0,factsInserted:0};
  const knownAt=new Date().toISOString();
  const facts=[...filing.facts].sort((a,b)=>a.metricCode.localeCompare(b.metricCode));
  const digest=createHash("sha256").update(JSON.stringify({
    accn:filing.accession,period:filing.periodEnd,items:facts
  })).digest("hex");
  const url=filing.primaryDocument
    ? "https://www.sec.gov/Archives/edgar/data/"+cik+"/"+filing.accession.replace(/-/g,"")+"/"+filing.primaryDocument
    : null;
  const {data:newFiling,error:insertError}=await supabaseAdmin.from("fundamental_filings")
    .insert({
      asset_id:assetId,source_id:sourceId,source_filing_id:filing.accession,
      content_hash:digest,period_end:filing.periodEnd,fiscal_year:Number(filing.periodEnd.slice(0,4)),
      fiscal_period:"FY",published_at:null,known_at:knownAt,reported_currency:"USD",
      revision_no:1,is_restatement:false,supersedes_filing_id:null,
      raw:{
        provenance:"SEC EDGAR CompanyFacts + submissions",cik,form:"10-K",
        accession:filing.accession,filedDate:filing.filedDate,
        acceptanceLocal:filing.acceptanceLocal,
        primaryDocumentUrl:url,reportDate:filing.periodEnd,
        firstObservedAt:knownAt,
        publicationTimePrecision:"unknown; SEC local acceptance retained without timezone inference",
        facts: facts.map(f=>({tag:f.tag,metricCode:f.metricCode}))
      } as unknown as Json
    }).select("id").single();
  if(insertError||!newFiling)throw insertError??new Error("SEC filing insert failed");
  const rows=facts.map((f)=>({
    filing_id:newFiling.id,asset_id:assetId,source_id:sourceId,
    metric_code:f.metricCode,value_num:f.value,unit:f.unit,
    period_end:filing.periodEnd,known_at:knownAt,revision_no:1,
    is_restatement:false,
    raw:{form:"10-K",tag:f.tag,accn:filing.accession,firstObservedAt:knownAt} as Json
  }));
  const saved=await supabaseAdmin.from("fundamental_facts").insert(rows);
  if(saved.error) {
    // Failure must not be reported as success and an incomplete filing must
    // not be consumed by the scorer. Cleanup only this newly inserted row.
    const cleanup=await supabaseAdmin.from("fundamental_filings").delete().eq("id",newFiling.id);
    if(cleanup.error) throw new Error("SEC fact insert and filing rollback failed: "+saved.error.message);
    throw saved.error;
  }
  return {filingsInserted:1,factsInserted:rows.length};
}
async function finishRun(id:string,status:"success"|"failed"|"partial",rows:number,error:string) {
  const result=await supabaseAdmin.from("ingestion_runs")
    .update({status,finished_at:new Date().toISOString(),rows_ingested:rows,
      error:error||null}).eq("id",id);
  if(result.error)throw result.error;
}
async function secFetch<T=unknown>(url:string,agent:string):Promise<T> {
  await new Promise((resolve)=>setTimeout(resolve,REQUEST_GAP_MS));
  // Only two official SEC hostnames are permitted; never follow an
  // arbitrary external redirect with our declared identity.
  const parsed=new URL(url);
  if(parsed.protocol!=="https:"||!["data.sec.gov","www.sec.gov"].includes(parsed.hostname))
    throw new Error("Rejected external SEC fetch host");
  const response=await fetch(url,{
    redirect:"error",
    headers:{"User-Agent":agent,"Accept":"application/json","Accept-Encoding":"gzip, deflate"},
    signal:AbortSignal.timeout(20000)
  });
  if(!response.ok)throw new Error("SEC HTTP "+response.status+" at "+parsed.pathname);
  const body=await response.text();
  if(body.length>24_000_000)throw new Error("SEC response exceeds bounded limit");
  return JSON.parse(body) as T;
}
