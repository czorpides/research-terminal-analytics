import { createFileRoute } from "@tanstack/react-router";

/**
 * Read-only, owner-only SEC pilot plan.
 * The client never selects arbitrary public CIKs or an unrestricted universe.
 */
export const Route = createFileRoute("/api/public/ingest/sec-pilot-candidates")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { checkOwnerAccess } = await import("@/lib/security/owner-access.server");
        const owner = await checkOwnerAccess(request);
        if (!owner.ok)
          return Response.json({ error: owner.error }, { status: owner.status });

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { PILOT_SYMBOLS, pickSecPilotCandidates, hasThreeConsecutiveSecYears } = await import(
            "@/lib/ingestion/sec/pilot-plan"
          );
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
            throw new Error("Unable to read the SEC pilot asset/source registry");
          const candidateIds = (assets.data ?? []).map(row => row.id);
          const previous = candidateIds.length
            ? await supabaseAdmin.from("fundamental_filings")
                .select("asset_id,period_end").eq("source_id", source.data.id)
                .in("asset_id", candidateIds)
            : { data: [], error: null };
          if (previous.error) throw new Error("Unable to read existing SEC filing coverage");
          const periodCounts = new Map<string,string[]>();
          for (const row of previous.data ?? []) {
            const dates=periodCounts.get(row.asset_id) ?? [];
            dates.push(String(row.period_end));
            periodCounts.set(row.asset_id,dates);
          }
          // Distinct rows are not evidence of 3 consecutive fiscal years.
          // Firms with a missing middle year are still eligible for repair.
          const coveredIds = [...periodCounts.entries()]
            .filter(([,years]) => hasThreeConsecutiveSecYears(years))
            .map(([assetId]) => assetId);
          // Without a cooldown, issuers for which SEC exposes only one or
          // two eligible 10-K years will be requested on every next click.
          // Recent no-progress/error attempts require separate review.
          const since = new Date(Date.now() - 30*60_000).toISOString();
          const recentRuns = await supabaseAdmin.from("ingestion_runs")
            .select("started_at,rows_ingested,details,status")
            .eq("source_id", source.data.id)
            .eq("data_category", "fundamentals")
            .gte("started_at", since)
            .order("started_at", { ascending: false })
            .limit(250);
          if (recentRuns.error) throw new Error("Unable to check SEC retry cooldown");
          const lastAttempt = new Map<string,{rows:number,status:string}>();
          for (const run of recentRuns.data ?? []) {
            const detail = run.details;
            const id = detail && typeof detail === "object" && !Array.isArray(detail)
              ? (detail as Record<string,unknown>).assetId : null;
            if (typeof id !== "string" || lastAttempt.has(id)) continue;
            lastAttempt.set(id, {
              rows: Number(run.rows_ingested ?? 0),
              status: String(run.status),
            });
          }
          const coolingIds = [...lastAttempt.entries()]
            .filter(([,last]) => last.rows === 0 &&
              (last.status === "success" || last.status === "partial" ||
                last.status === "failed"))
            .map(([id]) => id);
          const candidates = pickSecPilotCandidates(
            assets.data ?? [], [...coveredIds, ...coolingIds], 10,
          );
          return Response.json({
            candidates,
            pilotSize: PILOT_SYMBOLS.length,
            alreadyCovered: new Set(coveredIds).size,
            coolingDown: coolingIds.length,
            maxPerRequest: 2,
            status: candidates.length ? "ready" : "pilot_complete_or_unavailable",
          }, { headers: { "Cache-Control": "no-store" } });
        } catch {
          return Response.json(
            { error: "Unable to prepare the bounded SEC pilot" },
            { status: 503 },
          );
        }
      },
    },
  },
});
