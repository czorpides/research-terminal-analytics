import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronDown,
  CircleDollarSign,
  Eye,
  Landmark,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Telescope,
  TrendingUp,
  WalletCards,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  computeResearchConvictionV2,
  type ConvictionV2Result,
} from "@/lib/opportunity/conviction-v2";
import {
  assessDiscoveryRoutes,
  type DiscoveryProfile,
  type DiscoveryReadiness,
  type DiscoveryRouteKey,
} from "@/lib/opportunity/discovery-routes";
import type {
  InstitutionalAnalysis,
  InstitutionalTier,
} from "@/lib/opportunity/institutional-model";
import type { InstitutionalOpportunityWorkspace } from "@/lib/opportunity/institutional.functions";
import { refreshPriorityOpportunityEvidence } from "@/lib/opportunity/priority.functions";
import type {
  OpportunityCandidate,
  OpportunityRadarWorkspace,
} from "@/lib/opportunity/workspace.functions";
import type { RegimeMonitorPayload } from "@/lib/panels/regime.functions";
import { cn } from "@/lib/utils";
import { OpportunityRadarConvictionViewV2 } from "./OpportunityRadarConvictionViewV2";

interface RankedCandidate {
  candidate: OpportunityCandidate;
  conviction: ConvictionV2Result;
  institutional: InstitutionalAnalysis | null;
  discovery: DiscoveryProfile;
  score: number;
  coverage: number;
  tier: InstitutionalTier;
  hardRisks: string[];
  warnings: string[];
}

type TierFilter = "researchable" | InstitutionalTier | "all";
type MarketFilter = "all" | "US" | "UK" | "EU";
type SortKey = "route" | "integrated" | "quality" | "valuation" | "growth" | "fcf" | "recovery" | "coverage";

const TIER_ORDER: Record<InstitutionalTier, number> = {
  priority: 0,
  qualified: 1,
  watch: 2,
  insufficient: 3,
  avoid: 4,
};

const ROUTE_ORDER: DiscoveryRouteKey[] = [
  "deep_value",
  "broken_but_durable",
  "fundamental_recovery",
  "quality_growth",
  "compounder_reset",
  "capital_allocation",
  "sector_specific",
];

const ROUTE_COPY: Record<DiscoveryRouteKey, { title: string; detail: string }> = {
  deep_value: {
    title: "Deep value",
    detail: "Cheap, cash-backed and financially able to wait for a rerating.",
  },
  broken_but_durable: {
    title: "Broken but durable",
    detail: "Price damage appears worse than the underlying impairment evidence.",
  },
  fundamental_recovery: {
    title: "Fundamental recovery",
    detail: "Revenue, margins, cash flow or leverage are genuinely improving.",
  },
  quality_growth: {
    title: "Quality growth",
    detail: "Strong growth and reinvestment economics at a defensible valuation.",
  },
  compounder_reset: {
    title: "Compounder reset",
    detail: "A high-quality business after a meaningful price or multiple reset.",
  },
  capital_allocation: {
    title: "Capital allocation",
    detail: "FCF is becoming per-share value through buybacks, payouts or deleveraging.",
  },
  sector_specific: {
    title: "Sector-specific",
    detail: "Financial and structurally different businesses use a tailored research lens.",
  },
};

const EU_CODES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR",
  "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK",
]);

export function OpportunityRadarDiscoveryView({
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
  const [routeFilter, setRouteFilter] = useState<DiscoveryRouteKey | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("route");
  const queryClient = useQueryClient();

  const refreshMutation = useMutation({
    mutationFn: (symbol: string) => refreshPriorityOpportunityEvidence({ data: { symbol } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["opportunity-radar"] });
    },
  });

  const analysisByAsset = useMemo(
    () => new Map(institutionalWorkspace.analyses.map((analysis) => [analysis.assetId, analysis])),
    [institutionalWorkspace.analyses],
  );

  const ranked = useMemo(() => {
    const rows = workspace.candidates.map((candidate) =>
      integrateCandidate(candidate, analysisByAsset.get(candidate.assetId) ?? null),
    );
    return rows.sort((left, right) => compareRows(left, right, sortKey));
  }, [analysisByAsset, sortKey, workspace.candidates]);

  const needle = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      ranked.filter((row) => {
        const matchesSearch = !needle || candidateText(row.candidate).includes(needle);
        if (!matchesSearch) return false;

        // A direct company search is diagnostic. It intentionally overrides all
        // shortlist filters so missing, blocked or avoided names cannot disappear.
        if (needle) return true;
        if (!matchesMarket(row.candidate.countryCode, marketFilter)) return false;
        if (routeFilter !== "all" && !row.discovery.routes.some((route) => route.key === routeFilter)) {
          return false;
        }
        if (tierFilter === "all") return true;
        if (tierFilter === "researchable") {
          return ["priority", "qualified", "watch"].includes(row.tier);
        }
        return row.tier === tierFilter;
      }),
    [marketFilter, needle, ranked, routeFilter, tierFilter],
  );

  const counts = countTiers(ranked);
  const routeCounts = Object.fromEntries(
    ROUTE_ORDER.map((key) => [key, ranked.filter((row) => row.discovery.routes.some((route) => route.key === key)).length]),
  ) as Record<DiscoveryRouteKey, number>;

  const shortlist = filtered
    .filter((row) => row.discovery.readiness === "ready" && ["priority", "qualified", "watch"].includes(row.tier))
    .slice(0, 24);
  const shortlistIds = new Set(shortlist.map((row) => row.candidate.assetId));
  const emerging = filtered
    .filter(
      (row) =>
        !shortlistIds.has(row.candidate.assetId) &&
        ["emerging", "coverage_gap"].includes(row.discovery.readiness) &&
        row.discovery.routeScore >= 48,
    )
    .slice(0, 16);
  const visibleRows = filtered.slice(0, 150);
  const searchMatches = needle ? filtered.slice(0, 12) : [];

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-primary/30 bg-primary/[0.06] p-4 lg:p-5">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <h2 className="text-base font-semibold">Discovery first. Validation second.</h2>
            <p className="mt-1 max-w-5xl text-sm leading-6 text-muted-foreground">
              A company can now enter the research population through any credible thesis: deep value,
              durable price damage, fundamental recovery, quality growth, a compounder reset, capital
              allocation or a sector-specific setup. The institutional engine then confirms, weakens or
              rejects that thesis. It no longer needs to look like a low-P/E turnaround before it becomes visible.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusPill label={`${workspace.universe.loaded.toLocaleString()} in universe`} />
              <StatusPill label={`${institutionalWorkspace.universe.assetsWithStatements.toLocaleString()} statement-backed`} />
              <StatusPill label={`${institutionalWorkspace.universe.assetsWithTwoPeriods.toLocaleString()} multi-year`} />
              <StatusPill label="Financial companies included" positive />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border/70 bg-card/55 p-4 lg:p-5">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.8fr)] xl:items-start">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">Find and diagnose</div>
            <h2 className="mt-1 text-lg font-semibold">Search the whole universe, including missing evidence</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              Searching a ticker overrides every filter. A company will appear even when it is Insufficient,
              Avoid or awaiting statements, with a clear explanation and an on-demand evidence refresh.
            </p>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/40 p-3 text-sm leading-6 text-muted-foreground">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <Landmark className="h-4 w-4 text-primary" /> Financial companies are different, not excluded
            </div>
            <p className="mt-1">
              Banks, insurers, lenders, asset managers, exchanges and payments companies are surfaced with
              the correct model warning. Generic industrial net debt/EBITDA is not used as a blanket rejection.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(320px,1fr)_180px_210px_190px_220px]">
          <label className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search PYPL, NOW, company or industry"
              className="h-10 pl-10 text-sm"
            />
          </label>
          <select
            value={tierFilter}
            onChange={(event) => setTierFilter(event.target.value as TierFilter)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="researchable">Researchable</option>
            <option value="priority">Priority</option>
            <option value="qualified">Qualified</option>
            <option value="watch">Watch</option>
            <option value="insufficient">Insufficient</option>
            <option value="avoid">Avoid</option>
            <option value="all">All tiers</option>
          </select>
          <select
            value={routeFilter}
            onChange={(event) => setRouteFilter(event.target.value as DiscoveryRouteKey | "all")}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">All discovery routes</option>
            {ROUTE_ORDER.map((route) => (
              <option key={route} value={route}>{ROUTE_COPY[route].title}</option>
            ))}
          </select>
          <select
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value as SortKey)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="route">Best route</option>
            <option value="integrated">Integrated score</option>
            <option value="quality">Quality</option>
            <option value="valuation">Valuation</option>
            <option value="growth">Revenue growth</option>
            <option value="fcf">FCF margin</option>
            <option value="recovery">Recovery</option>
            <option value="coverage">Coverage</option>
          </select>
          <div className="flex gap-2">
            {(["all", "US", "UK", "EU"] as MarketFilter[]).map((market) => (
              <button
                key={market}
                type="button"
                onClick={() => setMarketFilter(market)}
                className={cn(
                  "h-10 flex-1 rounded-md border px-3 text-xs font-medium transition-colors",
                  marketFilter === market
                    ? "border-primary/60 bg-primary/10 text-foreground"
                    : "border-border/70 text-muted-foreground hover:bg-muted/30 hover:text-foreground",
                )}
              >
                {market === "all" ? "ALL" : market}
              </button>
            ))}
          </div>
        </div>
      </section>

      {needle && (
        <CoverageDiagnostics
          rows={searchMatches}
          refreshingSymbol={refreshMutation.isPending ? refreshMutation.variables : null}
          refreshError={refreshMutation.error instanceof Error ? refreshMutation.error.message : null}
          onRefresh={(symbol) => refreshMutation.mutate(symbol)}
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryTile icon={Telescope} label="Priority" value={counts.priority} detail="Strong route and validation agreement" tone="positive" />
        <SummaryTile icon={Target} label="Qualified" value={counts.qualified} detail="Enough evidence for first-pass research" tone="positive" />
        <SummaryTile icon={Eye} label="Watch" value={counts.watch} detail="Credible thesis, one proof point short" tone="warning" />
        <SummaryTile icon={AlertTriangle} label="Emerging" value={ranked.filter((row) => row.discovery.readiness === "emerging").length} detail="Preliminary route visible despite gaps" tone="warning" />
        <SummaryTile icon={ShieldCheck} label="Avoid" value={counts.avoid} detail="Hard risk or no defensible thesis" tone="negative" />
      </div>

      <section className="rounded-xl border border-border/70 bg-card/45 p-4 lg:p-5">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">Seven ways in</div>
            <h2 className="mt-1 text-lg font-semibold">Parallel discovery routes</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Any one route can nominate a company. The later institutional checks determine how much confidence it deserves.
            </p>
          </div>
          <Badge variant="outline" className="w-fit px-3 py-1 text-xs">
            {ranked.filter((row) => row.discovery.bestRoute).length.toLocaleString()} names have a visible thesis
          </Badge>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
          {ROUTE_ORDER.map((route) => (
            <button
              key={route}
              type="button"
              onClick={() => setRouteFilter(routeFilter === route ? "all" : route)}
              className={cn(
                "rounded-lg border p-3 text-left transition-colors",
                routeFilter === route
                  ? "border-primary/65 bg-primary/10"
                  : "border-border/65 bg-background/25 hover:border-primary/35 hover:bg-muted/20",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-semibold leading-tight">{ROUTE_COPY[route].title}</span>
                <span className="font-mono text-lg font-semibold tabular-nums">{routeCounts[route]}</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{ROUTE_COPY[route].detail}</p>
            </button>
          ))}
        </div>
      </section>

      <CandidateSection
        eyebrow="Primary research queue"
        title="Best current candidates for deeper work"
        description="Up to 24 companies are shown so strong ideas are not lost simply because twelve names ranked marginally higher."
        rows={shortlist}
        empty="No fully validated candidate matches the current filters. The Emerging queue below may still contain credible incomplete ideas."
      />

      <EmergingSection rows={emerging} />

      <section className="overflow-hidden rounded-xl border border-border/70 bg-card/45">
        <div className="flex flex-col gap-2 border-b border-border/60 p-4 lg:flex-row lg:items-end lg:justify-between lg:p-5">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">Full population</div>
            <h2 className="mt-1 text-lg font-semibold">Route, conviction and coverage table</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The most decision-useful information is placed first: thesis, score, coverage and the main unresolved issue.
            </p>
          </div>
          <Badge variant="outline" className="w-fit px-3 py-1 text-xs">{visibleRows.length} shown</Badge>
        </div>
        <DiscoveryTable rows={visibleRows} />
        {filtered.length > visibleRows.length && (
          <div className="border-t border-border/50 p-3 text-center text-xs text-muted-foreground">
            Showing the first {visibleRows.length} of {filtered.length.toLocaleString()} matched companies.
          </div>
        )}
      </section>

      <details className="group rounded-xl border border-border/70 bg-muted/10">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 lg:p-5">
          <div>
            <div className="text-sm font-semibold">Open the previous institutional queue and strict audit trail</div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              The prior interface is retained unchanged for formula-level checking and comparison.
            </p>
          </div>
          <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-border/60 p-4 lg:p-5">
          <OpportunityRadarConvictionViewV2 workspace={workspace} regime={regime} />
        </div>
      </details>
    </div>
  );
}

function CandidateSection({
  eyebrow,
  title,
  description,
  rows,
  empty,
}: {
  eyebrow: string;
  title: string;
  description: string;
  rows: RankedCandidate[];
  empty: string;
}) {
  return (
    <section className="rounded-xl border border-border/70 bg-card/45 p-4 lg:p-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">{eyebrow}</div>
          <h2 className="mt-1 text-lg font-semibold">{title}</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
        </div>
        <Badge variant="outline" className="px-3 py-1 text-xs">{rows.length} visible</Badge>
      </div>
      {rows.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{empty}</div>
      ) : (
        <div className="mt-4 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {rows.map((row, index) => <CandidateCard key={row.candidate.assetId} row={row} rank={index + 1} />)}
        </div>
      )}
    </section>
  );
}

function CandidateCard({ row, rank }: { row: RankedCandidate; rank: number }) {
  const bestRoute = row.discovery.bestRoute;
  return (
    <article className={cn(
      "rounded-xl border bg-background/30 p-4",
      row.tier === "priority"
        ? "border-[var(--positive)]/45"
        : row.tier === "qualified"
          ? "border-primary/40"
          : "border-[var(--warning)]/35",
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[10px] text-muted-foreground">#{rank}</div>
          <div className="mt-0.5 flex items-baseline gap-2">
            <Link to="/security/$symbol" params={{ symbol: row.candidate.symbol }} className="text-xl font-semibold hover:underline">
              {row.candidate.symbol}
            </Link>
            <span className="truncate text-sm text-muted-foreground">{row.candidate.name}</span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {[row.candidate.industryName, row.candidate.countryCode].filter(Boolean).join(" · ")}
          </div>
        </div>
        <TierBadge tier={row.tier} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <ScoreBlock label="Integrated" value={row.score} />
        <ScoreBlock label="Best route" value={row.discovery.routeScore} />
        <ScoreBlock label="Coverage" value={row.coverage} suffix="%" />
      </div>

      <div className="mt-4 rounded-lg border border-primary/25 bg-primary/[0.05] p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">{bestRoute?.label ?? "No formal route"}</span>
          {bestRoute && <span className="font-mono text-sm font-semibold">{bestRoute.score.toFixed(0)}</span>}
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{bestRoute?.thesis ?? row.discovery.reason}</p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {headlineMetrics(row).map((metric) => (
          <div key={metric.label} className="rounded-lg border border-border/60 bg-muted/10 p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{metric.label}</div>
            <div className={cn("mt-1 font-mono text-base font-semibold", metric.tone)}>{metric.value}</div>
          </div>
        ))}
      </div>

      {row.discovery.financialModel && (
        <div className="mt-3 rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/[0.05] p-3 text-xs leading-5 text-muted-foreground">
          <span className="font-semibold text-foreground">{row.discovery.financialModel.label}: </span>
          {row.discovery.financialModel.note}
        </div>
      )}

      <div className="mt-3 border-t border-border/50 pt-3 text-xs leading-5 text-muted-foreground">
        <span className="font-semibold text-foreground">Next proof: </span>
        {bestRoute?.nextProof ?? row.warnings[0] ?? "Review the latest filing, guidance and industry conditions."}
      </div>
    </article>
  );
}

function EmergingSection({ rows }: { rows: RankedCandidate[] }) {
  return (
    <section className="rounded-xl border border-[var(--warning)]/30 bg-[var(--warning)]/[0.035] p-4 lg:p-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--warning)]">Emerging candidates</div>
          <h2 className="mt-1 text-lg font-semibold">Good preliminary ideas that previously disappeared</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            These names have a credible discovery route but incomplete statements, sector evidence or confirmation. They remain visible instead of being silently removed.
          </p>
        </div>
        <Badge variant="outline" className="px-3 py-1 text-xs">{rows.length} shown</Badge>
      </div>
      {rows.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No emerging candidate matches the current filters.
        </div>
      ) : (
        <div className="mt-4 grid gap-2 lg:grid-cols-2 2xl:grid-cols-4">
          {rows.map((row) => (
            <div key={row.candidate.assetId} className="rounded-lg border border-border/65 bg-background/35 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Link to="/security/$symbol" params={{ symbol: row.candidate.symbol }} className="text-base font-semibold hover:underline">
                    {row.candidate.symbol}
                  </Link>
                  <div className="truncate text-xs text-muted-foreground">{row.candidate.name}</div>
                </div>
                <ReadinessBadge readiness={row.discovery.readiness} />
              </div>
              <div className="mt-3 flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium">{row.discovery.bestRoute?.label ?? "Coverage gap"}</span>
                <span className="font-mono text-lg font-semibold">{row.discovery.routeScore.toFixed(0)}</span>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{row.discovery.reason}</p>
              <div className="mt-2 text-[11px] text-muted-foreground">
                Evidence coverage {row.coverage.toFixed(0)}% · {row.institutional?.periodCount ?? 0} annual periods
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function CoverageDiagnostics({
  rows,
  refreshingSymbol,
  refreshError,
  onRefresh,
}: {
  rows: RankedCandidate[];
  refreshingSymbol: string | null;
  refreshError: string | null;
  onRefresh: (symbol: string) => void;
}) {
  return (
    <section className="rounded-xl border border-primary/35 bg-card/55 p-4 lg:p-5">
      <div className="flex items-start gap-3">
        <Search className="mt-0.5 h-5 w-5 text-primary" />
        <div>
          <h2 className="text-lg font-semibold">Coverage diagnostics</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Search results always show why a company is present, missing from the shortlist or waiting for evidence.
          </p>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No matching company is in the managed universe. Check the ticker or run the next universe refresh.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {rows.map((row) => {
            const hasCurrentFundamentals =
              row.candidate.evidence.valuationCompression?.value !== null ||
              row.candidate.evidence.fundamentalResilience?.value !== null;
            const refreshing = refreshingSymbol === row.candidate.symbol;
            return (
              <article key={row.candidate.assetId} className="rounded-lg border border-border/65 bg-background/30 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to="/security/$symbol" params={{ symbol: row.candidate.symbol }} className="text-xl font-semibold hover:underline">
                        {row.candidate.symbol}
                      </Link>
                      <TierBadge tier={row.tier} />
                      <ReadinessBadge readiness={row.discovery.readiness} />
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">{row.candidate.name}</div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 gap-2"
                    disabled={refreshing}
                    onClick={() => onRefresh(row.candidate.symbol)}
                  >
                    <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
                    {refreshing ? "Refreshing evidence" : "Refresh this company now"}
                  </Button>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                  <Diagnostic label="Universe" value="Yes" tone="positive" />
                  <Diagnostic label="Prices" value={priceStatus(row.candidate.priceAsOf)} tone={row.candidate.priceAsOf ? "positive" : "warning"} />
                  <Diagnostic label="Current fundamentals" value={hasCurrentFundamentals ? "Available" : "Missing"} tone={hasCurrentFundamentals ? "positive" : "warning"} />
                  <Diagnostic label="Annual statements" value={`${row.institutional?.periodCount ?? 0} stored`} tone={(row.institutional?.periodCount ?? 0) >= 2 ? "positive" : "warning"} />
                  <Diagnostic label="Piotroski" value={piotroskiStatus(row.candidate)} tone={row.candidate.fundamentalModels.piotroski.state === "complete" ? "positive" : "warning"} />
                  <Diagnostic label="Institutional model" value={row.institutional ? `${row.institutional.coverage.toFixed(0)}% covered` : "Missing"} tone={row.institutional ? "positive" : "warning"} />
                  <Diagnostic label="Best route" value={row.discovery.bestRoute?.label ?? "None yet"} tone={row.discovery.bestRoute ? "positive" : "warning"} />
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <div className="rounded-lg border border-border/60 bg-muted/10 p-3 text-sm leading-6 text-muted-foreground">
                    <span className="font-semibold text-foreground">Why it is not higher: </span>
                    {absenceReason(row)}
                  </div>
                  <div className="rounded-lg border border-border/60 bg-muted/10 p-3 text-sm leading-6 text-muted-foreground">
                    <span className="font-semibold text-foreground">Model treatment: </span>
                    {row.discovery.financialModel?.note ?? "The standard operating-company model applies."}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {refreshError && <p className="mt-3 text-sm text-destructive">Refresh failed: {refreshError}</p>}
    </section>
  );
}

function DiscoveryTable({ rows }: { rows: RankedCandidate[] }) {
  if (!rows.length) return <div className="p-10 text-center text-sm text-muted-foreground">No companies match these filters.</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1500px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border/70 bg-muted/15 text-[10px] uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-3 font-medium">Company</th>
            <th className="px-3 py-3 font-medium">Tier</th>
            <th className="px-3 py-3 font-medium">Best thesis</th>
            <th className="px-3 py-3 text-right font-medium">Route</th>
            <th className="px-3 py-3 text-right font-medium">Integrated</th>
            <th className="px-3 py-3 text-right font-medium">Coverage</th>
            <th className="px-3 py-3 text-right font-medium">Valuation</th>
            <th className="px-3 py-3 text-right font-medium">Quality</th>
            <th className="px-3 py-3 text-right font-medium">Revenue CAGR</th>
            <th className="px-3 py-3 text-right font-medium">FCF margin</th>
            <th className="px-3 py-3 text-right font-medium">ROIC-WACC</th>
            <th className="px-3 py-3 font-medium">Main unresolved issue</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.candidate.assetId} className="border-b border-border/45 align-top hover:bg-muted/[0.08]">
              <td className="px-4 py-3">
                <Link to="/security/$symbol" params={{ symbol: row.candidate.symbol }} className="font-semibold hover:underline">
                  {row.candidate.symbol}
                </Link>
                <div className="max-w-60 truncate text-xs text-muted-foreground">{row.candidate.name}</div>
              </td>
              <td className="px-3 py-3"><TierBadge tier={row.tier} /></td>
              <td className="max-w-72 px-3 py-3">
                <div className="font-medium">{row.discovery.bestRoute?.label ?? "No route"}</div>
                {row.discovery.financialModel && <div className="mt-1 text-xs text-[var(--warning)]">{row.discovery.financialModel.label}</div>}
              </td>
              <NumberCell value={row.discovery.routeScore.toFixed(0)} />
              <NumberCell value={row.score.toFixed(0)} />
              <NumberCell value={`${row.coverage.toFixed(0)}%`} />
              <NumberCell value={formatScore(row.candidate.evidence.valuationCompression?.value)} />
              <NumberCell value={formatScore(row.candidate.evidence.fundamentalResilience?.value)} />
              <NumberCell value={formatPct(row.institutional?.rawMetrics.revenueCagr)} />
              <NumberCell value={formatPct(row.institutional?.rawMetrics.fcfMargin)} />
              <NumberCell value={formatPct(row.institutional?.rawMetrics.roicWaccSpread)} />
              <td className="max-w-96 px-3 py-3 text-xs leading-5 text-muted-foreground">
                {row.discovery.bestRoute?.nextProof ?? row.warnings[0] ?? row.discovery.reason}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function integrateCandidate(
  candidate: OpportunityCandidate,
  institutional: InstitutionalAnalysis | null,
): RankedCandidate {
  const conviction = assessCandidate(candidate);
  const discovery = assessDiscoveryRoutes({ candidate, conviction, institutional });
  const hardRisks = unique([...(institutional?.hardRisks ?? []), ...conviction.hardRisks]);
  const warnings = unique([...(institutional?.warnings ?? []), ...conviction.warnings]);
  const score = institutional
    ? institutional.score * 0.48 + conviction.score * 0.32 + discovery.routeScore * 0.2
    : conviction.score * 0.55 + discovery.routeScore * 0.45;
  const coverage = institutional
    ? institutional.coverage * 0.55 + conviction.coverage * 0.45
    : conviction.coverage * 0.45;

  let tier: InstitutionalTier;
  if (hardRisks.length) tier = "avoid";
  else if (discovery.readiness === "ready") {
    tier = score >= 70 && coverage >= 40 ? "priority" : score >= 58 ? "qualified" : "watch";
  } else if (discovery.readiness === "emerging") tier = "watch";
  else if (discovery.readiness === "coverage_gap") tier = "insufficient";
  else tier = score < 38 ? "avoid" : "insufficient";

  return {
    candidate,
    conviction,
    institutional,
    discovery,
    score: round1(hardRisks.length ? Math.min(score, 34) : score),
    coverage: round1(coverage),
    tier,
    hardRisks,
    warnings,
  };
}

function assessCandidate(candidate: OpportunityCandidate): ConvictionV2Result {
  const result = candidate.horizons.one_to_three;
  const isFinancial = candidate.industryCode === "SEC_FIN";
  return computeResearchConvictionV2({
    valuation: candidate.evidence.valuationCompression?.value ?? null,
    quality: candidate.evidence.fundamentalResilience?.value ?? null,
    priceDislocation: candidate.evidence.priceDislocation?.value ?? null,
    recoveryConfirmation: candidate.evidence.recoveryConfirmation?.value ?? null,
    balanceSheetDurability: candidate.evidence.balanceSheetDurability?.value ?? null,
    impairmentRisk: candidate.evidence.impairmentRisk?.value ?? null,
    dataConfidence: result.dataConfidence,
    // Financial companies are surfaced with an explicit sector note. The
    // generic horizon block is not allowed to become an automatic Avoid gate.
    sectorModelBlocked: result.modelState === "blocked" && !isFinancial,
    piotroski: candidate.fundamentalModels.piotroski,
    magicFormula: {
      state: candidate.fundamentalModels.magicFormula.state,
      universePercentile: candidate.fundamentalModels.magicFormula.universePercentile,
      industryPercentile: candidate.fundamentalModels.magicFormula.industryPercentile,
      exclusionReason: candidate.fundamentalModels.magicFormula.exclusionReason,
    },
  });
}

function compareRows(left: RankedCandidate, right: RankedCandidate, sortKey: SortKey): number {
  const tier = TIER_ORDER[left.tier] - TIER_ORDER[right.tier];
  if (sortKey === "route") return right.discovery.routeScore - left.discovery.routeScore || tier || right.score - left.score;
  if (sortKey === "integrated") return tier || right.score - left.score;
  if (sortKey === "coverage") return right.coverage - left.coverage || tier;
  if (sortKey === "quality") return scoreValue(right.candidate.evidence.fundamentalResilience?.value) - scoreValue(left.candidate.evidence.fundamentalResilience?.value) || tier;
  if (sortKey === "valuation") return scoreValue(right.candidate.evidence.valuationCompression?.value) - scoreValue(left.candidate.evidence.valuationCompression?.value) || tier;
  if (sortKey === "recovery") return scoreValue(right.candidate.evidence.recoveryConfirmation?.value) - scoreValue(left.candidate.evidence.recoveryConfirmation?.value) || tier;
  if (sortKey === "growth") return metricValue(right, "revenueCagr") - metricValue(left, "revenueCagr") || tier;
  return metricValue(right, "fcfMargin") - metricValue(left, "fcfMargin") || tier;
}

function headlineMetrics(row: RankedCandidate): Array<{ label: string; value: string; tone: string }> {
  return [
    metricHeadline("Valuation", row.candidate.evidence.valuationCompression?.value),
    metricHeadline("Quality", row.candidate.evidence.fundamentalResilience?.value),
    pctHeadline("Revenue CAGR", row.institutional?.rawMetrics.revenueCagr, true),
    pctHeadline("FCF margin", row.institutional?.rawMetrics.fcfMargin, true),
  ];
}

function metricHeadline(label: string, value: number | null | undefined) {
  const number = finite(value);
  return {
    label,
    value: number === null ? "—" : `${number.toFixed(0)}/100`,
    tone: number === null ? "text-muted-foreground" : number >= 62 ? "text-[var(--positive)]" : number < 38 ? "text-destructive" : "text-foreground",
  };
}

function pctHeadline(label: string, value: number | null | undefined, higherBetter: boolean) {
  const number = finite(value);
  const positive = number !== null && (higherBetter ? number >= 0.06 : number <= 0.03);
  const risk = number !== null && (higherBetter ? number < 0 : number > 0.1);
  return {
    label,
    value: formatPct(number),
    tone: number === null ? "text-muted-foreground" : positive ? "text-[var(--positive)]" : risk ? "text-destructive" : "text-foreground",
  };
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
  tone: "positive" | "warning" | "negative";
}) {
  return (
    <div className={cn(
      "rounded-xl border bg-card/50 p-4",
      tone === "positive" ? "border-[var(--positive)]/35" : tone === "warning" ? "border-[var(--warning)]/35" : "border-destructive/35",
    )}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-2 font-mono text-3xl font-semibold tabular-nums">{value}</div>
        </div>
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</div>
    </div>
  );
}

function StatusPill({ label, positive = false }: { label: string; positive?: boolean }) {
  return (
    <span className={cn(
      "rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-wide",
      positive ? "border-[var(--positive)]/40 text-[var(--positive)]" : "border-border/70 text-muted-foreground",
    )}>{label}</span>
  );
}

function ScoreBlock({ label, value, suffix = "" }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/10 p-2.5 text-center">
      <div className="font-mono text-xl font-semibold tabular-nums">{value.toFixed(0)}{suffix}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function TierBadge({ tier }: { tier: InstitutionalTier }) {
  return (
    <Badge variant="outline" className={cn(
      "whitespace-nowrap px-2.5 py-1 font-mono text-[9px] uppercase",
      tier === "priority"
        ? "border-[var(--positive)]/55 text-[var(--positive)]"
        : tier === "qualified"
          ? "border-primary/55 text-primary"
          : tier === "watch"
            ? "border-[var(--warning)]/55 text-[var(--warning)]"
            : tier === "avoid"
              ? "border-destructive/55 text-destructive"
              : "text-muted-foreground",
    )}>{tier}</Badge>
  );
}

function ReadinessBadge({ readiness }: { readiness: DiscoveryReadiness }) {
  const label = readiness === "ready" ? "Route ready" : readiness === "emerging" ? "Emerging" : readiness === "coverage_gap" ? "Coverage gap" : "No route";
  return <Badge variant="outline" className="whitespace-nowrap text-[9px] uppercase text-muted-foreground">{label}</Badge>;
}

function Diagnostic({ label, value, tone }: { label: string; value: string; tone: "positive" | "warning" }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/10 p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-sm font-semibold", tone === "positive" ? "text-[var(--positive)]" : "text-[var(--warning)]")}>{value}</div>
    </div>
  );
}

function NumberCell({ value }: { value: string }) {
  return <td className="px-3 py-3 text-right font-mono tabular-nums">{value}</td>;
}

function countTiers(rows: RankedCandidate[]) {
  return {
    priority: rows.filter((row) => row.tier === "priority").length,
    qualified: rows.filter((row) => row.tier === "qualified").length,
    watch: rows.filter((row) => row.tier === "watch").length,
    avoid: rows.filter((row) => row.tier === "avoid").length,
    insufficient: rows.filter((row) => row.tier === "insufficient").length,
  };
}

function absenceReason(row: RankedCandidate): string {
  if (row.hardRisks.length) return row.hardRisks[0];
  if (!row.institutional) return "Annual statement history has not yet produced an institutional analysis. Use the priority refresh rather than waiting for the rotating batch.";
  if (row.discovery.readiness === "coverage_gap") return row.institutional.dataGaps[0] ?? "Evidence coverage is below the threshold for a fair comparison.";
  if (row.discovery.readiness === "emerging") return row.discovery.bestRoute?.nextProof ?? "The route needs one further confirmation.";
  if (row.tier === "insufficient") return row.warnings[0] ?? "No route has enough independent supporting evidence.";
  return row.warnings[0] ?? "The candidate is visible and ranked under the selected route.";
}

function priceStatus(value: string | null): string {
  if (!value) return "Missing";
  const age = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(age)) return value;
  const days = Math.max(0, Math.floor(age / 86_400_000));
  return days <= 7 ? `Current · ${days}d` : `Stale · ${days}d`;
}

function piotroskiStatus(candidate: OpportunityCandidate): string {
  const model = candidate.fundamentalModels.piotroski;
  if (model.state === "complete") return `${model.score ?? 0}/9`;
  if (model.state === "partial") return `${model.provisionalScore ?? 0} passes · ${model.coverage.toFixed(0)}%`;
  return "Missing";
}

function candidateText(candidate: OpportunityCandidate): string {
  return `${candidate.symbol} ${candidate.name} ${candidate.industryName ?? ""}`.toLowerCase();
}

function matchesMarket(countryCode: string, filter: MarketFilter): boolean {
  if (filter === "all") return true;
  if (filter === "US") return countryCode === "US";
  if (filter === "UK") return countryCode === "GB" || countryCode === "UK";
  return EU_CODES.has(countryCode);
}

function metricValue(row: RankedCandidate, key: string): number {
  return finite(row.institutional?.rawMetrics[key]) ?? -999;
}

function scoreValue(value: number | null | undefined): number {
  return finite(value) ?? -999;
}

function formatScore(value: number | null | undefined): string {
  const number = finite(value);
  return number === null ? "—" : number.toFixed(0);
}

function formatPct(value: number | null | undefined): string {
  const number = finite(value);
  return number === null ? "—" : `${(number * 100).toFixed(1)}%`;
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
