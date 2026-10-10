import { createFileRoute } from "@tanstack/react-router";


/**
 * One-off read-only entitlement probe (two EODHD quota units). The browser
 * publishable Supabase key is intentionally insufficient.
 */
export const Route=createFileRoute("/api/public/ingest/eodhd-financial-capabilities")({
  server:{handlers:{
    POST:async({request})=>{
      const { checkOwnerAccess } = await import("@/lib/security/owner-access.server");
      const access = await checkOwnerAccess(request);
      if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
      const {checkEodhdFinancialEntitlements}=await import(
        "@/lib/ingestion/providers/eodhd-entitlements.server");
      const result=await checkEodhdFinancialEntitlements();
      return Response.json(result,{status:result.configured?200:503});
    }
  }}
});
