import {createFileRoute} from "@tanstack/react-router";
import {z} from "zod";

/** SEC-only historical evidence probe. NO automatic S&P approvals or DB writes. */
export const Route=createFileRoute("/api/public/catalysts/read-sec-gaap")({
 server:{handlers:{POST:async ({request})=>{
  const {authorizeInternalJobRequest}=await import("@/lib/security/internal-job-auth.server");
  if(!authorizeInternalJobRequest(request))return new Response("Unauthorized",{status:401});
  const raw:unknown=await request.json().catch(()=>null);
  const valid=z.object({symbols:z.array(z.string().regex(/^[A-Z0-9.-]{1,22}$/)).min(1).max(4),
    asOf:z.string().datetime({offset:true}).optional()}).strict().safeParse(raw);
  if(!valid.success)return Response.json({ok:false,error:"Invalid bounded SEC request"},{status:422});
  const userAgent=process.env.SEC_EDGAR_USER_AGENT;
  if(!userAgent)return Response.json({ok:false,error:"SEC source reader not configured; contact User-Agent required"},{status:503});
  try{
   const {fetchSecContinuingProfitability}=await import("@/lib/catalysts/providers/sec-gaap-continuing.server");
   const result=await fetchSecContinuingProfitability({symbols:valid.data.symbols,userAgent,
    asOf:valid.data.asOf?new Date(valid.data.asOf):undefined});
   return Response.json({ok:true,observations:result,computedAt:new Date().toISOString(),
    disclaimer:"Only direct SEC GAAP continuing income with filing acceptance timestamps is included. This is evidence, NOT S&P eligibility approval, committee probability, or live first-seen historical signal."});
  }catch(error){
   return Response.json({ok:false,error:error instanceof Error?error.message:"Source evidence reader unavailable"},{status:503});
  }
 }}},
});
