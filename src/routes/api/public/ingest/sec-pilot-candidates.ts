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
          const { PILOT_SYMBOLS, pickSecPilotCandidates } = await import(
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
                .select("asset_id").eq("source_id", source.data.id)
                .in("asset_id", candidateIds)
            : { data: [], error: null };
          if (previous.error) throw new Error("Unable to read existing SEC filing coverage");
          const coveredIds = (previous.data ?? []).map(row => row.asset_id);
          const candidates = pickSecPilotCandidates(
            assets.data ?? [], coveredIds, 10,
          );
          return Response.json({
            candidates,
            pilotSize: PILOT_SYMBOLS.length,
            alreadyCovered: new Set(coveredIds).size,
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
