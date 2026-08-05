import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { AdvancedSecurityResearchView } from "@/components/research/AdvancedSecurityResearchView";
import { getOpportunityCandidateFreshness } from "@/lib/opportunity/integrity.functions";
import { applyOpportunityEvidenceIntegrity } from "@/lib/opportunity/integrity";
import { getInstitutionalOpportunityWorkspace } from "@/lib/opportunity/institutional.functions";
import { presentOpportunityCandidate } from "@/lib/opportunity/presentation";
import { getOpportunityRadarWorkspace } from "@/lib/opportunity/workspace.functions";
import { getAdvancedSecurityResearch } from "@/lib/research/advanced-security.functions";

const detailQuery = (assetId: string) => queryOptions({
  queryKey: ["advanced-security-research", assetId],
  queryFn: () => getAdvancedSecurityResearch({ data: { assetId } }),
  staleTime: 5 * 60 * 1000,
});

const radarQuery = queryOptions({
  queryKey: ["opportunity-radar", "horizons-v6-evidence-integrity"],
  queryFn: async () => {
    const [workspace, freshness] = await Promise.all([
      getOpportunityRadarWorkspace(),
      getOpportunityCandidateFreshness(),
    ]);
    return applyOpportunityEvidenceIntegrity(workspace, freshness);
  },
  staleTime: 15 * 60 * 1000,
});

const institutionalQuery = queryOptions({
  queryKey: ["opportunity-radar", "institutional-v1"],
  queryFn: () => getInstitutionalOpportunityWorkspace(),
  staleTime: 60 * 60 * 1000,
});

export const Route = createFileRoute("/_authenticated/research/$assetId")({
  head: () => ({
    meta: [
      { title: "Advanced company research — Research Terminal" },
      { name: "description", content: "Detailed company research, valuation, financial history, expectations and auditable model evidence." },
    ],
  }),
  loader: async ({ context, params }) => {
    const detail = await context.queryClient.ensureQueryData(detailQuery(params.assetId));
    if (!detail) throw notFound();
    await Promise.all([
      context.queryClient.ensureQueryData(radarQuery),
      context.queryClient.ensureQueryData(institutionalQuery),
    ]);
  },
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <AppShell>
        <div className="rounded-xl border border-destructive/30 bg-destructive/[0.05] p-5 text-sm text-destructive">
          Failed to load the company research screen: {String(error)}
        </div>
        <button className="mt-3 text-xs underline" onClick={() => { reset(); router.invalidate(); }}>Retry</button>
      </AppShell>
    );
  },
  notFoundComponent: () => (
    <AppShell>
      <div className="rounded-xl border border-border/70 p-6 text-sm">This company is no longer available in the managed research universe.</div>
      <Link to="/radar" className="mt-3 inline-block text-xs underline">Back to Opportunity Radar</Link>
    </AppShell>
  ),
  component: AdvancedResearchPage,
});

function AdvancedResearchPage() {
  const { assetId } = Route.useParams();
  const { data: research } = useSuspenseQuery(detailQuery(assetId));
  const { data: radar } = useSuspenseQuery(radarQuery);
  const { data: institutional } = useSuspenseQuery(institutionalQuery);
  if (!research) return null;

  const candidate = radar.candidates.find((item) => item.assetId === assetId) ?? null;
  const institutionalAnalysis = institutional.analyses.find((item) => item.assetId === assetId) ?? null;
  const opportunity = candidate
    ? presentOpportunityCandidate(candidate, institutionalAnalysis)
    : null;

  return (
    <AppShell>
      <Link
        to="/radar"
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> Back to Opportunity Radar
      </Link>
      <AdvancedSecurityResearchView research={research} opportunity={opportunity} />
    </AppShell>
  );
}
