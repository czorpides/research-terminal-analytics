/**
 * Railway one-shot cron for the isolated staging Catalyst Intelligence app.
 * Service should execute, log only non-sensitive counts, and exit.
 * The SEC worker remains disabled until a real SEC contact User-Agent is set.
 */
const STAGING_URL="https://research-terminal-web-staging.up.railway.app";

export async function pollCatalystSources({
 fetcher=fetch,
 token,
 baseUrl=STAGING_URL,
 spEnabled=false,
 secEnabled=false,
 symbols=["QCOM","PENG","BE","AAOI","INTC","NBIS"],
}) {
 if(!token||Buffer.byteLength(token,"utf8")<32)throw new Error("INTERNAL_JOB_TOKEN is absent or too short.");
 const url=new URL(baseUrl);
 if(url.origin!==STAGING_URL)throw new Error("Catalyst cron can only target the isolated staging app.");
 if(secEnabled&&(symbols.length<1||symbols.length>8||symbols.some(s=>!/^[A-Z0-9.-]{1,22}$/.test(s))))
   throw new Error("SEC poll must contain at most 8 validated US symbols.");
 const tasks=[
  ...(spEnabled?[{name:"sp_dji_index_news",route:"/api/public/catalysts/poll-sp-index",body:{}}]:[]),
  ...(secEnabled?[{name:"sec_earnings",route:"/api/public/catalysts/ingest-sec",body:{symbols,lookbackDays:45}}]:[]),
 ];
 const results=[];
 for(const task of tasks) {
   try {
     const response=await fetcher(new URL(task.route,STAGING_URL),{
       method:"POST",
       headers:{"Authorization":`Bearer ${token}`,"Content-Type":"application/json"},
       body:JSON.stringify(task.body),
       signal:AbortSignal.timeout(100_000),
       redirect:"error",
     });
     const result=await response.json().catch(()=>null);
     const info=result && typeof result==="object" ? result : {};
     results.push({
       provider:task.name,ok:response.ok && info.ok===true,
       httpStatus:response.status,
       message: response.ok ? "Polling completed" : "Source poll returned a non-success HTTP response",
     });
   }catch{
     results.push({provider:task.name,ok:false,httpStatus:null,message:"Source poll timed out or was unreachable"});
   }
 }
 return results;
}

if(process.argv[1]?.endsWith("catalyst-source-cron.mjs")){
 const token=process.env.INTERNAL_JOB_TOKEN;
 const secEnabled=process.env.CATALYST_SEC_POLL_ENABLED==="true";
 const spEnabled=process.env.CATALYST_SP_POLL_ENABLED==="true";
 try{
   const results=await pollCatalystSources({token,secEnabled,spEnabled});
   if(!results.length)console.info("[catalyst-cron] no providers enabled; safe staging idle run");
   // Never log credentials, raw event payloads, user email or headers.
   console.info("[catalyst-cron]",JSON.stringify(results));
   if(results.some(r=>!r.ok))process.exitCode=1;
 }catch(error){
   console.error("[catalyst-cron] configuration error",error instanceof Error?error.message:"Unknown issue");
   process.exitCode=1;
 }
}
