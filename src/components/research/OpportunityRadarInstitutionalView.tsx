import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  BarChart3,
  BrainCircuit,
  ChevronDown,
  CircleDollarSign,
  Gauge,
  Search,
  ShieldAlert,
  Target,
  Telescope,
  WalletCards,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  computeResearchConvictionV2,
  type ConvictionV2Result,
} from "@/lib/opportunity/conviction-v2";
import type {
  InstitutionalAnalysis,
  InstitutionalLens,
  InstitutionalTier,
} from "@/lib/opportunity/institutional-model";
import type { InstitutionalOpportunityWorkspace } from "@/lib/opportunity/institutional.functions";
import type {
  OpportunityCandidate,
  OpportunityRadarWorkspace,
} from "@/lib/opportunity/workspace.functions";
import type { RegimeMonitorPayload } from "@/lib/panels/regime.functions";
import { cn } from "@/lib/utils";
import { OpportunityRadarConvictionViewV2 } from "./OpportunityRadarConvictionViewV2";

interface IntegratedCandidate {
  candidate: OpportunityCandidate;
  conviction: ConvictionV2Result;
  institutional: InstitutionalAnalysis | null;
  score: number;
  coverage: number;
  tier: InstitutionalTier;
  strengths: string[];
  warnings: string[];
  hardRisks: string[];
  researchCases: string[];
  nextProof: string[];
}

type TierFilter = "researchable" | InstitutionalTier | "all";
type MarketFilter = "all" | "US" | "UK" | "EU";

const TIER_ORDER: Record<InstitutionalTier, number> = {
  priority: 0,
  qualified: 1,
  watch: 2,
  insufficient: 3,
  avoid: 4,
};

const EU_CODES = new Set([
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DE",
  "DK",
  "EE",
  "ES",
  "FI",
  "FR",
  "GR",
  "HU",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SE",
  "SI",
  "SK",
]);

export function OpportunityRadarInstitutionalView({
  workspace,
  institutionalWorkspace,
  regime,
}: {
  workspace: OpportunityRadarWorkspace;
  institutionalWorkspace: InstitutionalOpportunityWorkspace;
  regime: RegimeMonitorPayload;
}) {
  const [query, setQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<TierFilter>("researchable");
  const [marketFilter, setMarketFilter] = useState<MarketFilter>("all");
  const [caseFilter, setCaseFilter] = useState("all");

  const analysisByAsset = useMemo(
    () => new Map(institutionalWorkspace.analyses.map((analysis) => [analysis.assetId, analysis])),
    [institutionalWorkspace.analyses],
  );
  const ranked = useMemo(
    () =>
      workspace.candidates
        .map((candidate) => integrateCandidate(candidate, analysisByAsset.get(candidate.assetId) ?? null))
        .sort(
          (left, right) =>
            TIER_ORDER[left.tier] - TIER_ORDER[right.tier] ||
            right.score - left.score ||
            right.coverage - left.coverage ||
            right.conviction.agreement - left.conviction.agreement,
        ),
    [analysisByAsset, workspace.candidates],
  );

  const availableCases = useMemo(
    () =>
      [...new Set(ranked.flatMap((row) => row.researchCases))].sort((left, right) =>
        caseLabel(left).localeCompare(caseLabel(right)),
      ),
    [ranked],
  );
  const counts = countTiers(ranked);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return ranked.filter((row) => {
      if (
        needle &&
        !`${row.candidate.symbol} ${row.candidate.name} ${row.candidate.industryName ?? ""}`
          .toLowerCase()
          .includes(needle)
      ) {
        return false;
      }
      if (!matchesMarket(row.candidate.countryCode, marketFilter)) return false;
      if (caseFilter !== "all" && !row.researchCases.includes(caseFilter)) return false;
      if (tierFilter === "all") return true;
      if (tierFilter === "researchable") return ["priority", "qualified", "watch"].includes(row.tier);
      return row.tier === tierFilter;
    });
  }, [caseFilter, marketFilter, query, ranked, tierFilter]);
  const shortlist = filtered
    .filter((row) => ["priority", "qualified", "watch"].includes(row.tier))
    .slice(0, 12);
  const visibleRows = filtered.slice(0, 100);

  return (
    <div className="space-y-3">
      <section className="rounded-md border border-primary/35 bg-primary/5 p-3">
        <div className="flex items-start gap-2">
          <BrainCircuit className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <div className="text-xs font-semibold">Institutional conviction now sits above cheapness</div>
            <p className="mt-1 max-w-6xl text-[11px] leading-relaxed text-muted-foreground">
              The final queue combines the existing valuation, quality, Piotroski, Magic Formula,
              dislocation and recovery evidence with seven deeper statement-based lenses. Low multiples
              cannot offset negative cash generation, severe leverage, poor reinvestment economics or
              elevated accounting risk. Missing fields reduce coverage rather than being silently estimated.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge variant="outline" className="font-mono text-[9px]">
                {institutionalWorkspace.status.toUpperCase()}
              </Badge>
              <Badge variant="outline" className="font-mono text-[9px]">
                {institutionalWorkspace.universe.assetsWithStatements.toLocaleString()} statement-backed
              </Badge>
              <Badge variant="outline" className="font-mono text-[9px]">
                {institutionalWorkspace.universe.assetsWithTwoPeriods.toLocaleString()} multi-year
              </Badge>
              <Badge variant="outline" className="font-mono text-[9px]">
                {institutionalWorkspace.calcVersion}
              </Badge>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryTile icon={Telescope} label="Priority research" value={counts.priority} detail="Both engines strongly agree" tone="positive" />
        <SummaryTile icon={Target} label="Qualified research" value={counts.qualified} detail="Enough evidence for first-pass work" tone="positive" />
        <SummaryTile icon={Gauge} label="Watchlist" value={counts.watch} detail="A credible case needs more proof" tone="warning" />
        <SummaryTile icon={ShieldAlert} label="Avoid / trap risk" value={counts.avoid} detail="Hard financial or accounting gate" tone="negative" />
        <SummaryTile icon={BarChart3} label="Insufficient evidence" value={counts.insufficient} detail="Coverage blocks a confident rank" tone="neutral" />
      </div>

      <section className="rounded-md border border-border/70 bg-card/35 p-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
              Integrated research queue
            </div>
            <h2 className="mt-0.5 text-sm font-semibold">Which cheap or recovering companies are strongest underneath?</h2>
            <p className="mt-1 max-w-5xl text-[10px] leading-relaxed text-muted-foreground">
              The integrated score gives 58% influence to cash generation, implied expectations, returns,
              leverage, operating trajectory, capital allocation and accounting risk; 42% remains with the
              existing opportunity-conviction model. Hard risks override both scores.
            </p>
          </div>
          <Badge variant="outline" className="w-fit font-mono text-[9px]">
            {workspace.universe.loaded.toLocaleString()} assessed · {filtered.length.toLocaleString()} matched
          </Badge>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(280px,1fr)_180px_230px_220px]">
          <label className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search company, ticker or industry"
              className="h-8 pl-8 text-xs"
            />
          </label>
          <select
            value={tierFilter}
            onChange={(event) => setTierFilter(event.target.value as TierFilter)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="researchable">Priority + qualified + watch</option>
            <option value="priority">Priority research</option>
            <option value="qualified">Qualified research</option>
            <option value="watch">Watchlist</option>
            <option value="avoid">Avoid / value-trap risk</option>
            <option value="insufficient">Insufficient evidence</option>
            <option value="all">All companies</option>
          </select>
          <select
            value={caseFilter}
            onChange={(event) => setCaseFilter(event.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="all">All integrated research cases</option>
            {availableCases.map((researchCase) => (
              <option key={researchCase} value={researchCase}>
                {caseLabel(researchCase)}
              </option>
            ))}
          </select>
          <div className="flex gap-1.5">
            {(["all", "US", "UK", "EU"] as MarketFilter[]).map((market) => (
              <button
                key={market}
                type="button"
                onClick={() => setMarketFilter(market)}
                className={cn(
                  "h-8 flex-1 rounded border px-2 text-[10px]",
                  marketFilter === market
                    ? "border-primary/55 bg-primary/10 text-foreground"
                    : "border-border/70 text-muted-foreground hover:text-foreground",
                )}
              >
                {market === "all" ? "ALL" : market}
              </button>
            ))}
          </div>
        </div>
      </section>

      <InstitutionalShortlist rows={shortlist} />

      <section className="rounded-md border border-border/70 bg-card/35">
        <header className="border-b border-border/60 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                Full integrated population
              </div>
              <h2 className="mt-0.5 text-sm font-semibold">Conviction and value-trap evidence table</h2>
              <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                Open Analysis to inspect every formula, input, coverage gap, hard gate and next proof required.
              </p>
            </div>
            <Badge variant="outline" className="font-mono text-[9px]">
              {visibleRows.length} shown
            </Badge>
          </div>
        </header>
        <IntegratedTable rows={visibleRows} />
        {filtered.length > visibleRows.length && (
          <div className="border-t border-border/50 p-2 text-center text-[10px] text-muted-foreground">
            Showing the first {visibleRows.length} of {filtered.length.toLocaleString()} matched companies.
          </div>
        )}
      </section>

      {institutionalWorkspace.warnings.length > 0 && (
        <section className="rounded-md border border-[var(--warning)]/35 bg-[var(--warning)]/5 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warning)]" />
            <div>
              <div className="text-xs font-semibold">Institutional engine data warnings</div>
              <div className="mt-1 space-y-1 text-[10px] text-muted-foreground">
                {institutionalWorkspace.warnings.slice(0, 6).map((warning) => (
                  <div key={warning}>{warning}</div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      <details className="group rounded-md border border-border/70 bg-muted/15">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3">
          <div>
            <div className="text-xs font-semibold">Open the previous conviction queue and strict audit trail</div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              The existing model is retained unchanged for comparison, validation and diagnosis.
            </p>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-border/60 p-3">
          <OpportunityRadarConvictionViewV2 workspace={workspace} regime={regime} />
        </div>
      </details>
    </div>
  );
}

function InstitutionalShortlist({ rows }: { rows: IntegratedCandidate[] }) {
  return (
    <section className="rounded-md border border-border/70 bg-card/35 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
            Institutional shortlist
          </div>
          <h2 className="mt-0.5 text-sm font-semibold">Best current candidates for deeper research</h2>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Cards show the strongest operating evidence and the most important unresolved value-trap check.
          </p>
        </div>
        <Badge variant="outline" className="font-mono text-[9px]">
          {rows.length} prioritised
        </Badge>
      </div>
      {rows.length === 0 ? (
        <div className="mt-3 rounded border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
          No company currently satisfies the selected integrated filters. Switch to All companies to distinguish
          weak economics from incomplete annual-statement coverage.
        </div>
      ) : (
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {rows.map((row, index) => (
            <article
              key={row.candidate.assetId}
              className={cn(
                "rounded-md border bg-background/25 p-3",
                row.tier === "priority"
                  ? "border-[var(--positive)]/50"
                  : row.tier === "qualified"
                    ? "border-primary/45"
                    : "border-[var(--warning)]/40",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-mono text-[9px] text-muted-foreground">#{index + 1}</div>
                  <Link
                    to="/security/$symbol"
                    params={{ symbol: row.candidate.symbol }}
                    className="text-sm font-semibold hover:underline"
                  >
                    {row.candidate.symbol}
                  </Link>
                  <div className="truncate text-[9px] text-muted-foreground">{row.candidate.name}</div>
                </div>
                <TierBadge tier={row.tier} />
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <ScoreMini label="Integrated" value={row.score} />
                <ScoreMini label="Institutional" value={row.institutional?.score ?? null} />
                <ScoreMini label="Conviction" value={row.conviction.score} />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-1.5 text-[9px]">
                {headlineMetrics(row.institutional).map((item) => (
                  <div key={item.label} className="rounded border border-border/55 bg-muted/15 p-1.5">
                    <div className="text-muted-foreground">{item.label}</div>
                    <div className={cn("mt-0.5 font-mono font-semibold", item.tone)}>{item.value}</div>
                  </div>
                ))}
              </div>

              <div className="mt-2 min-h-12 text-[10px] leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground">Why it qualifies: </span>
                {row.strengths[0] ?? row.conviction.confirmations[0] ?? "Evidence is mixed rather than decisively positive."}
              </div>
              <div className="mt-2 min-h-10 border-t border-border/45 pt-2 text-[9px] leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground">Main unresolved check: </span>
                {row.nextProof[0] ?? "Review the latest filing, guidance and sector conditions."}
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className={cn("text-[9px]", row.hardRisks.length ? "text-destructive" : "text-[var(--warning)]") }>
                  {row.hardRisks.length
                    ? `${row.hardRisks.length} hard risk${row.hardRisks.length === 1 ? "" : "s"}`
                    : `${row.warnings.length} warning${row.warnings.length === 1 ? "" : "s"}`}
                </span>
                <IntegratedAnalysisDialog row={row} />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function IntegratedTable({ rows }: { rows: IntegratedCandidate[] }) {
  if (!rows.length) {
    return <div className="p-10 text-center text-xs text-muted-foreground">No companies match these filters.</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1500px] border-collapse text-left text-[11px]">
        <thead>
          <tr className="border-b border-border/70 text-[9px] uppercase tracking-wider text-muted-foreground">
            <th className="px-2 py-2 font-medium">Rank</th>
            <th className="px-2 py-2 font-medium">Company</th>
            <th className="px-2 py-2 font-medium">Tier</th>
            <th className="px-2 py-2 text-right font-medium">Integrated</th>
            <th className="px-2 py-2 text-right font-medium">Institutional</th>
            <th className="px-2 py-2 text-right font-medium">Coverage</th>
            <th className="px-2 py-2 text-right font-medium">FCF margin</th>
            <th className="px-2 py-2 text-right font-medium">Revenue CAGR</th>
            <th className="px-2 py-2 text-right font-medium">ROIC-WACC</th>
            <th className="px-2 py-2 text-right font-medium">Net debt/EBITDA</th>
            <th className="px-2 py-2 text-right font-medium">Implied FCFF growth</th>
            <th className="px-2 py-2 text-right font-medium">Beneish</th>
            <th className="px-2 py-2 font-medium">Research case</th>
            <th className="px-2 py-2 font-medium">Analysis</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.candidate.assetId} className="border-b border-border/45 align-top">
              <td className="px-2 py-2 font-mono text-[10px] text-muted-foreground">{index + 1}</td>
              <td className="px-2 py-2">
                <Link
                  to="/security/$symbol"
                  params={{ symbol: row.candidate.symbol }}
                  className="font-semibold hover:underline"
                >
                  {row.candidate.symbol}
                </Link>
                <div className="max-w-56 truncate text-[9px] text-muted-foreground">{row.candidate.name}</div>
              </td>
              <td className="px-2 py-2"><TierBadge tier={row.tier} /></td>
              <MetricCell value={row.score.toFixed(0)} />
              <MetricCell value={row.institutional ? row.institutional.score.toFixed(0) : "—"} />
              <MetricCell value={`${row.coverage.toFixed(0)}%`} />
              <MetricCell value={formatPct(row.institutional?.rawMetrics.fcfMargin)} />
              <MetricCell value={formatPct(row.institutional?.rawMetrics.revenueCagr)} />
              <MetricCell value={formatPct(row.institutional?.rawMetrics.roicWaccSpread)} />
              <MetricCell value={formatMultiple(row.institutional?.rawMetrics.netDebtEbitda)} />
              <MetricCell value={formatPct(row.institutional?.rawMetrics.impliedFcffGrowth5y)} />
              <MetricCell value={formatNumber(row.institutional?.rawMetrics.beneishMScore, 2)} />
              <td className="max-w-80 px-2 py-2 text-[9px] text-muted-foreground">
                {row.researchCases.slice(0, 3).map(caseLabel).join(" · ") || "No formal case"}
              </td>
              <td className="px-2 py-2"><IntegratedAnalysisDialog row={row} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IntegratedAnalysisDialog({ row }: { row: IntegratedCandidate }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-6 px-2 text-[9px]">
          Analysis
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {row.candidate.symbol} · {row.candidate.name}
            <TierBadge tier={row.tier} />
          </DialogTitle>
          <DialogDescription>
            Integrated institutional and opportunity-conviction evidence. This is a research-priority assessment,
            not an investment recommendation.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <DialogScore label="Integrated score" value={row.score} detail={`${row.coverage.toFixed(0)}% combined coverage`} />
          <DialogScore label="Institutional score" value={row.institutional?.score ?? null} detail={row.institutional ? `${row.institutional.coverage.toFixed(0)}% statement coverage` : "No statement analysis"} />
          <DialogScore label="Opportunity conviction" value={row.conviction.score} detail={`${row.conviction.confirmingCount}/${row.conviction.availableCount} lenses confirm`} />
          <DialogScore label="Industry percentile" value={row.institutional?.peerPercentile ?? null} detail="Institutional score versus available peers" suffix="th" />
        </div>

        <section className="rounded-md border border-border/70 p-3">
          <div className="flex items-center gap-2">
            <CircleDollarSign className="h-4 w-4 text-primary" />
            <h3 className="text-xs font-semibold">Market-implied expectations and economic value</h3>
          </div>
          {row.institutional ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <ExpectationBox label="Modelled WACC" value={formatPct(row.institutional.expectations.modelledWacc)} />
              <ExpectationBox label="ROIC - WACC" value={formatPct(row.institutional.expectations.roicWaccSpread)} />
              <ExpectationBox label="Implied 5-year FCFF growth" value={formatPct(row.institutional.expectations.impliedFcffGrowth5y)} />
              <ExpectationBox label="Historical revenue CAGR" value={formatPct(row.institutional.expectations.historicalRevenueCagr)} />
              <ExpectationBox label="Incremental ROIC" value={formatPct(row.institutional.expectations.incrementalRoic)} />
              <ExpectationBox label="Reinvestment-supported growth" value={formatPct(row.institutional.expectations.sustainableGrowth)} />
              <ExpectationBox label="Excess-return duration proxy" value={formatYears(row.institutional.expectations.impliedExcessReturnYears)} />
              <ExpectationBox label="Economic profit" value={formatCompactMoney(row.institutional.expectations.economicProfit, row.candidate.currency)} />
              <p className="sm:col-span-2 lg:col-span-4 text-[9px] leading-relaxed text-muted-foreground">
                {row.institutional.expectations.detail}
              </p>
            </div>
          ) : (
            <div className="mt-3 text-[10px] text-muted-foreground">No raw annual statement history is available for this company.</div>
          )}
        </section>

        <section className="rounded-md border border-border/70 p-3">
          <div className="flex items-center gap-2">
            <WalletCards className="h-4 w-4 text-primary" />
            <h3 className="text-xs font-semibold">Seven institutional lenses</h3>
          </div>
          {row.institutional ? (
            <div className="mt-3 grid gap-2 lg:grid-cols-2">
              {row.institutional.lenses.map((lens) => <LensCard key={lens.key} lens={lens} />)}
            </div>
          ) : (
            <div className="mt-3 text-[10px] text-muted-foreground">No institutional lens scores are available.</div>
          )}
        </section>

        <div className="grid gap-3 lg:grid-cols-2">
          <EvidenceList title="Why the candidate may deserve research" items={row.strengths} tone="positive" />
          <EvidenceList title="Warnings and unresolved value-trap checks" items={row.warnings} tone="warning" />
          <EvidenceList title="Hard gates" items={row.hardRisks} tone="negative" />
          <EvidenceList title="Next proof required" items={row.nextProof} tone="neutral" />
          <EvidenceList title="Data gaps" items={row.institutional?.dataGaps ?? ["No institutional statement analysis is available."]} tone="neutral" />
          <EvidenceList title="Research cases" items={row.researchCases.map(caseLabel)} tone="positive" />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LensCard({ lens }: { lens: InstitutionalLens }) {
  return (
    <article className="rounded border border-border/60 bg-muted/10 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] font-semibold">{lens.label}</div>
          <div className="mt-0.5 text-[9px] text-muted-foreground">{lens.summary}</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-lg font-semibold">{lens.score?.toFixed(0) ?? "—"}</div>
          <div className="text-[8px] text-muted-foreground">{lens.coverage.toFixed(0)}% coverage</div>
        </div>
      </div>
      <div className="mt-2 space-y-1">
        {lens.metrics.map((metric) => (
          <div key={metric.id} className="grid grid-cols-[minmax(0,1fr)_80px_44px] items-center gap-2 text-[9px]">
            <div className="truncate text-muted-foreground" title={metric.detail}>{metric.label}</div>
            <div className={cn("text-right font-mono", signalTone(metric.signal))}>{metric.display}</div>
            <div className="text-right font-mono text-muted-foreground">{metric.score?.toFixed(0) ?? "—"}</div>
          </div>
        ))}
      </div>
    </article>
  );
}

function EvidenceList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "positive" | "warning" | "negative" | "neutral";
}) {
  return (
    <section className={cn(
      "rounded-md border p-3",
      tone === "positive"
        ? "border-[var(--positive)]/35 bg-[var(--positive)]/5"
        : tone === "warning"
          ? "border-[var(--warning)]/35 bg-[var(--warning)]/5"
          : tone === "negative"
            ? "border-destructive/35 bg-destructive/5"
            : "border-border/70 bg-muted/10",
    )}>
      <h3 className="text-xs font-semibold">{title}</h3>
      <div className="mt-2 space-y-1 text-[10px] leading-relaxed text-muted-foreground">
        {items.length ? items.map((item) => <div key={item}>• {item}</div>) : <div>• None identified from available evidence.</div>}
      </div>
    </section>
  );
}

function integrateCandidate(
  candidate: OpportunityCandidate,
  institutional: InstitutionalAnalysis | null,
): IntegratedCandidate {
  const conviction = assessCandidate(candidate);
  const hardRisks = unique([...(institutional?.hardRisks ?? []), ...conviction.hardRisks]);
  const warnings = unique([...(institutional?.warnings ?? []), ...conviction.warnings]);
  const institutionalScore = institutional?.score ?? null;
  const score = institutionalScore === null
    ? conviction.score * 0.55
    : conviction.score * 0.42 + institutionalScore * 0.58;
  const coverage = institutional
    ? conviction.coverage * 0.4 + institutional.coverage * 0.6
    : conviction.coverage * 0.4;
  let tier: InstitutionalTier;
  if (hardRisks.length) tier = "avoid";
  else if (!institutional || coverage < 38 || institutional.coverage < 30) tier = "insufficient";
  else if (
    score >= 70 &&
    ["priority", "qualified"].includes(conviction.tier) &&
    ["priority", "qualified"].includes(institutional.tier)
  ) tier = "priority";
  else if (score >= 60 && conviction.tier !== "avoid" && institutional.tier !== "avoid") tier = "qualified";
  else if (score >= 48 && conviction.tier !== "avoid" && institutional.tier !== "avoid") tier = "watch";
  else tier = "avoid";

  return {
    candidate,
    conviction,
    institutional,
    score: round1(hardRisks.length ? Math.min(score, 34) : score),
    coverage: round1(coverage),
    tier,
    strengths: unique([...(institutional?.strengths ?? []), ...conviction.confirmations]).slice(0, 8),
    warnings: warnings.slice(0, 12),
    hardRisks,
    researchCases: unique([
      ...(institutional?.researchCases ?? []),
      ...conviction.researchCases,
    ]),
    nextProof: unique([...(institutional?.nextProof ?? []), ...conviction.nextProof]).slice(0, 10),
  };
}

function assessCandidate(candidate: OpportunityCandidate): ConvictionV2Result {
  const result = candidate.horizons.one_to_three;
  return computeResearchConvictionV2({
    valuation: candidate.evidence.valuationCompression?.value ?? null,
    quality: candidate.evidence.fundamentalResilience?.value ?? null,
    priceDislocation: candidate.evidence.priceDislocation?.value ?? null,
    recoveryConfirmation: candidate.evidence.recoveryConfirmation?.value ?? null,
    balanceSheetDurability: candidate.evidence.balanceSheetDurability?.value ?? null,
    impairmentRisk: candidate.evidence.impairmentRisk?.value ?? null,
    dataConfidence: result.dataConfidence,
    sectorModelBlocked: result.modelState === "blocked",
    piotroski: candidate.fundamentalModels.piotroski,
    magicFormula: {
      state: candidate.fundamentalModels.magicFormula.state,
      universePercentile: candidate.fundamentalModels.magicFormula.universePercentile,
      industryPercentile: candidate.fundamentalModels.magicFormula.industryPercentile,
      exclusionReason: candidate.fundamentalModels.magicFormula.exclusionReason,
    },
  });
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: typeof Telescope;
  label: string;
  value: number;
  detail: string;
  tone: "positive" | "warning" | "negative" | "neutral";
}) {
  return (
    <div className={cn(
      "rounded-md border bg-card/35 p-3",
      tone === "positive"
        ? "border-[var(--positive)]/35"
        : tone === "warning"
          ? "border-[var(--warning)]/35"
          : tone === "negative"
            ? "border-destructive/35"
            : "border-border/70",
    )}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums">{value}</div>
        </div>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-1 text-[9px] text-muted-foreground">{detail}</div>
    </div>
  );
}

function ScoreMini({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded border border-border/55 bg-muted/10 p-1.5 text-center">
      <div className="font-mono text-base font-semibold">{value === null ? "—" : value.toFixed(0)}</div>
      <div className="text-[8px] text-muted-foreground">{label}</div>
    </div>
  );
}

function DialogScore({
  label,
  value,
  detail,
  suffix = "",
}: {
  label: string;
  value: number | null;
  detail: string;
  suffix?: string;
}) {
  return (
    <div className="rounded-md border border-border/65 bg-muted/10 p-2.5">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-2xl font-semibold">{value === null ? "—" : `${value.toFixed(0)}${suffix}`}</div>
      <div className="mt-1 text-[9px] text-muted-foreground">{detail}</div>
    </div>
  );
}

function ExpectationBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border/55 bg-muted/10 p-2">
      <div className="text-[9px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-semibold">{value}</div>
    </div>
  );
}

function TierBadge({ tier }: { tier: InstitutionalTier }) {
  const label = tier === "priority"
    ? "Priority"
    : tier === "qualified"
      ? "Qualified"
      : tier === "watch"
        ? "Watch"
        : tier === "avoid"
          ? "Avoid"
          : "Insufficient";
  return (
    <Badge
      variant="outline"
      className={cn(
        "whitespace-nowrap font-mono text-[8px] uppercase",
        tier === "priority"
          ? "border-[var(--positive)]/55 text-[var(--positive)]"
          : tier === "qualified"
            ? "border-primary/55 text-primary"
            : tier === "watch"
              ? "border-[var(--warning)]/55 text-[var(--warning)]"
              : tier === "avoid"
                ? "border-destructive/55 text-destructive"
                : "text-muted-foreground",
      )}
    >
      {label}
    </Badge>
  );
}

function MetricCell({ value }: { value: string }) {
  return <td className="px-2 py-2 text-right font-mono tabular-nums">{value}</td>;
}

function headlineMetrics(analysis: InstitutionalAnalysis | null): Array<{ label: string; value: string; tone: string }> {
  if (!analysis) {
    return [
      { label: "FCF margin", value: "—", tone: "text-muted-foreground" },
      { label: "ROIC-WACC", value: "—", tone: "text-muted-foreground" },
      { label: "Net debt/EBITDA", value: "—", tone: "text-muted-foreground" },
      { label: "Revenue CAGR", value: "—", tone: "text-muted-foreground" },
    ];
  }
  return [
    metricHeadline("FCF margin", analysis.rawMetrics.fcfMargin, "pct", true),
    metricHeadline("ROIC-WACC", analysis.rawMetrics.roicWaccSpread, "pct", true),
    metricHeadline("Net debt/EBITDA", analysis.rawMetrics.netDebtEbitda, "multiple", false),
    metricHeadline("Revenue CAGR", analysis.rawMetrics.revenueCagr, "pct", true),
  ];
}

function metricHeadline(
  label: string,
  value: number | null,
  format: "pct" | "multiple",
  higherBetter: boolean,
): { label: string; value: string; tone: string } {
  const display = format === "pct" ? formatPct(value) : formatMultiple(value);
  if (value === null || value === undefined) return { label, value: "—", tone: "text-muted-foreground" };
  const positive = higherBetter ? value > 0.04 : value < 2.5;
  const risk = higherBetter ? value < 0 : value > 5;
  return {
    label,
    value: display,
    tone: positive ? "text-[var(--positive)]" : risk ? "text-destructive" : "text-foreground",
  };
}

function countTiers(rows: IntegratedCandidate[]) {
  return {
    priority: rows.filter((row) => row.tier === "priority").length,
    qualified: rows.filter((row) => row.tier === "qualified").length,
    watch: rows.filter((row) => row.tier === "watch").length,
    avoid: rows.filter((row) => row.tier === "avoid").length,
    insufficient: rows.filter((row) => row.tier === "insufficient").length,
  };
}

function matchesMarket(countryCode: string, filter: MarketFilter): boolean {
  if (filter === "all") return true;
  if (filter === "US") return countryCode === "US";
  if (filter === "UK") return countryCode === "GB" || countryCode === "UK";
  return EU_CODES.has(countryCode);
}

function caseLabel(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function signalTone(signal: InstitutionalLens["metrics"][number]["signal"]): string {
  return signal === "positive"
    ? "text-[var(--positive)]"
    : signal === "risk"
      ? "text-destructive"
      : signal === "warning"
        ? "text-[var(--warning)]"
        : "text-foreground";
}

function formatPct(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "—";
}

function formatMultiple(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)}×` : "—";
}

function formatNumber(value: number | null | undefined, digits = 1): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "—";
}

function formatYears(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(1)} years` : "—";
}

function formatCompactMoney(value: number | null | undefined, currency: string | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency ?? "USD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return value.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });
  }
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
