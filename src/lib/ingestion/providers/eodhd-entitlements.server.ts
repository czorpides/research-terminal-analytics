import { canUse, recordCall } from "./quota.server";
import { parseEodhdEarnings } from "@/lib/calendar/providers/eodhd-earnings-normalizer";

export interface EodhdCapabilityStatus {
  capability: "annual_income_statements" | "earnings_calendar";
  available: boolean;
  httpStatus: number | null;
  reason: string;
  itemsReturned: number;
}
const ROOT="https://eodhd.com/api";
const MAX_BODY=2_000_000;

/**
 * Entitlement probe only: exactly two EODHD calls on explicit privileged
 * invocation. This deliberately does NOT ingest, schedule, infer EPS data or
 * change the user's scoring/price pipelines.
 */
export async function checkEodhdFinancialEntitlements():Promise<{
  configured:boolean;
  capabilities:EodhdCapabilityStatus[];
}> {
  const key=process.env.EODHD_API_KEY;
  if(!key)return {configured:false,capabilities:[]};
  const today=new Date().toISOString().slice(0,10);
  const next=new Date(Date.now()+7*86_400_000).toISOString().slice(0,10);
  const specs=[
    {
      capability:"annual_income_statements" as const,
      path:"/v1.1/fundamentals/AAPL.US",
      params:{filter:"Financials::Income_Statement::yearly",fmt:"json"},
    },{
      capability:"earnings_calendar" as const,
      path:"/calendar/earnings",
      params:{from:today,to:next,fmt:"json"},
    }
  ];
  const result:EodhdCapabilityStatus[]=[];
  for(const spec of specs){
    const allowed=await canUse("eodhd",100_000,5);
    if(!allowed.ok){
      result.push({capability:spec.capability,available:false,httpStatus:null,
        reason:"Provider quota gate: "+allowed.reason,itemsReturned:0});continue;
    }
    const url=new URL(ROOT+spec.path);
    Object.entries(spec.params).forEach(([k,v])=>url.searchParams.set(k,v));
    url.searchParams.set("api_token",key);
    try{
      const response=await fetch(url,{redirect:"error",signal:AbortSignal.timeout(15_000)});
      const status=response.status;
      const statusClass= status===402 || status===403 ? "entitlement" :
        status===429 ? "rate_limit" : status===401 ? "auth" :
        response.ok ? "ok" : "error";
      await recordCall("eodhd",statusClass,"Financial/earnings entitlement probe "+spec.capability+" HTTP "+status);
      if(!response.ok){
        result.push({capability:spec.capability,available:false,httpStatus:status,
          reason:status===402||status===403?"Not entitled under current EODHD subscription":
            status===429?"Provider rate limited":"Provider request unsuccessful",itemsReturned:0});
        continue;
      }
      const text=await response.text();
      if(text.length>MAX_BODY){result.push({capability:spec.capability,available:false,
        httpStatus:status,reason:"Response too large for entitlement probe",itemsReturned:0});continue;}
      let data:unknown;
      try{data=JSON.parse(text)}catch{
        result.push({capability:spec.capability,available:false,httpStatus:status,
          reason:"Non-JSON provider response; not evidence of entitlement",itemsReturned:0});continue;
      }
      if(spec.capability==="earnings_calendar"){
        try{
          const records=parseEodhdEarnings(data);
          result.push({capability:spec.capability,available:true,httpStatus:status,
            reason:"Provider returned valid earnings array (no persistent ingest enabled)",
            itemsReturned:records.length});
        }catch{
          result.push({capability:spec.capability,available:false,httpStatus:status,
            reason:"Earnings array absent or invalid; entitlement not established",itemsReturned:0});
        }
      } else {
        const valid=data && typeof data==="object" &&
          !Array.isArray(data) && Object.keys(data).some(x=>/^\d{4}-\d{2}-\d{2}$/.test(x));
        result.push({capability:spec.capability,available:Boolean(valid),
          httpStatus:status,reason:valid?"Dated statement rows available; no import yet":
            "No dated annual statement rows confirmed",itemsReturned:valid?Object.keys(data as object).length:0});
      }
    }catch(e){
      result.push({capability:spec.capability,available:false,httpStatus:null,
        reason:e instanceof Error?e.name:"Network probe failed",itemsReturned:0});
    }
  }
  return {configured:true,capabilities:result};
}
