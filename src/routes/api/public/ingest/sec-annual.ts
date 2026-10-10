import { createFileRoute } from "@tanstack/react-router";
// Owner Supabase Auth (not a shared token) is verified before any provider work.


export const Route=createFileRoute("/api/public/ingest/sec-annual")({
  server:{handlers:{
    POST:async({request})=>{
      // This endpoint is deliberately not callable with the browser's
      // publishable Supabase key, unlike the legacy ingestion scheduler.
      const { checkOwnerAccess } = await import("@/lib/security/owner-access.server");
      const access = await checkOwnerAccess(request);
      if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
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
