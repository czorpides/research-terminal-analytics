import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { PILOT_SYMBOLS } from "./pilot-plan";
import { planSecControlledWave } from "./controlled-plan";
import { summarizeSecLedgerIntegrity } from "./quality-summary";

/** Always recomputed in production before an owner enqueues work.
 * No public client-supplied stock symbols / CIKs are authoritative.
 */
export async function getSecQueueExpansionPlan() {
  const [assets,source,integrity]=await Promise.all([
    supabaseAdmin.from("assets")
      .select("id,symbol,exchange,currency").eq("active",true)
      .eq("asset_class","equity").in("symbol",[...PILOT_SYMBOLS]),
    supabaseAdmin.from("data_sources").select("id")
      .eq("provider_code","sec_edgar").eq("active",true).single(),
    supabaseAdmin.from("sec_original_10k_integrity" as "assets")
      .select("*").limit(500),
  ]);
  if(assets.error||source.error||integrity.error||!source.data)
    throw new Error("SEC source, identity or integrity unavailable");
  const ids=(assets.data??[]).map(a=>a.id);
  const [filings,runs,active]=await Promise.all([
    ids.length?supabaseAdmin.from("fundamental_filings")
      .select("asset_id,period_end").eq("source_id",source.data.id).in("asset_id",ids)
      :Promise.resolve({data:[],error:null}),
    supabaseAdmin.from("ingestion_runs").select("details,status,rows_ingested")
      .eq("source_id",source.data.id).eq("data_category","fundamentals")
      .gte("started_at",new Date(Date.now()-30*60_000).toISOString())
      .order("started_at",{ascending:false}).limit(500),
    (supabaseAdmin as any).from("sec_queue_jobs")
      .select("asset_id").in("state",["queued","running","retry_wait"]).limit(500),
  ]);
  if(filings.error||runs.error||active.error)
    throw new Error("SEC evidence or queue state unavailable");
  const periods=new Map<string,string[]>();
  for(const f of filings.data??[]){
    const dates=periods.get(f.asset_id)??[];
    dates.push(String(f.period_end));periods.set(f.asset_id,dates);
  }
  const integrityBlocked=new Set<string>();
  type Integrity={asset_id:string;checked_filings:number|null;
    invalid_metadata_filings:number|null;empty_filings:number|null;
    duplicate_metrics:number|null;inconsistent_fact_rows:number|null};
  for(const a of integrity.data as unknown as Integrity[]??[]){
    if(summarizeSecLedgerIntegrity(a).status!=="no_structural_flags")
      integrityBlocked.add(a.asset_id);
  }
  const cooldown=new Set<string>();
  const seen=new Set<string>();
  for(const row of runs.data??[]){
    const details=row.details as Record<string,unknown>|null;
    const id=details && !Array.isArray(details)?details.assetId:null;
    if(typeof id!=="string"||seen.has(id))continue;
    seen.add(id);
    if(row.status==="running" || row.status==="failed" ||
       (Number(row.rows_ingested??0)===0 &&
         ["success","partial"].includes(String(row.status))))
      cooldown.add(id);
  }
  for(const a of active.data as {asset_id:string}[]??[]) cooldown.add(a.asset_id);
  return planSecControlledWave({
    mode:"expand",assets:assets.data??[],
    periodsByAsset:periods,coolingAssetIds:cooldown,
    integrityBlockedAssetIds:integrityBlocked,
  });
}
