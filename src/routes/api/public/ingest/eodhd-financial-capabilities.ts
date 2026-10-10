import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

/**
 * One-off read-only entitlement probe (two EODHD quota units). The browser
 * publishable Supabase key is intentionally insufficient.
 */
export const Route=createFileRoute("/api/public/ingest/eodhd-financial-capabilities")({
  server:{handlers:{
    POST:async({request})=>{
      const token=process.env.INTERNAL_JOB_TOKEN;
      if(!token || token.length<24)
        return Response.json({error:"Internal diagnostic token not configured"},{status:503});
      const given=Buffer.from(request.headers.get("x-internal-job-token")??"");
      const expected=Buffer.from(token);
      if(given.length!==expected.length || !timingSafeEqual(given,expected))
        return new Response("Unauthorized",{status:401});
      const {checkEodhdFinancialEntitlements}=await import(
        "@/lib/ingestion/providers/eodhd-entitlements.server");
      const result=await checkEodhdFinancialEntitlements();
      return Response.json(result,{status:result.configured?200:503});
    }
  }}
});
