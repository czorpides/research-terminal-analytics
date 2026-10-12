import {createFileRoute} from "@tanstack/react-router";
import {
  extractOriginalSecOperatingPreview,
  type SecCompanyFacts,
} from "@/lib/ingestion/sec/xbrl-operating-preview";
import {forceManualRedirect,requireNonRedirectResponse} from "@/lib/ingestion/providers/edge-safe-redirect";

/** Fixed original-issuer out-of-sample validation cohort. No auto-discovery,
 * no bulk provider requests, no original-10K writes, no scoring.
 */
const COHORT={
 MSFT:{cik:789019,accession:"0000950170-25-100235",periodEnd:"2025-06-30",role:"original_pilot"},
 GOOGL:{cik:1652044,accession:"0001652044-26-000018",periodEnd:"2025-12-31",role:"original_pilot"},
 NVDA:{cik:1045810,accession:"0001045810-26-000021",periodEnd:"2026-01-25",role:"original_pilot"},
 COST:{cik:909832,accession:"0000909832-26-000093",periodEnd:"2026-08-30",role:"independent_holdout"},
 ADBE:{cik:796343,accession:"0000796343-26-000003",periodEnd:"2025-11-28",role:"independent_holdout"},
 TXN:{cik:97476,accession:"0000097476-26-000059",periodEnd:"2025-12-31",role:"independent_holdout"},
} as const;

export const Route=createFileRoute("/api/public/ingest/sec-xbrl-preview")({
 server:{handlers:{
  GET:async({request})=>{
   const {checkOwnerAccess}=await import("@/lib/security/owner-access.server");
   const owner=await checkOwnerAccess(request);
   if(!owner.ok)return Response.json({error:owner.error},{status:owner.status});
   const symbol=new URL(request.url).searchParams.get("symbol")?.trim().toUpperCase();
   if(!symbol||!(symbol in COHORT))
     return Response.json({error:"Select one of six bounded, reviewed original 10-K issuers"},{
      status:400,headers:{"Cache-Control":"no-store"},
     });
   const sample=COHORT[symbol as keyof typeof COHORT];
   try{
    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    const db=supabaseAdmin as any;
    const [asset,contact]=await Promise.all([
      db.from("assets").select("id,symbol,currency,asset_class,active")
        .eq("symbol",symbol).eq("active",true).eq("asset_class","equity")
        .eq("currency","USD").single(),
      db.from("research_provider_settings").select("value")
        .eq("name","sec_edgar_user_agent").maybeSingle(),
    ]);
    if(asset.error||!asset.data||contact.error)throw Error("Issuer identity or SEC contact unavailable");
    const agent=String(contact.data?.value??"").trim();
    if(agent.length<12||!/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(agent))
      throw Error("Configured SEC contact identity unavailable");
    const filings=await db.from("fundamental_filings")
      .select("id,source_id,source_filing_id,period_end,raw,known_at")
      .eq("asset_id",asset.data.id).eq("source_filing_id",sample.accession)
      .eq("period_end",sample.periodEnd).eq("fiscal_period","FY")
      .eq("revision_no",1).eq("is_restatement",false).single();
    if(filings.error||!filings.data||
       Number(filings.data.raw?.cik)!==sample.cik||
       filings.data.raw?.form!=="10-K"||
       filings.data.raw?.accession!==sample.accession||
       !/^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/\d+\/\d+\/[\w.-]+$/.test(
         String(filings.data.raw?.primaryDocumentUrl??"")))
      throw Error("Original 10-K issuer accessions do not match stored evidence");
    const src=await db.from("data_sources").select("id")
      .eq("id",filings.data.source_id)
      .eq("provider_code","sec_edgar").eq("active",true).single();
    if(src.error||!src.data)throw Error("SEC source inactive");
    const cik=String(sample.cik).padStart(10,"0");
    // Exactly ONE upstream request, from explicit server-side CIK allowlist.
    const url="https://data.sec.gov/api/xbrl/companyfacts/CIK"+cik+".json";
    const response=await fetch(url,forceManualRedirect({
      headers:{"User-Agent":agent,"Accept":"application/json"},
      signal:AbortSignal.timeout(20000),cache:"no-store",
    }));
    requireNonRedirectResponse(response,"SEC official CompanyFacts");
    if(!response.ok)throw Error("Official SEC XBRL HTTP status "+response.status);
    const raw=await response.text();
    if(raw.length>24_000_000)throw Error("SEC XBRL response exceeds approved bound");
    const doc=JSON.parse(raw) as SecCompanyFacts;
    const preview=extractOriginalSecOperatingPreview(doc,sample);
    return Response.json({
      symbol,role:sample.role,
      originalAccession:sample.accession,
      sourceUrl:String(filings.data.raw.primaryDocumentUrl),
      originalFilingFirstObserved:filings.data.known_at,
      fetchMode:"explicit_owner_single_company_read_only",
      checkedNow:new Date().toISOString(),
      preview,
      sourceNotes:[
        "GAAP operating income is not automatically Magic Formula EBIT.",
        "Current and noncurrent carrying-value borrowing components exclude leases; aggregate parent debt and principal maturities are never added.",
        "Year-end common shares and post-year-end cover-page shares have different dates and cannot establish issuance without split/share-class review.",
        "Industry classification and economic EBIT/EV policies remain unapproved; none of these results enters existing scores.",
      ],
      permittedForScores:false,permittedForModels:false,
    },{headers:{"Cache-Control":"no-store"}});
   }catch{
    return Response.json({error:"Original SEC source preview unavailable or accession evidence failed validation"},{
      status:503,headers:{"Cache-Control":"no-store"},
    });
   }
  }
 }}
});
