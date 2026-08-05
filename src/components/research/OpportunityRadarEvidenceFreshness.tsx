import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Clock3, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { OpportunityRadarWorkspace } from "@/lib/opportunity/workspace.functions";
import { cn } from "@/lib/utils";

export function OpportunityRadarEvidenceFreshness({
  workspace,
}: {
  workspace: OpportunityRadarWorkspace;
}) {
  const rows = workspace.candidates.flatMap((candidate) => {
    const freshness = candidate.evidenceFreshness;
    if (!freshness) return [];
    return [{ candidate, freshness }];
  });
  if (rows.length === 0) return null;

  const technicalFresh = rows.filter(({ freshness }) => freshness.technical.state === "fresh").length;
  const fundamentalFresh = rows.filter(({ freshness }) => freshness.fundamentals.state === "fresh").length;
  const fundamentalWarning = rows.filter(({ freshness }) => freshness.fundamentals.state === "warning").length;
  const held = rows.filter(({ freshness }) =>
    ["stale", "missing"].includes(freshness.technical.state) ||
    ["stale", "missing"].includes(freshness.fundamentals.state),
  );

  const examples = held
    .sort((left, right) => severity(right.freshness.technical.state, right.freshness.fundamentals.state) - severity(left.freshness.technical.state, left.freshness.fundamentals.state))
    .slice(0, 8);

  return (
    <section className="mb-5 rounded-xl border border-border/70 bg-card/45 p-4 lg:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 text-primary" />
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Candidate evidence integrity
            </div>
            <h3 className="mt-1 text-sm font-semibold">Freshness is enforced before production eligibility</h3>
            <p className="mt-1 max-w-4xl text-xs leading-5 text-muted-foreground">
              Technical evidence must be recomputed after the latest authoritative EODHD bulk run. Current
              fundamentals are fresh through 45 days, confidence-reduced through 100 days, and excluded once stale.
              A data-age hold moves the thesis into shadow/insufficient evidence rather than falsely classifying the
              underlying company as an Avoid.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 font-mono text-[10px]">
          <Badge variant="outline">Technical fresh {technicalFresh.toLocaleString()}/{rows.length.toLocaleString()}</Badge>
          <Badge variant="outline">Fundamentals fresh {fundamentalFresh.toLocaleString()}</Badge>
          <Badge variant="outline">Fundamentals warning {fundamentalWarning.toLocaleString()}</Badge>
          <Badge variant="outline">Held {held.length.toLocaleString()}</Badge>
        </div>
      </div>

      {examples.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border/60 text-[9px] uppercase tracking-wider text-muted-foreground">
                <th className="px-2 py-2 font-medium">Candidate</th>
                <th className="px-2 py-2 font-medium">Technical</th>
                <th className="px-2 py-2 font-medium">Technical as-of</th>
                <th className="px-2 py-2 font-medium">Fundamentals</th>
                <th className="px-2 py-2 font-medium">Fundamental as-of</th>
              </tr>
            </thead>
            <tbody>
              {examples.map(({ candidate, freshness }) => (
                <tr key={candidate.assetId} className="border-b border-border/40">
                  <td className="px-2 py-2">
                    <Link to="/security/$symbol" params={{ symbol: candidate.symbol }} className="font-semibold hover:underline">
                      {candidate.symbol}
                    </Link>
                    <span className="ml-2 text-muted-foreground">{candidate.name}</span>
                  </td>
                  <FreshnessCell state={freshness.technical.state} />
                  <td className="px-2 py-2 font-mono text-[10px] text-muted-foreground">{formatTimestamp(freshness.technical.asOf)}</td>
                  <FreshnessCell state={freshness.fundamentals.state} />
                  <td className="px-2 py-2 font-mono text-[10px] text-muted-foreground">{formatTimestamp(freshness.fundamentals.asOf)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {held.length > examples.length && (
            <div className="mt-2 text-[10px] text-muted-foreground">
              Showing 8 of {held.length.toLocaleString()} candidates currently held for stale or missing critical evidence.
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.04] p-3 text-xs">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          All candidates with freshness telemetry have current critical market and fundamental evidence.
        </div>
      )}
    </section>
  );
}

function FreshnessCell({ state }: { state: "fresh" | "warning" | "stale" | "missing" }) {
  const Icon = state === "fresh" ? CheckCircle2 : state === "warning" ? Clock3 : AlertTriangle;
  return (
    <td className="px-2 py-2">
      <span className={cn(
        "inline-flex items-center gap-1 font-mono text-[10px] uppercase",
        state === "fresh" ? "text-emerald-600" : state === "warning" ? "text-amber-600" : "text-red-600",
      )}>
        <Icon className="h-3 w-3" /> {state}
      </span>
    </td>
  );
}

function severity(technical: string, fundamentals: string): number {
  const score = (state: string) => state === "missing" ? 3 : state === "stale" ? 2 : state === "warning" ? 1 : 0;
  return score(technical) * 10 + score(fundamentals);
}

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toISOString().replace("T", " ").slice(0, 16) + "Z";
}
