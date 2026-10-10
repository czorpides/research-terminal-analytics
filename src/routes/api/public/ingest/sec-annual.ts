import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

export const Route=createFileRoute("/api/public/ingest/sec-annual")({
  server:{handlers:{
    POST:async({request})=>{
      // This endpoint is deliberately not callable with the browser's
      // publishable Supabase key, unlike the legacy ingestion scheduler.
      const required=process.env.INTERNAL_JOB_TOKEN;
      if(!required || required.length<24)
        return Response.json({error:"SEC recovery not configured: internal token missing"}, {status:503});
      const provided=request.headers.get("x-internal-job-token") ?? "";
      const a=Buffer.from(provided),b=Buffer.from(required);
      if(a.length!==b.length || !timingSafeEqual(a,b))
        return new Response("Unauthorized",{status:401});
      if(!process.env.SEC_EDGAR_USER_AGENT?.trim())
        return Response.json({error:"SEC contact User-Agent must be configured"}, {status:503});
      try {
        const body=await request.json() as {assetIds?:unknown};
        if(!Array.isArray(body.assetIds) || body.assetIds.length<1 || body.assetIds.length>2 ||
            body.assetIds.some((v)=>typeof v!=="string"))
          return Response.json({error:"assetIds must contain one or two asset UUIDs"}, {status:400});
        const {recoverSecAnnualFacts}=await import("@/lib/ingestion/sec/recover-annual.server");
        const result=await recoverSecAnnualFacts(body.assetIds as string[]);
        return Response.json(result,{status:result.results.some(x=>x.status==="failed")?207:200});
      } catch(e) {
        return Response.json({error:e instanceof Error?e.message:"SEC annual recovery failed"},{status:400});
      }
    }
  }}
});
