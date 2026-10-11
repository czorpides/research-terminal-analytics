import { createFileRoute } from "@tanstack/react-router";

/**
 * Owner-only read-only plans. Each request proposes EITHER a max-two issuer
 * historical repair OR a max-ten untouched issuer expansion. Never runs SEC.
 */
export const Route = createFileRoute("/api/public/ingest/sec-pilot-candidates")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { checkOwnerAccess } = await import("@/lib/security/owner-access.server");
        const owner = await checkOwnerAccess(request);
        if (!owner.ok)
          return Response.json({ error: owner.error }, { status: owner.status });
        const { parseSecControlledMode, planSecControlledWave } = await import(
          "@/lib/ingestion/sec/controlled-plan"
        );
        let mode: ReturnType<typeof parseSecControlledMode>;
        try {
          mode = parseSecControlledMode(new URL(request.url).searchParams.get("mode"));
        } catch {
          return Response.json({ error: "SEC mode must be repair or expand" }, { status: 400 });
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { PILOT_SYMBOLS } = await import("@/lib/ingestion/sec/pilot-plan");
          const [assets, source] = await Promise.all([
            supabaseAdmin.from("assets")
              .select("id,symbol,exchange,currency")
              .eq("active", true).eq("asset_class", "equity")
              .in("symbol", [...PILOT_SYMBOLS]),
            supabaseAdmin.from("data_sources")
              .select("id").eq("provider_code", "sec_edgar").eq("active", true)
              .single(),
          ]);
          if (assets.error || source.error || !source.data)
            throw new Error("Unable to read SEC source registry");
          const candidateIds = (assets.data ?? []).map(row => row.id);
          const [previous, integrity, recentRuns] = await Promise.all([
            candidateIds.length
              ? supabaseAdmin.from("fundamental_filings")
                  .select("asset_id,period_end").eq("source_id",source.data.id)
                  .eq("fiscal_period","FY").eq("revision_no",1)
                  .eq("is_restatement",false).in("asset_id",candidateIds)
              : Promise.resolve({data:[],error:null}),
            supabaseAdmin.from("sec_original_10k_integrity" as "assets")
              .select("*").limit(500),
            supabaseAdmin.from("ingestion_runs")
              .select("started_at,rows_ingested,details,status")
              .eq("source_id", source.data.id).eq("data_category","fundamentals")
              .gte("started_at",new Date(Date.now()-30*60_000).toISOString())
              .order("started_at",{ascending:false}).limit(500),
          ]);
          if (previous.error || integrity.error || recentRuns.error)
            throw new Error("Unable to read SEC evidence, retry or integrity controls");

          const periodsByAsset = new Map<string,string[]>();
          for(const row of previous.data ?? []) {
            const list=periodsByAsset.get(row.asset_id) ?? [];
            list.push(String(row.period_end));
            periodsByAsset.set(row.asset_id,list);
          }
          // Fail closed on bad stored evidence: keep these issuers out of both
          // waves pending operator review, rather than masking quality defects.
          type DbIntegrity = {
            asset_id:string;checked_filings:number | null;
            invalid_metadata_filings:number | null;empty_filings:number | null;
            duplicate_metrics:number | null;inconsistent_fact_rows:number | null;
          };
          const { summarizeSecLedgerIntegrity } = await import(
            "@/lib/ingestion/sec/quality-summary"
          );
          const blockedByIntegrity=new Set<string>();
          for(const row of (integrity.data ?? []) as unknown as DbIntegrity[]) {
            if (summarizeSecLedgerIntegrity(row).status !== "no_structural_flags")
              blockedByIntegrity.add(row.asset_id);
          }

          const lastAttempt=new Map<string,{rows:number;status:string}>();
          for(const run of recentRuns.data ?? []) {
            const raw=run.details;
            const assetId=raw && typeof raw==="object" && !Array.isArray(raw)
              ? (raw as Record<string,unknown>).assetId : null;
            if(typeof assetId!=="string" || lastAttempt.has(assetId))continue;
            lastAttempt.set(assetId,{
              rows:Number(run.rows_ingested??0),status:String(run.status),
            });
          }
          const cooling=new Set<string>();
          for(const [id,last] of lastAttempt) {
            if(last.status==="running" || last.status==="failed" ||
               (last.rows===0 && ["success","partial"].includes(last.status)))
              cooling.add(id);
          }
          const plan=planSecControlledWave({
            mode,assets:assets.data??[],periodsByAsset,
            coolingAssetIds:cooling,integrityBlockedAssetIds:blockedByIntegrity,
          });
          return Response.json(plan,{headers:{"Cache-Control":"no-store"}});
        } catch {
          return Response.json(
            { error:"Unable to prepare controlled SEC recovery plan" },
            { status:503,headers:{"Cache-Control":"no-store"} },
          );
        }
      },
    },
  },
});
